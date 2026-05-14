export function getAuthErrorMessage(error) {
  const code = error?.code || '';
  const message = error?.message || '';

  if (code === 'auth/too-many-requests' || message.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Invalid email or password.';
  }

  if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
    return 'We could not find an account with that email. Please check the address and try again.';
  }

  if (code === 'auth/email-already-in-use') {
    return 'This email is already registered. Try logging in, or use a different email.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your connection and try again.';
  }

  return message || 'Something went wrong. Please try again.';
}
