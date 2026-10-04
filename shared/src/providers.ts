/**
 * Provider catalogs. To support a new provider, add an entry here — the API
 * validation and every dropdown in the UI read from these lists. Anything not
 * listed can be recorded with value `other` plus a free-text `customProvider`.
 */
export interface ProviderOption {
  value: string;
  label: string;
}

export const OTHER_PROVIDER = 'other';

export const DATABASE_PROVIDERS = [
  { value: 'supabase', label: 'Supabase' },
  { value: 'mongodb_atlas', label: 'MongoDB Atlas' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'neon', label: 'Neon' },
  { value: 'firebase', label: 'Firebase' },
  { value: 'planetscale', label: 'PlanetScale' },
  { value: 'aws_rds', label: 'AWS RDS' },
  { value: 'azure_database', label: 'Azure Database' },
  { value: 'render_postgres', label: 'Render Postgres' },
  { value: 'turso', label: 'Turso' },
  { value: 'redis', label: 'Redis' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'none', label: 'No database' },
  { value: OTHER_PROVIDER, label: 'Other' },
] as const satisfies readonly ProviderOption[];

export const HOSTING_PROVIDERS = [
  { value: 'render', label: 'Render' },
  { value: 'vercel', label: 'Vercel' },
  { value: 'netlify', label: 'Netlify' },
  { value: 'cloudflare', label: 'Cloudflare Pages/Workers' },
  { value: 'github_pages', label: 'GitHub Pages' },
  { value: 'railway', label: 'Railway' },
  { value: 'fly', label: 'Fly.io' },
  { value: 'heroku', label: 'Heroku' },
  { value: 'aws', label: 'AWS' },
  { value: 'azure', label: 'Azure' },
  { value: 'gcp', label: 'Google Cloud' },
  { value: 'digitalocean', label: 'DigitalOcean' },
  { value: 'firebase_hosting', label: 'Firebase Hosting' },
  { value: 'self_hosted', label: 'Self-hosted / VPS' },
  { value: OTHER_PROVIDER, label: 'Other' },
] as const satisfies readonly ProviderOption[];

export const REPOSITORY_PROVIDERS = [
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'bitbucket', label: 'Bitbucket' },
  { value: 'azure_devops', label: 'Azure DevOps' },
  { value: OTHER_PROVIDER, label: 'Other' },
] as const satisfies readonly ProviderOption[];

/** How the account that owns a service was created / signs in. */
export const ACCOUNT_PROVIDERS = [
  { value: 'google', label: 'Google' },
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'apple', label: 'Apple' },
  { value: 'email', label: 'Email & password' },
  { value: OTHER_PROVIDER, label: 'Other' },
] as const satisfies readonly ProviderOption[];

export const PROVIDER_CATALOG = {
  database: DATABASE_PROVIDERS,
  hosting: HOSTING_PROVIDERS,
  repository: REPOSITORY_PROVIDERS,
  account: ACCOUNT_PROVIDERS,
} as const;

export type ProviderCategory = keyof typeof PROVIDER_CATALOG;

function valuesOf<T extends readonly ProviderOption[]>(list: T): [T[number]['value'], ...T[number]['value'][]] {
  return list.map((p) => p.value) as [T[number]['value'], ...T[number]['value'][]];
}

export const DATABASE_PROVIDER_VALUES = valuesOf(DATABASE_PROVIDERS);
export const HOSTING_PROVIDER_VALUES = valuesOf(HOSTING_PROVIDERS);
export const REPOSITORY_PROVIDER_VALUES = valuesOf(REPOSITORY_PROVIDERS);
export const ACCOUNT_PROVIDER_VALUES = valuesOf(ACCOUNT_PROVIDERS);

/** Display label for a stored provider value, preferring the custom name for `other`. */
export function providerLabel(
  category: ProviderCategory,
  value: string | null | undefined,
  customProvider?: string | null,
): string | null {
  if (!value) return null;
  if (value === OTHER_PROVIDER) return customProvider?.trim() || 'Other';
  const list: readonly ProviderOption[] = PROVIDER_CATALOG[category];
  return list.find((p) => p.value === value)?.label ?? value;
}
