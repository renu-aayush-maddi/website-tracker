import { promises as dns } from 'node:dns';
import { Agent, request } from 'undici';
import type { HttpMethod, ProbeErrorCode } from '@wt/shared';
import {
  BlockedTargetError,
  InvalidTargetError,
  assertSafeTarget,
  createSafeLookup,
  publicAddressesOnly,
  type AddressPolicy,
  type Resolver,
} from './ssrf.js';

export interface ProbeRequest {
  url: string;
  method: HttpMethod;
  timeoutMs: number;
}

export interface ProbeResult {
  startedAt: Date;
  completedAt: Date;
  /** Total time including redirects; null if no response was received. */
  responseMs: number | null;
  /** Status of the final response; null if no response was received. */
  statusCode: number | null;
  finalUrl: string;
  redirects: number;
  /** Transport-level failure. HTTP status evaluation happens in the caller. */
  errorCode: ProbeErrorCode | null;
  errorMessage: string | null;
}

export interface Prober {
  probe(request: ProbeRequest): Promise<ProbeResult>;
}

export interface ProberOptions {
  addressPolicy?: AddressPolicy;
  /** Skip the hostname blocklist (localhost, *.internal …). Development/testing only. */
  allowLocalHostnames?: boolean;
  resolve?: Resolver;
  maxRedirects?: number;
  /** Bytes of the response body to read before closing the connection. */
  maxBodyBytes?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'WebsiteTracker/1.0 (uptime monitor)';

const defaultResolver: Resolver = (hostname) => dns.lookup(hostname, { all: true, order: 'verbatim' });

export function createProber(options: ProberOptions = {}): Prober {
  const policy = options.addressPolicy ?? publicAddressesOnly;
  const allowLocalHostnames = options.allowLocalHostnames ?? false;
  const lookup = createSafeLookup(options.resolve ?? defaultResolver, policy);
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;

  async function probe(req: ProbeRequest): Promise<ProbeResult> {
    const startedAt = new Date();
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    // A fresh agent per probe: every check measures a real new connection and
    // no pooled socket outlives the request.
    const agent = new Agent({
      connect: { lookup, timeout: req.timeoutMs },
      headersTimeout: req.timeoutMs,
      bodyTimeout: req.timeoutMs,
      keepAliveTimeout: 1,
    });

    let currentUrl = req.url;
    let method: HttpMethod = req.method;
    let redirects = 0;
    let statusCode: number | null = null;

    const finish = (errorCode: ProbeErrorCode | null, errorMessage: string | null): ProbeResult => ({
      startedAt,
      completedAt: new Date(),
      responseMs: statusCode === null ? null : Math.round(performance.now() - start),
      statusCode,
      finalUrl: currentUrl,
      redirects,
      errorCode,
      errorMessage,
    });

    try {
      for (;;) {
        const target = assertSafeTarget(currentUrl, policy, allowLocalHostnames);
        const res = await request(target, {
          method,
          dispatcher: agent,
          signal: controller.signal,
          headers: { 'user-agent': USER_AGENT, accept: '*/*', 'cache-control': 'no-cache' },
          body: method === 'POST' ? '' : null,
        });
        statusCode = res.statusCode;
        const location = res.headers.location;
        await res.body.dump({ limit: maxBodyBytes });

        if (REDIRECT_STATUSES.has(res.statusCode) && location) {
          if (redirects >= maxRedirects) {
            return finish('TOO_MANY_REDIRECTS', `Stopped after ${maxRedirects} redirects`);
          }
          redirects += 1;
          currentUrl = new URL(Array.isArray(location) ? location[0]! : location, currentUrl).toString();
          if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && method === 'POST')) {
            method = 'GET';
          }
          continue;
        }
        return finish(null, null);
      }
    } catch (err) {
      // A response may have arrived before the failure (e.g. a redirect); the
      // reported failure is about the request as a whole.
      statusCode = null;
      if (controller.signal.aborted) return finish('TIMEOUT', `No response within ${req.timeoutMs} ms`);
      const { code, message } = classifyError(err);
      return finish(code, message);
    } finally {
      clearTimeout(timer);
      agent.destroy().catch(() => undefined);
    }
  }

  return { probe };
}

function errorChain(err: unknown): Array<Error & { code?: string }> {
  const chain: Array<Error & { code?: string }> = [];
  let current: unknown = err;
  while (current instanceof Error && chain.length < 6) {
    chain.push(current as Error & { code?: string });
    current = (current as Error & { cause?: unknown }).cause;
  }
  return chain;
}

const TLS_CODE = /^(ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|EPROTO$|HOSTNAME_MISMATCH)/;

export function classifyError(err: unknown): { code: ProbeErrorCode; message: string } {
  const chain = errorChain(err);
  const deepest = chain[chain.length - 1];
  const message = (deepest?.message || 'Request failed').slice(0, 300);

  for (const e of chain) {
    if (e instanceof BlockedTargetError) return { code: 'BLOCKED_TARGET', message: e.message };
    if (e instanceof InvalidTargetError) return { code: 'INVALID_URL', message: e.message };
  }
  for (const e of chain) {
    const code = e.code ?? '';
    if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_NODATA', 'EAI_NONAME', 'EAI_FAIL'].includes(code)) {
      return { code: 'DNS_FAILURE', message };
    }
    if (code === 'ECONNREFUSED') return { code: 'CONNECTION_REFUSED', message };
    if (['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CLOSED'].includes(code)) {
      return { code: 'CONNECTION_RESET', message };
    }
    if (['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ETIMEDOUT'].includes(code)) {
      return { code: 'TIMEOUT', message };
    }
    if (TLS_CODE.test(code)) return { code: 'TLS_ERROR', message };
    if (['EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL'].includes(code)) {
      return { code: 'CONNECTION_FAILED', message };
    }
    if (code === 'UND_ERR_INVALID_ARG' || code === 'ERR_INVALID_URL') return { code: 'INVALID_URL', message };
  }
  return { code: 'UNKNOWN', message };
}
