/**
 * The tracker stores infrastructure *metadata* only. These patterns catch the
 * most common ways a secret ends up pasted into a free-text field so it can be
 * rejected before it is ever persisted.
 */
const SECRET_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    label: 'a connection string containing a password',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
  },
  { label: 'an AWS access key', pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { label: 'a Stripe secret key', pattern: /\b(sk|rk)_(live|test)_[0-9a-zA-Z]{16,}\b/ },
  { label: 'a GitHub token', pattern: /\b(ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{30,}\b|\bgithub_pat_[0-9A-Za-z_]{40,}\b/ },
  { label: 'a Slack token', pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/ },
  { label: 'an OpenAI/Anthropic-style API key', pattern: /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { label: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: 'a JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    label: 'a password or secret assignment',
    pattern: /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|service[_-]?role[_-]?key)\s*[:=]\s*\S{6,}/i,
  },
];

/** Returns a human-readable description of the first secret-like content found, or null. */
export function findSecretLikeContent(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

export function secretRejectionMessage(found: string): string {
  return `This looks like it contains ${found}. Store secrets in your provider's secret manager, not here.`;
}
