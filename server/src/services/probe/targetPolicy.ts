import { config } from '../../config/env.js';
import { anyValidAddress, assertSafeTarget, publicAddressesOnly, type AddressPolicy } from './ssrf.js';

/** Static (pre-DNS) check of a URL the server will request. Returns an error message or null. */
export type TargetCheck = (url: string) => string | null;

export function createTargetCheck(policy: AddressPolicy, allowLocalHostnames: boolean): TargetCheck {
  return (url) => {
    try {
      assertSafeTarget(url, policy, allowLocalHostnames);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid target';
    }
  };
}

export const configuredPolicy = {
  addressPolicy: config.ALLOW_PRIVATE_TARGETS ? anyValidAddress : publicAddressesOnly,
  allowLocalHostnames: config.ALLOW_PRIVATE_TARGETS,
};
