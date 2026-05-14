import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  auth, db, doc, getDoc, setDoc, getDocs, collection, query, where,
  getRedirectResult, serverTimestamp,
} from '../firebase/config';
import { signOut } from 'firebase/auth';
import { useModalStore } from '../store/modalStore';

/**
 * Post-auth routing logic for Google sign-in. We use signInWithRedirect
 * exclusively (popup was dropped because Chrome's Cross-Origin-Opener-
 * Policy blocks Firebase's window.closed poll, producing repeated console
 * errors and occasional silent hangs on some sessions). This helper is
 * invoked after getRedirectResult resolves on app mount.
 *
 * Accepts the authenticated user, the intent ('user' | 'biz'), and a
 * navigate function from react-router. Returns true if the caller
 * should consider the flow "consumed" (meaning downstream onAuth
 * listeners don't need to act further).
 */
export async function resolveAuthFlow({ user, intent, navigate }) {
  if (!user) return false;

  // Admin gate — both flows block admin accounts from the consumer /
  // business portals and nudge them to /admin/login.
  const adminSnap = await getDoc(doc(db, 'admin_users', user.uid)).catch(() => null);
  if (adminSnap?.exists() && adminSnap.data()?.isActive !== false) {
    await signOut(auth);
    window.alert('Admin accounts must use the Admin Portal at /admin/login');
    navigate('/admin/login');
    return true;
  }

  const bizSnap = await getDocs(
    query(collection(db, 'companies'), where('adminUserId', '==', user.uid))
  ).catch(() => ({ empty: true, docs: [] }));

  if (intent === 'biz') {
    if (!bizSnap.empty) {
      navigate('/company-dashboard');
    } else {
      sessionStorage.setItem('irema_biz_register', '1');
      navigate('/businesses');
    }
    return true;
  }

  // intent === 'user'
  if (!bizSnap.empty) {
    await signOut(auth);
    window.alert(
      'This email is registered as a business account. Please sign in at the Business Portal.'
    );
    navigate('/businesses');
    return true;
  }

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      role: 'user',
      authProvider: 'google',
      emailVerificationRequired: false,
      emailVerified: true,
      createdAt: serverTimestamp(),
    });
  }
  useModalStore.getState().closeModal?.();
  return true;
}

/**
 * AuthRedirectHandler — mounted once at app root. If the user just
 * returned from a signInWithRedirect flow (Google), this resolves the
 * redirect result, runs the admin/business-role checks that used to
 * live inline next to signInWithPopup, and routes accordingly.
 *
 * Intents (written to sessionStorage before signInWithRedirect is called):
 *   irema_auth_intent = 'user'    → normal user sign-in
 *   irema_auth_intent = 'biz'     → business portal sign-in (at /businesses)
 *
 * Produces no UI. Opens modals / navigates as needed.
 */
export default function AuthRedirectHandler() {
  const navigate = useNavigate();
  const openModal = useModalStore(s => s.openModal);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result || !result.user || cancelled) return;
        // Check both sessionStorage and localStorage for intent (sessionStorage may be cleared during redirect)
        const intent = sessionStorage.getItem('irema_auth_intent') || localStorage.getItem('irema_auth_intent') || 'user';
        sessionStorage.removeItem('irema_auth_intent');
        localStorage.removeItem('irema_auth_intent');
        await resolveAuthFlow({ user: result.user, intent, navigate });
      } catch (e) {
        // Redirect errors are common (network, cancelled, etc.); log and move on.
        console.warn('Redirect auth result failed:', e?.message || e);
      }
    })();
    return () => { cancelled = true; };
    // Run exactly once at app mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
