import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),

    /** Comma-separated list of browser origins allowed to call the API. */
    FRONTEND_URL: z.string().default('http://localhost:5173'),
    /** Number of reverse proxies in front of the app (Render = 1). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
    COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

    SCHEDULER_SECRET: optionalString.refine((v) => v === undefined || v.length >= 32, 'must be at least 32 characters'),
    SCHEDULER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(10),
    SCHEDULER_MAX_JOBS_PER_TICK: z.coerce.number().int().min(1).max(5000).default(500),

    SETUP_TOKEN: optionalString.refine((v) => v === undefined || v.length >= 16, 'must be at least 16 characters'),
    ALLOW_REGISTRATION: bool,
    /** Development only: allow monitoring localhost/private addresses. Refused in production. */
    ALLOW_PRIVATE_TARGETS: bool,

    EMAIL_PROVIDER: z.enum(['none', 'resend', 'smtp']).default('none'),
    EMAIL_FROM: optionalString,
    RESEND_API_KEY: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: bool,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (env.NODE_ENV === 'production') {
      if (env.ALLOW_PRIVATE_TARGETS) issue('ALLOW_PRIVATE_TARGETS', 'must not be enabled in production');
      if (!env.SCHEDULER_SECRET) issue('SCHEDULER_SECRET', 'is required in production');
    }
    if (env.EMAIL_PROVIDER !== 'none' && !env.EMAIL_FROM) issue('EMAIL_FROM', 'is required when email is enabled');
    if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) issue('RESEND_API_KEY', 'is required for resend');
    if (env.EMAIL_PROVIDER === 'smtp' && !env.SMTP_HOST) issue('SMTP_HOST', 'is required for smtp');
    if (env.COOKIE_SAMESITE === 'none' && env.NODE_ENV !== 'production') {
      issue('COOKIE_SAMESITE', '"none" requires HTTPS and is only allowed in production');
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface Config extends Env {
  isProduction: boolean;
  allowedOrigins: string[];
  /** Base URL used for links in notification emails. */
  appUrl: string;
}

export function loadConfig(source: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Report variable names and problems only — never values.
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  const allowedOrigins = env.FRONTEND_URL.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    allowedOrigins,
    appUrl: allowedOrigins[0] ?? 'http://localhost:5173',
  };
}

export const config: Config = loadConfig(process.env);
