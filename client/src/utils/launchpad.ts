import {
  parseHttpUrl,
  websiteInputSchema,
  type UserSettings,
  type WebsiteDto,
  type WebsiteInput,
} from '@wt/shared';
import { emptyWebsite, websiteToForm } from '../types/websiteForm';

type MonitoringDefaults = UserSettings['monitoringDefaults'];

/**
 * Lets people type "github.com" instead of "https://github.com". Anything that
 * already looks like a scheme (javascript:, ftp://, mailto:) is left untouched
 * so the shared URL validation rejects it.
 */
export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return value; // a scheme other than host:port
  return `https://${value}`;
}

/** "https://www.github.com/x" → "github.com" */
export function displayHost(url: string | null | undefined): string | null {
  const parsed = parseHttpUrl(url);
  return parsed ? parsed.hostname.replace(/^www\./i, '') : null;
}

/** Stable hash so a website always gets the same placeholder colours. */
function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Placeholder background for websites without an image. Lightness is kept low
 * so white text on top always has strong contrast.
 */
export function placeholderGradient(name: string): string {
  const hue = hash(name.trim().toLowerCase()) % 360;
  const second = (hue + 45) % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 36%) 0%, hsl(${second} 60% 24%) 100%)`;
}

export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

export interface QuickValues {
  name: string;
  /** Already normalised; may be empty when editing a website that has no URL. */
  url: string;
}

/** A new website with one Production environment and monitoring off — configurable later in the full form. */
export function buildQuickCreateInput(values: QuickValues, defaults: MonitoringDefaults): WebsiteInput {
  const form = emptyWebsite(defaults);
  form.name = values.name;
  form.environments[0]!.websiteUrl = values.url;
  return websiteInputSchema.parse(form);
}

/**
 * Applies a name/URL edit to an existing website by round-tripping it through the
 * full form model, so hosting, database, tags and monitors are preserved exactly.
 */
export function applyQuickEdit(
  site: WebsiteDto,
  environmentId: string | null,
  values: QuickValues,
  defaults: MonitoringDefaults,
): WebsiteInput {
  const form = websiteToForm(site, defaults);
  form.name = values.name;
  const env = form.environments.find((e) => e.id === environmentId) ?? form.environments[0];
  if (env) env.websiteUrl = values.url;
  return websiteInputSchema.parse(form);
}

export function cardAriaLabel(name: string, url: string | null): string {
  return url ? `Open ${name} (${displayHost(url) ?? url}) in a new tab` : `${name} has no URL yet. Add one`;
}

