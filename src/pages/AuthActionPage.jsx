import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  applyActionCode,
  auth,
  checkActionCode,
  db,
  doc,
  getIdToken,
  reload,
  serverTimestamp,
  updateDoc,
} from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import './AuthActionPage.css';

const STATUS_COPY = {
  loading: {
    eyebrow: 'Email verification',
    title: 'Verifying your email',
    body: 'Give us a moment while we confirm your email address.',
    tone: 'neutral',
  },
  success: {
    eyebrow: 'All set',
    title: 'Your email has been verified',
    body: 'You can now continue using Irema with your account.',
    tone: 'success',
  },
  unsupported: {
    eyebrow: 'Unsupported link',
    title: 'This link is not for email verification',
    body: 'Open the latest verification email from Irema, or request a new link from the sign-in screen.',
    tone: 'warning',
  },
  error: {
    eyebrow: 'Link expired',
    title: 'We could not verify this link',
    body: 'This verification link may have expired or already been used. Please request a new link from the sign-in screen.',
    tone: 'error',
  },
};

function getContinuePath(continueUrl) {
  if (!continueUrl) return '/';
  try {
    const url = new URL(continueUrl);
    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}` || '/';
    }
  } catch {
    return '/';
  }
  return '/';
}

export default function AuthActionPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { userProfile, setUser, setUserProfile } = useAuthStore();
  const [status, setStatus] = useState('loading');
  const [verifiedEmail, setVerifiedEmail] = useState('');

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  const continuePath = getContinuePath(params.get('continueUrl'));
  const copy = STATUS_COPY[status] || STATUS_COPY.error;

  useEffect(() => {
    let cancelled = false;

    async function verifyEmail() {
      if (mode !== 'verifyEmail' || !oobCode) {
        setStatus('unsupported');
        return;
      }

      try {
        const actionInfo = await checkActionCode(auth, oobCode);
        const email = actionInfo?.data?.email || '';
        if (!cancelled) setVerifiedEmail(email);

        await applyActionCode(auth, oobCode);

        const current = auth.currentUser;
        if (current) {
          await reload(current).catch(() => {});
          await getIdToken(current, true).catch(() => {});
          setUser(auth.currentUser);

          if (!email || current.email === email) {
            const updates = {
              emailVerified: true,
              emailVerifiedAt: serverTimestamp(),
            };
            await updateDoc(doc(db, 'users', current.uid), updates).catch(() => {});
            setUserProfile({ ...(userProfile || {}), ...updates });
          }
        }

        if (!cancelled) setStatus('success');
      } catch (error) {
        if (!cancelled) {
          console.warn('Email verification action failed:', error?.message || error);
          setStatus('error');
        }
      }
    }

    verifyEmail();
    return () => { cancelled = true; };
  }, [mode, oobCode, setUser, setUserProfile, userProfile]);

  function handleContinue() {
    navigate(continuePath, { replace: true });
  }

  return (
    <main className="auth-action-page">
      <section className={`auth-action-card auth-action-card-${copy.tone}`} aria-live="polite">
        <div className="auth-action-brand" aria-hidden="true">
          <span className="auth-action-star">★</span>
          <span className="auth-action-line" />
        </div>

        <p className="auth-action-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="auth-action-body">
          {copy.body}
          {verifiedEmail && status === 'success' ? (
            <span className="auth-action-email"> {verifiedEmail}</span>
          ) : null}
        </p>

        {status === 'loading' ? (
          <div className="auth-action-loader" aria-label="Verifying email" />
        ) : (
          <div className="auth-action-actions">
            {status === 'success' ? (
              <button className="btn btn-primary btn-lg" type="button" onClick={handleContinue}>
                Continue to Irema
              </button>
            ) : (
              <>
                <Link className="btn btn-primary btn-lg" to="/">
                  Back to Irema
                </Link>
                <Link className="btn btn-outline btn-lg" to="/?auth=login">
                  Sign in again
                </Link>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
