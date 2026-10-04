import ipaddr from 'ipaddr.js';
import { isBlockedHostname } from '@wt/shared';

/** Decides whether the server may open a connection to a resolved IP address. */
export type AddressPolicy = (address: string) => boolean;

/**
 * Allow-list policy: only globally routable unicast addresses. This rejects
 * loopback, RFC 1918 private ranges, link-local (including the 169.254.169.254
 * cloud metadata endpoint), carrier-grade NAT, multicast, reserved and
 * documentation ranges, IPv6 unique-local, and IPv6 forms that embed an IPv4
 * address (IPv4-mapped, NAT64, 6to4, Teredo).
 */
export const publicAddressesOnly: AddressPolicy = (address) => {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.parse(address).range() === 'unicast';
};

/** Development-only policy used when ALLOW_PRIVATE_TARGETS is set. */
export const anyValidAddress: AddressPolicy = (address) => ipaddr.isValid(address);

export class BlockedTargetError extends Error {
  readonly code = 'ERR_BLOCKED_TARGET';
  constructor(message = 'Target resolves to a private, local or reserved address') {
    super(message);
    this.name = 'BlockedTargetError';
  }
}

export class InvalidTargetError extends Error {
  readonly code = 'ERR_INVALID_TARGET';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTargetError';
  }
}

/** URL.hostname wraps IPv6 literals in brackets. */
export function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Static checks performed before any network activity. DNS-based checks happen
 * at connection time (see createSafeLookup) so they cannot be bypassed by DNS
 * rebinding between validation and use.
 */
export function assertSafeTarget(rawUrl: string, policy: AddressPolicy, allowLocalHostnames: boolean): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InvalidTargetError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidTargetError('Only http and https URLs can be requested');
  }
  if (url.username || url.password) throw new InvalidTargetError('URLs with credentials are not allowed');

  const host = stripBrackets(url.hostname);
  if (ipaddr.isValid(host)) {
    // IP literals never go through DNS lookup, so check them here.
    if (!policy(host)) throw new BlockedTargetError();
  } else if (!allowLocalHostnames && isBlockedHostname(host)) {
    throw new BlockedTargetError('Local and internal hostnames cannot be requested');
  }
  return url;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number,
) => void;

/**
 * A `net.connect` lookup function that resolves the hostname and refuses to
 * connect if ANY resolved address is outside the policy.
 */
export function createSafeLookup(resolve: Resolver, policy: AddressPolicy) {
  return (hostname: string, options: { all?: boolean; family?: number | string }, callback: LookupCallback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) {
          const err: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
          err.code = 'ENOTFOUND';
          callback(err, '');
          return;
        }
        if (addresses.some((a) => !policy(a.address))) {
          callback(new BlockedTargetError() as NodeJS.ErrnoException, '');
          return;
        }
        const family = Number(options.family) || 0;
        const usable = family ? addresses.filter((a) => a.family === family) : addresses;
        const chosen = usable.length > 0 ? usable : addresses;
        if (options.all) callback(null, chosen);
        else callback(null, chosen[0]!.address, chosen[0]!.family);
      },
      (err: NodeJS.ErrnoException) => callback(err, ''),
    );
  };
}
