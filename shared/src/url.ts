/**
 * Returns the parsed URL if it is an absolute http(s) URL without embedded
 * credentials; null otherwise. Used both for validation and before rendering
 * any stored URL as a link (blocks `javascript:` and similar schemes).
 */
export function parseHttpUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url;
}

export function isSafeHttpUrl(value: string | null | undefined): value is string {
  return parseHttpUrl(value) !== null;
}

/** Hostnames that must never be monitored, regardless of what they resolve to. */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTS.has(host)) return true;
  if (!host.includes('.') && !host.includes(':')) return true; // single-label names resolve via search domains
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function isRenderHostname(value: string | null | undefined): boolean {
  const url = parseHttpUrl(value);
  return url !== null && url.hostname.toLowerCase().endsWith('.onrender.com');
}
