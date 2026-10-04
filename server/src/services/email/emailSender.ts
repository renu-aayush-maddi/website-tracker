import nodemailer from 'nodemailer';
import type { Config } from '../../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  readonly provider: 'resend' | 'smtp';
  send(message: EmailMessage): Promise<void>;
}

const SEND_TIMEOUT_MS = 15_000;

/**
 * Resend's HTTPS API. Preferred on Render's free plan, which blocks outbound
 * SMTP ports.
 */
export function createResendSender(apiKey: string, from: string): EmailSender {
  return {
    provider: 'resend',
    async send({ to, subject, text }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend responded ${res.status}: ${body.slice(0, 200)}`);
      }
    },
  };
}

export function createSmtpSender(config: Config): EmailSender {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
  return {
    provider: 'smtp',
    async send({ to, subject, text }) {
      await transport.sendMail({ from: config.EMAIL_FROM, to, subject, text });
    },
  };
}

export function createEmailSender(config: Config): EmailSender | null {
  if (config.EMAIL_PROVIDER === 'resend' && config.RESEND_API_KEY && config.EMAIL_FROM) {
    return createResendSender(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  if (config.EMAIL_PROVIDER === 'smtp') return createSmtpSender(config);
  return null;
}
