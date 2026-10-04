import { config } from './config/env.js';
import { createEmailSender, type EmailSender } from './services/email/emailSender.js';
import { createProber, type Prober } from './services/probe/httpProbe.js';
import { configuredPolicy, createTargetCheck, type TargetCheck } from './services/probe/targetPolicy.js';

/** External side effects and security policy, injected so tests can substitute them. */
export interface AppDeps {
  prober: Prober;
  /** Save-time validation of monitor URLs; must agree with the prober's policy. */
  checkTarget: TargetCheck;
  emailSender: EmailSender | null;
}

export function createDefaultDeps(): AppDeps {
  const { addressPolicy, allowLocalHostnames } = configuredPolicy;
  return {
    prober: createProber({ addressPolicy, allowLocalHostnames }),
    checkTarget: createTargetCheck(addressPolicy, allowLocalHostnames),
    emailSender: createEmailSender(config),
  };
}
