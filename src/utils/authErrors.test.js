import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage } from './authErrors.js';

test('maps Firebase too-many-requests code to friendly copy', () => {
  assert.equal(
    getAuthErrorMessage({ code: 'auth/too-many-requests', message: 'Firebase: Error (auth/too-many-requests).' }),
    'Too many attempts. Please wait a few minutes before trying again.'
  );
});

test('maps raw Firebase too-many-requests message to friendly copy', () => {
  assert.equal(
    getAuthErrorMessage({ message: 'Firebase: Error (auth/too-many-requests).' }),
    'Too many attempts. Please wait a few minutes before trying again.'
  );
});

test('maps invalid credentials to friendly copy', () => {
  assert.equal(getAuthErrorMessage({ code: 'auth/invalid-credential' }), 'Invalid email or password.');
});
