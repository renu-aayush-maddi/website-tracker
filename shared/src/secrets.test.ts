import { describe, expect, it } from 'vitest';
import { findSecretLikeContent } from './secrets.js';

describe('findSecretLikeContent', () => {
  it.each([
    ['postgres://admin:hunter2pass@db.example.com:5432/app'],
    ['mongodb+srv://user:S3cret@cluster0.abcde.mongodb.net/'],
    ['-----BEGIN RSA PRIVATE KEY-----\nMIIE...'],
    ['AK' + 'IAIOSFODNN7EXAMPLE'],
    ['sk_' + 'live_51HxxxxxxxxxxxxxxxxxxxxxxXX'],
    ['ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'],
    ['password: correct-horse-battery'],
    ['SERVICE_ROLE_KEY=abcdefghijkl'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
  ])('flags %s', (text) => {
    expect(findSecretLikeContent(text)).not.toBeNull();
  });

  it.each([
    ['Production database for the expense tracker'],
    ['Account: myproject@gmail.com, region ap-south-1'],
    ['https://supabase.com/dashboard/project/abcd'],
    ['Password is stored in 1Password vault "Infra"'],
    [''],
  ])('allows %s', (text) => {
    expect(findSecretLikeContent(text)).toBeNull();
  });
});
