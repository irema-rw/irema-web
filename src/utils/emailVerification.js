export const EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Please verify your email to continue.';

export function getEmailVerificationActionCodeSettings() {
  if (typeof window === 'undefined') return undefined;
  return {
    url: `${window.location.origin}/?emailVerified=1`,
    handleCodeInApp: false,
  };
}

export function getPrimaryProviderId(user) {
  return user?.providerData?.[0]?.providerId || null;
}

export function isPasswordUser(user, userProfile = {}) {
  return userProfile?.authProvider === 'password' || getPrimaryProviderId(user) === 'password';
}

export function requiresEmailVerification(user, userProfile = {}) {
  if (!user) return false;
  if (userProfile?.role === 'admin' || userProfile?.role === 'super_admin') return false;
  if (userProfile?.emailVerificationRequired !== true) return false;
  if (!isPasswordUser(user, userProfile)) return false;
  return user.emailVerified !== true && userProfile?.emailVerified !== true;
}
