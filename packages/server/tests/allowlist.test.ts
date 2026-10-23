import { describe, expect, it } from 'vitest';
import { evaluateAllowlist, parseAllowedEmails } from '../convex/allowlist';

const john = { subject: 'user_john', email: 'John.Twigg@gmail.com' };

describe('evaluateAllowlist', () => {
  it('denies when both env lists are unset', () => {
    expect(evaluateAllowlist(john, {})).toEqual({
      allowed: false,
      reason: 'allowlist_unset',
    });
    expect(evaluateAllowlist(john, { ALLOWED_EMAILS: '  ', ALLOWED_USER_IDS: '' })).toEqual({
      allowed: false,
      reason: 'allowlist_unset',
    });
  });

  it('matches emails case-insensitively', () => {
    expect(
      evaluateAllowlist(john, { ALLOWED_EMAILS: 'john.twigg@gmail.com' }),
    ).toMatchObject({ allowed: true, reason: 'email' });
    expect(
      evaluateAllowlist(
        { subject: 'user_other', email: 'other@example.com' },
        { ALLOWED_EMAILS: 'john.twigg@gmail.com' },
      ),
    ).toMatchObject({ allowed: false, reason: 'not_listed' });
  });

  it('falls back to Clerk subject when email is missing', () => {
    expect(
      evaluateAllowlist(
        { subject: 'user_john', email: null },
        { ALLOWED_EMAILS: 'john.twigg@gmail.com', ALLOWED_USER_IDS: 'user_john' },
      ),
    ).toMatchObject({ allowed: true, reason: 'user_id' });
  });

  it('denies unauthenticated identities', () => {
    expect(evaluateAllowlist(null, { ALLOWED_EMAILS: 'john.twigg@gmail.com' })).toEqual({
      allowed: false,
      reason: 'unauthenticated',
    });
  });

  it('parses comma-separated emails', () => {
    expect(parseAllowedEmails(' john.twigg@gmail.com, Family@Example.com ')).toEqual([
      'john.twigg@gmail.com',
      'family@example.com',
    ]);
  });
});
