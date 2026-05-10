export const REVIEW_MIN_CHARACTERS = 10;
export const REVIEW_MAX_CHARACTERS = 1000;
export const REPLY_MAX_CHARACTERS = 1000;
export const REVIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const REVIEW_COOLDOWN_MESSAGE = 'You already reviewed this business today. You can review it again tomorrow.';

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return new Date(value);
}

export function getReviewLimitId(companyId, userId) {
  return `${companyId}_${userId}`;
}

export function getReviewLimitStatus(limitDoc, now = new Date()) {
  const lastReviewedAt = toDate(limitDoc?.lastReviewedAt);
  if (!lastReviewedAt) {
    return { blocked: false, message: '', lastReviewedAt: null };
  }

  const blocked = now.getTime() - lastReviewedAt.getTime() < REVIEW_COOLDOWN_MS;
  return {
    blocked,
    message: blocked ? REVIEW_COOLDOWN_MESSAGE : '',
    lastReviewedAt,
  };
}

export function validateReviewText(text = '') {
  if (text.trim().length < REVIEW_MIN_CHARACTERS) {
    return {
      ok: false,
      message: `Please write at least ${REVIEW_MIN_CHARACTERS} characters in your review.`,
    };
  }

  if (text.length > REVIEW_MAX_CHARACTERS) {
    return {
      ok: false,
      message: `Reviews can be at most ${REVIEW_MAX_CHARACTERS} characters.`,
    };
  }

  return { ok: true, message: '' };
}

export function validateReplyText(text = '') {
  if (!text.trim()) {
    return {
      ok: false,
      message: 'Please write a reply before sending.',
    };
  }

  if (text.length > REPLY_MAX_CHARACTERS) {
    return {
      ok: false,
      message: `Replies can be at most ${REPLY_MAX_CHARACTERS} characters.`,
    };
  }

  return { ok: true, message: '' };
}
