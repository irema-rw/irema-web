import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmailVerificationActionCodeSettings, requiresEmailVerification } from './emailVerification.js';

const passwordUser = { emailVerified: false, providerData: [{ providerId: 'password' }] };

test('requires verification for new password users marked as required', () => {
  assert.equal(requiresEmailVerification(passwordUser, {
    authProvider: 'password',
    emailVerificationRequired: true,
    emailVerified: false,
  }), true);
});

test('does not require verification for grandfathered users without marker', () => {
  assert.equal(requiresEmailVerification(passwordUser, {
    authProvider: 'password',
    emailVerified: false,
  }), false);
});

test('does not require verification for Google users', () => {
  assert.equal(requiresEmailVerification({
    emailVerified: true,
    providerData: [{ providerId: 'google.com' }],
  }, {
    authProvider: 'google',
    emailVerificationRequired: false,
  }), false);
});

test('does not require verification for admins', () => {
  assert.equal(requiresEmailVerification(passwordUser, {
    role: 'admin',
    authProvider: 'password',
    emailVerificationRequired: true,
  }), false);
});

test('email verification action settings are omitted outside the browser', () => {
  assert.equal(getEmailVerificationActionCodeSettings(), undefined);
});
