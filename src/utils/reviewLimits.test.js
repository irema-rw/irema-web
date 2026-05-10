import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_MAX_CHARACTERS,
  REVIEW_MIN_CHARACTERS,
  REPLY_MAX_CHARACTERS,
  validateReplyText,
  validateReviewText,
} from './reviewLimits.js';

test('customer reviews require at least 10 non-whitespace characters', () => {
  assert.deepEqual(validateReviewText(' short '), {
    ok: false,
    message: `Please write at least ${REVIEW_MIN_CHARACTERS} characters in your review.`,
  });

  assert.deepEqual(validateReviewText('Great place'), { ok: true, message: '' });
});

test('customer reviews reject text longer than 1000 characters without trimming', () => {
  assert.equal(REVIEW_MAX_CHARACTERS, 1000);
  assert.deepEqual(validateReviewText('a'.repeat(1001)), {
    ok: false,
    message: `Reviews can be at most ${REVIEW_MAX_CHARACTERS} characters.`,
  });

  assert.deepEqual(validateReviewText('a'.repeat(1000)), { ok: true, message: '' });
});

test('replies reject text longer than 1000 characters without trimming', () => {
  assert.equal(REPLY_MAX_CHARACTERS, 1000);
  assert.deepEqual(validateReplyText('a'.repeat(1001)), {
    ok: false,
    message: `Replies can be at most ${REPLY_MAX_CHARACTERS} characters.`,
  });

  assert.deepEqual(validateReplyText('a'.repeat(1000)), { ok: true, message: '' });
});
