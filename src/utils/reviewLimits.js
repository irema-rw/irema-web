export const REVIEW_MIN_CHARACTERS = 10;
export const REVIEW_MAX_CHARACTERS = 1000;
export const REPLY_MAX_CHARACTERS = 1000;

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
