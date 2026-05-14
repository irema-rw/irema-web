import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_MAX_CHARACTERS,
  REVIEW_MIN_CHARACTERS,
  REPLY_MAX_CHARACTERS,
  REVIEW_COOLDOWN_MS,
  getReviewLimitId,
  getReviewLimitStatus,
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

test('review limit id combines company and user deterministically', () => {
  assert.equal(getReviewLimitId('company-a', 'user-b'), 'company-a_user-b');
});

test('review cooldown blocks another review inside 24 hours', () => {
  const now = new Date('2026-05-10T12:00:00Z');
  const status = getReviewLimitStatus({
    lastReviewedAt: new Date(now.getTime() - REVIEW_COOLDOWN_MS + 1000),
  }, now);

  assert.equal(status.blocked, true);
  assert.equal(status.message, 'You already reviewed this business today. You can review it again tomorrow.');
});

test('review cooldown allows another review after 24 hours', () => {
  const now = new Date('2026-05-10T12:00:00Z');
  const status = getReviewLimitStatus({
    lastReviewedAt: new Date(now.getTime() - REVIEW_COOLDOWN_MS - 1000),
  }, now);

  assert.equal(status.blocked, false);
});
