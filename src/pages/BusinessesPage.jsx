import Footer from '../components/Footer';
import React, { useState, useEffect } from 'react';
import { db, auth, collection, addDoc, serverTimestamp, getDocs, query, where, Timestamp } from '../firebase/config';
import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, signInWithRedirect, signInWithPopup, updateProfile, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { googleProvider } from '../firebase/config';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/themeStore';
import { useTranslation } from 'react-i18next';
import { ensureUniqueSlug } from '../utils/slug';
import { getEmailVerificationActionCodeSettings } from '../utils/emailVerification';
import { getAuthErrorMessage } from '../utils/authErrors';
import { resolveAuthFlow } from '../components/AuthRedirectHandler';
import { isArchivedRecord } from '../utils/adminModeration';
import './BusinessesPage.css';

const CATS = [
  {v:'bank',l:'Bank'},{v:'restaurant',l:'Restaurant'},{v:'hotel',l:'Hotel & Hospitality'},
  {v:'healthcare',l:'Healthcare'},{v:'education',l:'Education'},{v:'electronics',l:'Electronics & Tech'},
  {v:'supermarket',l:'Supermarket'},{v:'telecom',l:'Telecommunications'},{v:'real_estate',l:'Real Estate'},
  {v:'pharmacy',l:'Pharmacy'},{v:'fitness',l:'Fitness & Nutrition'},{v:'travel',l:'Travel & Insurance'},
  {v:'other',l:'Other'},
];

function BizLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 60 60" fill="none">
      <rect width="60" height="60" rx="14" fill="url(#bpLogoGrad)"/>
      <defs>
        <linearGradient id="bpLogoGrad" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1f6b52"/><stop offset="100%" stopColor="#164d3b"/>
        </linearGradient>
      </defs>
      <polygon points="30,8 34.5,21.5 49,21.5 37.5,30 41.5,43.5 30,35 18.5,43.5 22.5,30 11,21.5 25.5,21.5" fill="#E8B800"/>
      <polygon points="30,13 33.2,22.8 43.5,22.8 35.4,28.8 38.2,38.5 30,33 21.8,38.5 24.6,28.8 16.5,22.8 26.8,22.8" fill="rgba(255,255,255,0.2)"/>
      <circle cx="30" cy="27" r="3.5" fill="rgba(255,255,255,0.5)"/>
    </svg>
  );
}

export default function BusinessesPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const { theme, toggle: toggleTheme } = useThemeStore();
  const { user: globalUser } = useAuthStore();
  const [modal, setModal] = useState(null); // 'login' | 'register' | 'claim'
  const [bizMobileOpen, setBizMobileOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ email:'', password:'' });
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [showClaimPw, setShowClaimPw] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [regForm, setRegForm] = useState({ companyName:'', category:'', firstName:'', lastName:'', email:'', password:'', phoneNumber:'', website:'', country:'RW', employees:'1-10', address:'', city:'', district:'' });
  const [otherCategoryDetails, setOtherCategoryDetails] = useState('');
  const [regGoogleUser, setRegGoogleUser] = useState(null); // holds Google user when registering via Google
  const [regTermsAccepted, setRegTermsAccepted] = useState(false);
  const [showBizTerms, setShowBizTerms] = useState(false);
  const isClaimingRef = React.useRef(false); // prevents auth monitor from signing out during claim
  const isRegisteringRef = React.useRef(false); // prevents auth monitor from signing out during registration
  const [regErr, setRegErr] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  // Claim flow
  const [claimSearch, setClaimSearch] = useState('');
  const [claimResults, setClaimResults] = useState([]);
  const [claimSearching, setClaimSearching] = useState(false);
  const [claimSelected, setClaimSelected] = useState(null);
  const [claimForm, setClaimForm] = useState({ firstName:'', lastName:'', email:'', password:'', phone:'', role:'' });
  const [claimErr, setClaimErr] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);

  // Pre-fill claim form when user is already signed in
  useEffect(() => {
    if (user && modal === 'claim') {
      const parts = (user.displayName || '').split(' ');
      setClaimForm(f => ({
        ...f,
        firstName: f.firstName || parts[0] || '',
        lastName: f.lastName || parts.slice(1).join(' ') || '',
        email: f.email || user.email || '',
      }));
    }
  }, [user, modal]);
  const [trustPct, setTrustPct] = useState(89); // Computed from backend data
  const [heroAvg, setHeroAvg] = useState(4.8); // Loaded from backend
  const [businessCount, setBusinessCount] = useState(0); // Loaded from backend
  const [resetSent, setResetSent] = useState(false);
  const [authChecking, setAuthChecking] = useState(true); // true until we know auth state

  useEffect(() => {
    // Load trust stat, average rating, and business count from backend
    Promise.all([
      getDocs(collection(db, 'reviews')),
      getDocs(collection(db, 'companies'))
    ]).then(([reviewSnap, bizSnap]) => {
      // Calculate review metrics
      const total = reviewSnap.docs.length;
      const ratings = reviewSnap.docs.map(d => d.data().rating || 0);
      const positive = ratings.filter(r => r >= 4).length;
      if (total > 0) {
        setTrustPct(Math.round((positive / total) * 100));
        setHeroAvg(parseFloat((ratings.reduce((s,r) => s+r, 0) / total).toFixed(1)));
      }
      // Get business count
      setBusinessCount(bizSnap.docs.filter(d => !isArchivedRecord(d.data())).length);
    }).catch(err => {
      if (import.meta.env.DEV) console.warn('[BusinessesPage] stats load failed:', err);
    });
  }, []);

  // If we just returned from signInWithRedirect with 'biz' intent but no
  // company yet, AuthRedirectHandler sets this flag so we re-open the
  // register modal with the Google user's details pre-filled.
  useEffect(() => {
    if (sessionStorage.getItem('irema_biz_register') === '1' && auth.currentUser) {
      sessionStorage.removeItem('irema_biz_register');
      isRegisteringRef.current = true;
      const u = auth.currentUser;
      setRegGoogleUser(u);
      setRegForm(f => ({
        ...f,
        email: u.email || '',
        firstName: (u.displayName || '').split(' ')[0],
        lastName: (u.displayName || '').split(' ').slice(1).join(' '),
        password: '',
      }));
      setModal('register');
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      // While registration or claim is in progress, never interfere with auth state
      if (isRegisteringRef.current || isClaimingRef.current) {
        setAuthChecking(false);
        return;
      }
      // Returning from Google redirect with biz intent — stay signed in so
      // AuthRedirectHandler + the register modal can finish their work.
      if (sessionStorage.getItem('irema_biz_register') === '1') {
        setAuthChecking(false);
        return;
      }
      if (!u) { setUser(null); setAuthChecking(false); return; }
      try {
        // Check if this is a business owner account
        const bizSnap = await getDocs(query(collection(db, 'companies'), where('adminUserId', '==', u.uid)));
        if (!bizSnap.empty) {
          navigate('/company-dashboard', { replace: true });
          return;
        }
        // Regular (non-business) user landed on /businesses — keep them
        // signed in and let the page render. Previously we'd force signOut
        // which caused "got logged out" after unrelated writes (profile
        // upload, review) that triggered a token refresh + re-fire of this
        // listener. The page itself gates biz-only actions on role anyway.
        setUser(u);
      } catch (e) { setUser(u); }
      setAuthChecking(false);
    });
  }, [navigate]);

  // LOGIN — Google sign-in on the business portal uses signInWithRedirect
  // directly. We previously raced signInWithPopup against a 20s timeout and
  // fell back to redirect on failure, but Chrome's Cross-Origin-Opener-
  // Policy now blocks the window.closed poll that Firebase uses to detect
  // popup close events, which produces repeated console errors of the form
  // "Cross-Origin-Opener-Policy policy would block the window.closed call"
  // even when auth succeeds. Going straight to redirect eliminates those
  // errors and gives a more reliable sign-in across browsers. The result
  // is picked up on app mount by AuthRedirectHandler (see components/
  // AuthRedirectHandler.jsx), which then runs the admin / biz-owner role
  // checks and routes the user to /company-dashboard — or back to
  // /businesses with the register form pre-filled when no company yet.
  async function handleGoogleBizLogin() {
    setLoginErr(''); setLoginLoading(true);
    try {
      // Try popup first (opens in new window like other apps)
      try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithPopup(auth, googleProvider);
        const uid = result.user.uid;

        // Block admin accounts from business portal
        const adminSnap = await getDoc(doc(db, 'admin_users', uid)).catch(() => null);
        if (adminSnap?.exists() && adminSnap.data()?.isActive !== false) {
          await signOut(auth);
          setLoginErr('Admin accounts must use the admin portal at /admin/login');
          setLoginLoading(false);
          return;
        }

        // Check if user has a company
        const snap = await getDocs(query(collection(db, 'companies'), where('adminUserId', '==', uid)));
        if (!snap.empty) {
          navigate('/company-dashboard');
          return;
        }

        // No company found - show registration prompt
        setRegGoogleUser(result.user);
        setModal('register');
        setLoginLoading(false);
        return;
      } catch (popupErr) {
        // If popup fails (COOP blocking, user blocked popups, etc), fall back to redirect
        if (popupErr?.code !== 'auth/cancelled-popup-request') {
          console.warn('Popup sign-in failed, falling back to redirect:', popupErr?.message);
          sessionStorage.setItem('irema_auth_intent', 'biz');
          localStorage.setItem('irema_auth_intent', 'biz');
          await signInWithRedirect(auth, googleProvider);
        }
        return;
      }
    } catch (err) {
      setLoginErr(getAuthErrorMessage(err));
    } finally { setLoginLoading(false); }
  }

  async function handleLogin(e) {
    e.preventDefault(); setLoginErr(''); setLoginLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      // Block admin accounts from business portal
      const adminSnap = await getDoc(doc(db, 'admin_users', cred.user.uid)).catch(() => null);
      if (adminSnap?.exists() && adminSnap.data()?.isActive !== false) {
        await signOut(auth);
        setLoginErr('Admin accounts must use the admin portal at /admin/login');
        setLoginLoading(false); return;
      }
      const snap = await getDocs(query(collection(db, 'companies'), where('adminUserId', '==', cred.user.uid)));
      if (!snap.empty) navigate('/company-dashboard');
      else {
        await signOut(auth);
        setLoginErr('No business found for this account. Please register or claim a business.');
      }
    } catch(err) {
      setLoginErr(getAuthErrorMessage(err));
    }
    setLoginLoading(false);
  }

  async function handleForgotPassword() {
    if (!loginForm.email) { setLoginErr('Enter your email first.'); return; }
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/businesses/?mode=resetPassword&oobCode=EMAIL_CODE`,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, loginForm.email, actionCodeSettings);
      setResetSent(true);
    } catch(e) { setLoginErr(getAuthErrorMessage(e)); }
  }

  // REGISTER NEW BUSINESS
  async function handleRegister(e) {
    e.preventDefault();
    // Validate all required fields
    if (!regForm.firstName?.trim()) { setRegErr('First name is required.'); return; }
    if (!regForm.lastName?.trim()) { setRegErr('Last name is required.'); return; }
    if (!regForm.email?.trim()) { setRegErr('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regForm.email)) { setRegErr('Enter a valid email address.'); return; }
    if (!regGoogleUser && !regForm.password) { setRegErr('Password is required.'); return; }
    if (!regGoogleUser && regForm.password.length < 6) { setRegErr('Password must be at least 6 characters.'); return; }
    if (!regForm.companyName?.trim()) { setRegErr('Company name is required.'); return; }
    if (!regForm.category) { setRegErr('Please select a business category.'); return; }
    if (regForm.category === 'other' && !otherCategoryDetails?.trim()) { setRegErr('Please specify your business category in the "Other" field.'); return; }
    if (!regForm.phoneNumber?.trim()) { setRegErr('Phone number is required.'); return; }
    if (!regForm.address?.trim()) { setRegErr('Address is required.'); return; }
    if (!regTermsAccepted) { setRegErr('Please accept the Terms & Conditions to continue.'); return; }
    setRegErr(''); setRegLoading(true);
    isRegisteringRef.current = true; // keep blocking any signOut during the entire write sequence
    try {
      let uid, userEmail;
      if (regGoogleUser) {
        // Google user is already signed in — just use their UID directly
        uid = regGoogleUser.uid;
        userEmail = regGoogleUser.email;

        // Verify they're still authenticated (paranoia check)
        const { getAuth } = await import('firebase/auth');
        const currentUser = getAuth().currentUser;
        if (!currentUser || currentUser.uid !== uid) {
          setRegErr('Session expired. Please click "Continue with Google" again.');
          isRegisteringRef.current = false;
          setRegLoading(false);
          return;
        }
      } else {
        await setPersistence(auth, browserLocalPersistence);
        const cred = await createUserWithEmailAndPassword(auth, regForm.email, regForm.password);
        uid = cred.user.uid;
        userEmail = regForm.email;
        await updateProfile(cred.user, { displayName: `${regForm.firstName} ${regForm.lastName}` });
        await sendEmailVerification(cred.user, getEmailVerificationActionCodeSettings());
      }

      // Write user doc (merge so we don't overwrite existing Google profile data)
      await setDoc(doc(db,'users',uid), {
        uid, email: userEmail,
        displayName: regGoogleUser
          ? (regGoogleUser.displayName || `${regForm.firstName} ${regForm.lastName}`)
          : `${regForm.firstName} ${regForm.lastName}`,
        firstName: regForm.firstName, lastName: regForm.lastName,
        role: 'company_admin',
        authProvider: regGoogleUser ? 'google' : 'password',
        emailVerificationRequired: !regGoogleUser,
        emailVerified: !!regGoogleUser,
        ...(!regGoogleUser && { emailVerificationRequiredAt: serverTimestamp() }),
        createdAt: serverTimestamp()
      }, { merge: true });

      const fullAddress = [regForm.address, regForm.city, regForm.district].filter(Boolean).join(', ');
      // Reserve a URL slug so /business/<slug> resolves as soon as the doc lands.
      const slug = await ensureUniqueSlug(regForm.companyName);
      const compRef = await addDoc(collection(db,'companies'), {
        name: regForm.companyName, companyName: regForm.companyName,
        slug,
        category: regForm.category,
        ...(regForm.category === 'other' && { otherCategoryDetails: otherCategoryDetails.trim() }),
        website: regForm.website||'',
        country: regForm.country, phoneNumber: regForm.phoneNumber||'',
        employees: regForm.employees, workEmail: userEmail, email: userEmail,
        address: fullAddress, city: regForm.city||'', district: regForm.district||'',
        adminUserId: uid, adminEmail: userEmail,
        averageRating: 0, totalReviews: 0, isVerified: false,
        status: 'pending', createdAt: serverTimestamp()
      });

      // Initialize 14-day free trial for analytics
      const trialEndsDate = new Date();
      trialEndsDate.setDate(trialEndsDate.getDate() + 14);

      const starterSubRef = await addDoc(collection(db,'subscriptions'), {
        companyId: compRef.id,
        businessName: regForm.companyName,
        adminEmail: userEmail,
        plan: 'starter',
        status: 'trial',
        analyticsAccessLevel: 'free',
        analyticsTrialStartedAt: serverTimestamp(),
        analyticsTrialEndsAt: Timestamp.fromDate(trialEndsDate),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(err => console.error('Failed to create trial subscription:', err));
      if (starterSubRef?.id) {
        await updateDoc(doc(db, 'companies', compRef.id), {
          subscriptionId: starterSubRef.id,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      // Welcome notification
      await addDoc(collection(db,'notifications'), {
        companyId: compRef.id, type:'welcome',
        message:`Welcome to Irema! Your listing for ${regForm.companyName} is now live.`,
        createdAt: serverTimestamp(), read: false
      }).catch(()=>{});

      setRegGoogleUser(null);
      setRegSuccess(true);
      isRegisteringRef.current = false;
      navigate('/company-dashboard', { replace: true });
    } catch(err) {
      isRegisteringRef.current = false;
      setRegErr(getAuthErrorMessage(err));
    }
    setRegLoading(false);
  }

  // CLAIM - search for existing business
  async function handleClaimSearch() {
    if (!claimSearch.trim()) return;
    setClaimSearching(true);
    try {
      const results = [];
      // Search by name
      const snap = await getDocs(collection(db,'companies'));
      const q = claimSearch.toLowerCase().trim();
      snap.docs.forEach(d => {
        const data = d.data();
        if (isArchivedRecord(data)) return;
        const n = (data.companyName||data.name||'').toLowerCase();
        const cat = (data.category||'').toLowerCase();
        if (n.includes(q) || cat.includes(q)) results.push({id:d.id,...data});
      });
      setClaimResults(results.slice(0,8));
    } catch(e){ console.error(e); }
    setClaimSearching(false);
  }

  async function handleClaimSubmit(e) {
    e.preventDefault(); setClaimErr(''); setClaimLoading(true);
    isClaimingRef.current = true;
    if (!claimSelected) { setClaimErr('Please select a business first.'); setClaimLoading(false); return; }
    if (!claimForm.firstName?.trim()) { setClaimErr('First name is required.'); setClaimLoading(false); return; }
    if (!claimForm.lastName?.trim()) { setClaimErr('Last name is required.'); setClaimLoading(false); return; }
    if (!claimForm.phone?.trim()) { setClaimErr('Phone number is required.'); setClaimLoading(false); return; }

    // Only validate email/password when not already signed in
    if (!user) {
      if (!claimForm.email?.trim()) { setClaimErr('Email is required.'); setClaimLoading(false); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimForm.email)) { setClaimErr('Enter a valid email address.'); setClaimLoading(false); return; }
      if (!claimForm.password) { setClaimErr('Password is required.'); setClaimLoading(false); return; }
      if (claimForm.password.length < 6) { setClaimErr('Password must be at least 6 characters.'); setClaimLoading(false); return; }
    }

    try {
      let uid, userEmail;

      if (user) {
        // Already signed in — use existing account directly
        uid = user.uid;
        userEmail = user.email;
      } else {
        // Not signed in — create account or sign in
        await setPersistence(auth, browserLocalPersistence);
        userEmail = claimForm.email;
        try {
          const cred = await createUserWithEmailAndPassword(auth, claimForm.email, claimForm.password);
          uid = cred.user.uid;
          await updateProfile(cred.user, { displayName: `${claimForm.firstName} ${claimForm.lastName}` });
          await sendEmailVerification(cred.user, getEmailVerificationActionCodeSettings());
          await setDoc(doc(db,'users',uid), {
            uid, email: claimForm.email,
            displayName: `${claimForm.firstName} ${claimForm.lastName}`,
            role: 'company_admin',
            authProvider: 'password',
            emailVerificationRequired: true,
            emailVerified: false,
            emailVerificationRequiredAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            pendingClaimId: null,
          });
        } catch(authErr) {
          if (authErr.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(auth, claimForm.email, claimForm.password);
              uid = cred.user.uid;
            } catch {
              setClaimErr('Email already registered. Please enter your correct password, or use a different email.');
              setClaimLoading(false); return;
            }
          } else { throw authErr; }
        }
      }

      // Duplicate claim guard — one pending claim per user per business
      const existingSnap = await getDocs(
        query(collection(db, 'claims'), where('claimantUserId', '==', uid))
      );
      const duplicate = existingSnap.docs.find(d => {
        const data = d.data();
        return data.companyId === claimSelected.id && (!data.status || data.status === 'pending');
      });
      if (duplicate) {
        setClaimErr('You already have a pending claim for this business. Please wait for our team to review it.');
        setClaimLoading(false);
        isClaimingRef.current = false;
        return;
      }

      // Submit claim
      const claimRef = await addDoc(collection(db,'claims'), {
        companyId: claimSelected.id,
        companyName: claimSelected.name||claimSelected.companyName,
        claimantUserId: uid,
        claimantEmail: userEmail,
        claimantName: `${claimForm.firstName} ${claimForm.lastName}`,
        claimantPhone: claimForm.phone,
        claimantRole: claimForm.role,
        alreadyClaimed: !!claimSelected.adminUserId,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Link claim to user for status tracking
      await updateDoc(doc(db,'users',uid), { pendingClaimId: claimRef.id }).catch(e => {
        console.error('Failed to link claim to user:', e);
      });

      setClaimSuccess(true);
    } catch(err) {
      console.error('Claim error:', err);
      setClaimErr(getAuthErrorMessage(err));
    } finally {
      setClaimLoading(false);
      isClaimingRef.current = false;
    }
  }

  const setReg = f => e => setRegForm(p=>({...p,[f]:e.target.value}));

  // Show nothing while checking auth — prevents login page flash for already-logged-in users
  if (authChecking) return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg,#fff)'}}>
      <div style={{width:40,height:40,border:'3px solid #c8ead9',borderTop:'3px solid #2d8f6f',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
    <div className="bp-root">
      {/* Navbar */}
      <header className="bp-navbar">
        <div className="bp-navbar-inner">
          {/* Logo links home on its own. "for Business" is a non-clickable page title so
              users aren't confused into thinking the tagline is the return-home link. */}
          <div className="bp-logo-wrap">
            <a href="/" className="bp-logo" aria-label="Irema home">
              <BizLogo />
              <span className="bp-logo-text">Irema</span>
            </a>
            <span className="bp-logo-for" aria-hidden="true">for Business</span>
          </div>
          {/* Desktop nav — hidden on mobile */}
          <nav className="bp-nav-links bp-nav-desktop">
            <a className="bp-nav-link" href="#features">{t('biz.nav_features')}</a>
            <a className="bp-nav-link" href="#pricing">{t('biz.nav_pricing')}</a>
          </nav>
          <div className="bp-nav-actions">
            <select className="bp-lang-sel" value={i18n.language} onChange={e=>{i18n.changeLanguage(e.target.value);localStorage.setItem('irema_lang',e.target.value);}}>
              <option value="en">EN</option><option value="fr">FR</option>
              <option value="rw">RW</option><option value="sw">SW</option>
            </select>
            <button className="bp-theme-btn" onClick={toggleTheme} title="Toggle theme"
              style={{width:36,height:36,borderRadius:'50%',border:'1px solid var(--border,#e5e7eb)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-2,#374151)',flexShrink:0}}>
              {theme==='dark'
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
            {/* Desktop auth buttons. The onAuthStateChanged listener above
                redirects business owners to /company-dashboard immediately,
                so anyone who ends up rendering this page is either signed-
                out or a regular consumer — in both cases they need to Log in
                (as a business) rather than be shown "Go to Dashboard". */}
            <div className="bp-nav-desktop" style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="bp-login-link" onClick={()=>setModal('login')}>{t('biz.log_in')}</button>
              <button className="bp-claim-btn" onClick={()=>setModal('claim')}>{t('biz.claim_your_biz')}</button>
              <button className="bp-cta-btn" onClick={()=>setModal('register')}>{t('biz.start_free')}</button>
            </div>
            {/* Mobile hamburger */}
            <button className="bp-hamburger" onClick={()=>setBizMobileOpen(v=>!v)} aria-label="Menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                {bizMobileOpen
                  ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                  : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
                }
              </svg>
            </button>
          </div>
        </div>
        {/* Mobile drawer */}
        {bizMobileOpen && (
          <div className="bp-mobile-menu">
            <a className="bp-mobile-item" href="#features" onClick={()=>setBizMobileOpen(false)}>Features</a>
            <a className="bp-mobile-item" href="#pricing" onClick={()=>setBizMobileOpen(false)}>Pricing</a>
            <div style={{height:1,background:'#e5e7eb',margin:'4px 0'}}/>
            <button className="bp-mobile-item" onClick={()=>{setModal('login');setBizMobileOpen(false);}}>Log in</button>
            <button className="bp-mobile-item" onClick={()=>{setModal('claim');setBizMobileOpen(false);}}>Claim your business</button>
            <button className="bp-mobile-item bp-mobile-cta" onClick={()=>{setModal('register');setBizMobileOpen(false);}}>List Your Business Free →</button>
          </div>
        )}
      </header>

      {/* Stats banner */}
      <div className="bp-stats-banner">
        <div className="bp-stats-inner">
          <span>🇷🇼 {t('biz.stat_platform')}</span>
          <span className="bp-sep">·</span>
          <span><strong>{trustPct}%</strong> of users trust businesses with positive reviews</span>
          <span className="bp-sep">·</span>
          <span>{t('biz.stat_languages')}</span>
        </div>
      </div>

      {/* Hero */}
      <section className="bp-hero">
        <div className="bp-hero-inner">
          <div className="bp-hero-label">{t('biz.trusted_label')}</div>
          <h1>{t('biz.hero_h1_line1')}<br /><span className="bp-hero-accent">{t('biz.hero_h1_accent')}</span></h1>
          <p className="bp-hero-sub">
            {t('biz.hero_sub_full')}
          </p>
          <div className="bp-hero-btns">
            <button className="bp-btn-primary" onClick={()=>setModal('register')}>{t('biz.start_no_card')}</button>
            <button className="bp-btn-ghost" onClick={()=>setModal('claim')}>{t('biz.already_claim')}</button>
          </div>
          {/* Social proof strip */}
          <div className="bp-hero-proof">
            <div className="bp-proof-stars">{'★★★★★'}</div>
            <span>{businessCount > 0 ? `Trusted by ${businessCount}+ Rwandan businesses` : t('biz.trusted_count')}</span>
          </div>
        </div>
        <div className="bp-hero-visual">
          <div className="bp-mockup">
            <div className="bp-mockup-header">
              <div className="bp-mock-dot"/><div className="bp-mock-dot"/><div className="bp-mock-dot"/>
            </div>
            <div className="bp-mockup-body">
              <div className="bp-mock-stat">{heroAvg} ★ <span>{t('biz.avg_rating_label')}</span></div>
              <div className="bp-mock-bar"><div style={{width:`${trustPct}%`,height:8,background:'#2d8f6f',borderRadius:4}}/><span>{trustPct}% positive</span></div>
              <div className="bp-mock-review">
                <div className="bp-mock-r-star">★★★★★</div>
                <div className="bp-mock-r-text">"Excellent service, very professional team!"</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bp-features" id="features">
        <div className="bp-container">
          <div className="bp-section-label">{t('biz.everything_need')}</div>
          <h2>{t('biz.run_reputation')}</h2>
          <div className="bp-feature-grid">
            {[
              {icon:'📈', key:'analytics'},
              {icon:'↩️', key:'reply'},
              {icon:'🏆', key:'competitor'},
              {icon:'🔔', key:'notif'},
              {icon:'🌍', key:'lang'},
              {icon:'✅', key:'badge'},
            ].map(f=>(
              <div key={f.key} className="bp-feat-card">
                <div className="bp-feat-icon">{f.icon}</div>
                <h3>{t(`biz.feat_${f.key}_t`)}</h3>
                <p>{t(`biz.feat_${f.key}_d`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bp-pricing" id="pricing">
        <div className="bp-container">
          <div className="bp-section-label">{t('biz.pricing_for_rw')}</div>
          <h2>{t('biz.plans_fit')}</h2>
          <div className="bp-pricing-grid">
            {[
              {
                nameKey:'plan_starter',
                price:'Free',
                subKey:'plan_starter_sub',
                features:[
                  '1 business listing',
                  'Unlimited reviews from customers',
                  'Respond to up to 50 reviews',
                  'Email notifications',
                  'Community badge',
                  '14-day free trial on signup',
                ],
                analyticsFeatures:[
                  'Avg Rating',
                  'Total Reviews',
                  'Response Rate',
                  'Top Complaint',
                  'Rating Distribution',
                  'Review Count This Month',
                ],
                ctaKey:'start_free_plan',
                primary:false,
                isEnt:false
              },
              {
                nameKey:'plan_pro',
                price:'25,000 RWF',
                subKey:'plan_pro_sub',
                features:[
                  '1 business listing',
                  'Unlimited reviews',
                  'Unlimited responses to reviews',
                  'Verified badge',
                  'QR code downloads',
                  'Priority support',
                  'Competitor insights',
                ],
                analyticsFeatures:[
                  'Everything in Starter analytics',
                  'Sentiment score & analysis',
                  'Positive / Negative % breakdown',
                  'Competitor benchmarking & rank',
                  'Trend forecasting & growth rate',
                  'Price perception score',
                  'Product Quality Score',
                  'Review velocity',
                  'Top praised & complaint themes',
                ],
                ctaKey:'start_trial',
                primary:true,
                isEnt:false
              },
              {
                nameKey:'plan_ent',
                price:'75,000 RWF',
                subKey:'plan_ent_sub',
                features:[
                  'Up to 5 business listings',
                  'Unlimited everything',
                  'Unlimited responses',
                  'AI sentiment analysis',
                  'Dedicated account manager',
                  'Custom integrations',
                  'White-label widgets',
                  'API access',
                  'SLA support',
                  'Product listings on your page',
                ],
                analyticsFeatures:[
                  'Everything in Professional analytics',
                  'AI-powered recommendations',
                  'Revenue forecasting',
                  'Executive reports',
                  'Full premium metrics dashboard',
                ],
                ctaKey:'contact_sales',
                primary:false,
                isEnt:true
              },
            ].map(plan=>(
              <div key={plan.nameKey} className={`bp-price-card${plan.primary?' bp-price-highlight':''}`}>
                {plan.primary && <div className="bp-price-pop">{t('biz.most_popular')}</div>}
                <h3>{t(`biz.${plan.nameKey}`)}</h3>
                <div className="bp-price-num">{plan.price}</div>
                <div className="bp-price-sub">{t(`biz.${plan.subKey}`)}</div>
                <ul>
                  {plan.features.map(f=><li key={f}><span>✓</span>{f}</li>)}
                </ul>
                {plan.analyticsFeatures?.length > 0 && (
                  <>
                    <div className="bp-price-analytics-label">📊 Analytics Included</div>
                    <ul>
                      {plan.analyticsFeatures.map(f=><li key={f}><span>✓</span>{f}</li>)}
                    </ul>
                  </>
                )}
                <button className={plan.primary?'bp-btn-primary':'bp-btn-outline'}
                  onClick={()=>setModal('register')}>
                  {t(`biz.${plan.ctaKey}`)}
                </button>
              </div>
            ))}
          </div>
          <p className="bp-pricing-note">{t('biz.pay_methods')}</p>
        </div>
      </section>

      {/* CTA - Professional */}
      <section className="bp-cta-section">
        <div className="bp-container">
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',gap:0}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:99,padding:'6px 18px',fontSize:'0.78rem',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:20,color:'rgba(255,255,255,0.9)'}}>
              🚀 Join businesses across Rwanda
            </div>
            <h2 style={{fontSize:'clamp(1.8rem,4vw,2.8rem)',fontWeight:800,margin:'0 0 14px',letterSpacing:'-0.02em',lineHeight:1.15}}>
              {t('biz.ready_grow')}
            </h2>
            <p style={{fontSize:'1.05rem',opacity:0.8,maxWidth:480,margin:'0 0 32px',lineHeight:1.6}}>
              {t('biz.join_hundreds')}
            </p>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="bp-btn-primary" style={{padding:'14px 32px',fontSize:'1rem',fontWeight:700,borderRadius:12,minWidth:200}} onClick={()=>setModal('register')}>
                {t('biz.create_free_acc')} →
              </button>
              <button className="bp-btn-ghost" style={{padding:'14px 28px',fontSize:'0.95rem',borderRadius:12,minWidth:160}} onClick={()=>setModal('claim')}>
                {t('biz.claim_existing')}
              </button>
            </div>
            <div style={{display:'flex',gap:28,marginTop:32,flexWrap:'wrap',justifyContent:'center'}}>
              {[['✓ Free forever plan','No credit card required'],['✓ Setup in 5 minutes','Start collecting reviews today'],['✓ Rwanda-first support','Local team, local knowledge']].map(([bold,sub])=>(
                <div key={bold} style={{fontSize:'0.82rem',color:'rgba(255,255,255,0.75)'}}>
                  <span style={{fontWeight:700,color:'white'}}>{bold}</span>
                  <span style={{display:'block',opacity:0.65,fontSize:'0.75rem',marginTop:2}}>{sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGIN MODAL ── */}
      {modal==='login' && (
        <div className="bp-overlay" onClick={()=>setModal(null)}>
          <div className="bp-modal" onClick={e=>e.stopPropagation()}>
            <button className="bp-modal-close" onClick={()=>setModal(null)}>✕</button>
            <div className="bp-modal-logo"><BizLogo/></div>
            <h2>{t('biz.modal_login_title')}</h2>
            <p>{t('biz.modal_login_sub')}</p>
            {resetSent ? (
              <div className="bp-success">Password reset email sent. Check your inbox.</div>
            ) : (
              <>
                {loginErr && <div className="bp-error">{loginErr}</div>}
                <button className="bp-google-btn" onClick={handleGoogleBizLogin} disabled={loginLoading} type="button">
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                <div className="bp-divider"><span>{t('biz.or')}</span></div>
                <form onSubmit={handleLogin}>
                  <input className="bp-input" type="email" placeholder="Work email" required
                    value={loginForm.email} onChange={e=>setLoginForm(p=>({...p,email:e.target.value}))}/>
                  <div style={{position:'relative'}}>
                    <input className="bp-input" type={showLoginPw ? 'text' : 'password'} placeholder="Password" required
                      value={loginForm.password} onChange={e=>setLoginForm(p=>({...p,password:e.target.value}))} style={{paddingRight:40}}/>
                    <button type="button" onClick={()=>setShowLoginPw(v=>!v)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:'0.9rem',padding:0}}>
                      {showLoginPw ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <button className="bp-btn-primary" type="submit" style={{width:'100%'}} disabled={loginLoading}>
                    {loginLoading?t('biz.logging_in'):t('biz.login')}
                  </button>
                </form>
                <button className="bp-text-btn" onClick={handleForgotPassword}>{t('biz.forgot_pw')}</button>
              </>
            )}
            <p className="bp-modal-alt">{t('biz.no_account_q')} <button className="bp-switch" onClick={()=>setModal('register')}>{t('biz.create_one')}</button></p>
          </div>
        </div>
      )}

      {/* ── REGISTER MODAL ── */}
      {modal==='register' && (
        <div className="bp-overlay" onClick={()=>{setModal(null);setRegGoogleUser(null);isRegisteringRef.current=false;}}>
          <div className="bp-modal bp-modal-wide" onClick={e=>e.stopPropagation()}>
            <button className="bp-modal-close" onClick={()=>{setModal(null);setRegGoogleUser(null);isRegisteringRef.current=false;}}>✕</button>
            <div className="bp-modal-logo"><BizLogo/></div>
            <h2>{t('biz.reg_title')}</h2>
            <p>{t('biz.reg_sub')}</p>

            {/* Google sign-up button — only show when NOT already google-authed */}
            {!regGoogleUser && !regSuccess && (
              <>
                <button className="bp-google-btn" type="button" onClick={handleGoogleBizLogin} disabled={regLoading}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Sign up with Google
                </button>
                <div className="bp-divider"><span>or fill in details</span></div>
              </>
            )}

            {regGoogleUser && !regSuccess && (
              <div className="bp-google-prefill-note">
                ✅ Signed in as <strong>{regGoogleUser.email}</strong> via Google. Complete your business details below.
              </div>
            )}

            {regErr && <div className="bp-error">{regErr}</div>}
            {regSuccess
              ? <div className="bp-success">🎉 Account created! Redirecting to your dashboard…</div>
              : (
              <form onSubmit={handleRegister}>
                <div style={{fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--brand)',marginBottom:4}}>Your Details</div>
                <div className="bp-form-grid">
                  <input className="bp-input" placeholder="First name *" required value={regForm.firstName} onChange={setReg('firstName')}/>
                  <input className="bp-input" placeholder="Last name *" required value={regForm.lastName} onChange={setReg('lastName')}/>
                  <div style={{gridColumn:'1/-1',fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--brand)',marginTop:8}}>Business Details</div>
                  <input className="bp-input" placeholder="Company name *" required value={regForm.companyName} onChange={setReg('companyName')} style={{gridColumn:'1/-1'}}/>
                  <select className="bp-input" required value={regForm.category} onChange={setReg('category')} style={{gridColumn:'1/-1'}}>
                    <option value="">{t('biz.select_cat')}</option>
                    {CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}
                  </select>
                  {regForm.category === 'other' && (
                    <input className="bp-input" placeholder="Please describe your business type *" required value={otherCategoryDetails} onChange={e=>setOtherCategoryDetails(e.target.value)} style={{gridColumn:'1/-1', background:'var(--surface-accent, #f0f8f5)', borderColor:'var(--brand-xlight)'}}/>
                  )}
                  <input className="bp-input" type="email" placeholder={regGoogleUser ? "Email (from Google account)" : "Work email *"} required value={regForm.email} onChange={setReg('email')} readOnly={!!regGoogleUser}/>
                  {/* Password only needed for email signup, not Google */}
                    {!regGoogleUser && (
                      <div style={{position:'relative',gridColumn:'1/-1'}}>
                        <input className="bp-input" type={showRegPw ? 'text' : 'password'} placeholder="Password (min 6 chars) *" required minLength="6" value={regForm.password} onChange={setReg('password')} style={{paddingRight:40}}/>
                        <button type="button" onClick={()=>setShowRegPw(v=>!v)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:'0.9rem',padding:0}}>
                          {showRegPw ? '🙈' : '👁️'}
                        </button>
                      </div>
                    )}
                  <input className="bp-input" type="tel" placeholder="Phone number (+250…)" value={regForm.phoneNumber} onChange={setReg('phoneNumber')}/>
                  <input className="bp-input" type="url" placeholder="Website URL (optional)" value={regForm.website} onChange={setReg('website')}/>
                  {/* Location fields */}
                  <input className="bp-input" placeholder="Street address (optional)" value={regForm.address} onChange={setReg('address')} style={{gridColumn:'1/-1'}}/>
                  <input className="bp-input" placeholder="City / Town *" required value={regForm.city} onChange={setReg('city')}/>
                  <select className="bp-input" value={regForm.district} onChange={setReg('district')}>
                    <option value="">District (optional)</option>
                    {['Gasabo','Kicukiro','Nyarugenge','Bugesera','Gatsibo','Kayonza','Kirehe','Masenyi','Ngoma','Nyagatare','Rwagamana','Burera','Gakenke','Gicumbi','Musanze','Rulindo','Gisagara','Huye','Kamonyi','Muhanga','Nyamagabe','Nyanza','Nyaruguru','Ruhango','Karongi','Ngororero','Nyabihu','Nyamasheke','Rubavu','Rusizi','Rutsiro','Rwanguve'].map(d=>
                      <option key={d} value={d}>{d}</option>
                    )}
                  </select>
                  <select className="bp-input" value={regForm.employees} onChange={setReg('employees')}>
                    {['1-10','11-50','51-200','201-500','500+'].map(s=><option key={s} value={s}>{s} employees</option>)}
                  </select>
                </div>
                <div style={{display:'flex',alignItems:'flex-start',gap:10,margin:'12px 0 4px'}}>
                  <input type="checkbox" id="biz-terms" checked={regTermsAccepted} onChange={e=>setRegTermsAccepted(e.target.checked)}
                    style={{width:16,height:16,marginTop:2,accentColor:'#2d8f6f',cursor:'pointer',flexShrink:0}}/>
                  <label htmlFor="biz-terms" style={{fontSize:'0.79rem',color:'#6b7d77',lineHeight:1.5,cursor:'pointer'}}>
                    I agree to Irema's <button type="button" style={{background:'none',border:'none',color:'#2d8f6f',fontWeight:600,cursor:'pointer',padding:0,fontSize:'0.79rem'}} onClick={()=>setShowBizTerms(true)}>Terms & Conditions</button> for businesses
                  </label>
                </div>
                <button className="bp-btn-primary" type="submit" style={{width:'100%',marginTop:8}} disabled={regLoading||!regTermsAccepted}>
                  {regLoading?'Creating account…':'Create Account & Go to Dashboard'}
                </button>
              </form>
            )}
            <p className="bp-modal-alt">Have an account? <button className="bp-switch" onClick={()=>setModal('login')}>{t('biz.log_in')}</button></p>
          </div>
        </div>
      )}

      {/* ── CLAIM MODAL ── */}
      {modal==='claim' && (
        <div className="bp-overlay" onClick={()=>setModal(null)}>
          <div className="bp-modal bp-modal-wide" onClick={e=>e.stopPropagation()}>
            <button className="bp-modal-close" onClick={()=>setModal(null)}>✕</button>
            <div className="bp-modal-logo"><BizLogo/></div>
            <h2>{t('biz.claim_biz_title')}</h2>
            <p>{t('biz.claim_biz_sub')}</p>

            {claimSuccess ? (
              <div className="bp-success">
                ✅ Claim submitted! Our team will review your request and transfer access within 24 hours. You will receive an email confirmation.
              </div>
            ) : (
              <>
                {/* Search step */}
                {!claimSelected && (
                  <div>
                    <div className="bp-claim-search-row">
                      <input className="bp-input" placeholder={t('biz.claim_search_ph')}
                        value={claimSearch} onChange={e=>setClaimSearch(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&handleClaimSearch()}/>
                      <button className="bp-btn-primary" onClick={handleClaimSearch} disabled={claimSearching}>
                        {claimSearching?t('biz.searching'):t('biz.search')}
                      </button>
                    </div>
                    {claimResults.length>0 && (
                      <div className="bp-claim-results">
                        {claimResults.map(c=>(
                          <div key={c.id} className="bp-claim-result-item" onClick={()=>setClaimSelected(c)}>
                            <div className="bp-claim-result-avatar">{(c.name||c.companyName||'B')[0].toUpperCase()}</div>
                            <div>
                              <strong>{c.name||c.companyName}</strong>
                              <div style={{fontSize:'0.75rem',color:'#6b7d77'}}>{c.category} · {c.country||'RW'}{c.adminUserId?(' · '+t('biz.already_claimed')):(' · '+t('biz.unclaimed'))}</div>
                            </div>
                            <span className="bp-claim-select">Select →</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {claimResults.length===0 && claimSearch && !claimSearching && (
                      <p style={{fontSize:'0.85rem',color:'#9aada7',marginTop:12}}>
                        No results found. <button className="bp-switch" onClick={()=>setModal('register')}>Register your business instead →</button>
                      </p>
                    )}
                  </div>
                )}
                {/* Selected - show claim form */}
                {claimSelected && (
                  <div>
                    <div className="bp-claim-selected">
                      <div className="bp-claim-result-avatar">{(claimSelected.name||claimSelected.companyName||'B')[0].toUpperCase()}</div>
                      <div>
                        <strong>{claimSelected.name||claimSelected.companyName}</strong>
                        <div style={{fontSize:'0.75rem',color:'#6b7d77'}}>{claimSelected.category}</div>
                      </div>
                      <button className="bp-switch" onClick={()=>{setClaimSelected(null);setClaimResults([]); setClaimSearch('');}}>← Change</button>
                    </div>
                    {claimErr && <div className="bp-error">{claimErr}</div>}
                    {/* Show who we're claiming as when already signed in */}
                    {user && (
                      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#f0faf6',borderRadius:10,border:'1px solid #bbf7d0',marginBottom:12}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f6b52" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span style={{fontSize:'0.83rem',color:'#1f6b52',fontWeight:600}}>
                          Claiming as {user.displayName || user.email}
                        </span>
                      </div>
                    )}
                    <form onSubmit={handleClaimSubmit}>
                      <div className="bp-form-grid">
                        <input className="bp-input" placeholder="First name *" required value={claimForm.firstName} onChange={e=>setClaimForm(p=>({...p,firstName:e.target.value}))}/>
                        <input className="bp-input" placeholder="Last name *" required value={claimForm.lastName} onChange={e=>setClaimForm(p=>({...p,lastName:e.target.value}))}/>
                        {/* Only show email + password when not signed in */}
                        {!user && (<>
                          <input className="bp-input" type="email" placeholder="Your work email *" required value={claimForm.email} onChange={e=>setClaimForm(p=>({...p,email:e.target.value}))}/>
                          <div style={{position:'relative'}}>
                            <input className="bp-input" type={showClaimPw ? 'text' : 'password'} placeholder="Create password *" required minLength="6" value={claimForm.password} onChange={e=>setClaimForm(p=>({...p,password:e.target.value}))} style={{paddingRight:40}}/>
                            <button type="button" onClick={()=>setShowClaimPw(v=>!v)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:'0.9rem',padding:0}}>
                              {showClaimPw ? '🙈' : '👁️'}
                            </button>
                          </div>
                        </>)}
                        <input className="bp-input" type="tel" placeholder="Phone number *" required value={claimForm.phone} onChange={e=>setClaimForm(p=>({...p,phone:e.target.value}))} style={{gridColumn:'1/-1'}}/>
                        <input className="bp-input" placeholder="Your role (e.g. Owner, Manager)" value={claimForm.role} onChange={e=>setClaimForm(p=>({...p,role:e.target.value}))} style={{gridColumn:'1/-1'}}/>
                      </div>
                      <p style={{fontSize:'0.78rem',color:'#9aada7',margin:'10px 0 16px'}}>
                        {claimSelected.adminUserId
                          ? '⚠️ This business is already claimed. We will verify your ownership and transfer access within 24 hours.'
                          : '✅ This business is unclaimed and will be transferred to you after verification.'}
                      </p>
                      <button className="bp-btn-primary" type="submit" style={{width:'100%'}} disabled={claimLoading}>
                        {claimLoading?'Submitting claim…':'Submit Ownership Claim'}
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
            <p className="bp-modal-alt">Not listed? <button className="bp-switch" onClick={()=>setModal('register')}>Register your business</button></p>
          </div>
        </div>
      )}
    </div>
    <Footer />

    {/* ── Terms & Conditions Modal ── */}
    {showBizTerms && (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:4000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(4px)'}}
        onClick={e=>e.target===e.currentTarget&&setShowBizTerms(false)}>
        <div style={{background:'var(--surface,#fff)',borderRadius:20,padding:32,maxWidth:600,width:'100%',maxHeight:'88vh',overflowY:'auto',position:'relative',boxShadow:'0 24px 60px rgba(0,0,0,0.25)'}}>
          <button onClick={()=>setShowBizTerms(false)} style={{position:'absolute',top:16,right:16,width:32,height:32,borderRadius:'50%',border:'1px solid #e5e7eb',background:'#f9fafb',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.85rem',color:'#6b7280'}}>✕</button>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
            <div style={{width:44,height:44,borderRadius:12,background:'#eef8f3',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d8f6f" strokeWidth="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <div>
              <h2 style={{margin:0,fontFamily:'Sora,sans-serif',fontSize:'1.2rem',fontWeight:800,color:'#111'}}>Terms & Conditions for Businesses</h2>
              <p style={{margin:0,fontSize:'0.78rem',color:'#6b7280'}}>Effective January 1, 2026 · Irema Ltd, Kigali, Rwanda</p>
            </div>
          </div>
          {[
            ['1. Acceptance of Terms','By registering your business on Irema, you agree to be bound by these Terms & Conditions. Irema is Rwanda\'s trusted business review platform connecting service providers with consumers across East Africa.'],
            ['2. Business Account','You must provide accurate, truthful information about your business. You are responsible for maintaining the security of your account credentials. Irema reserves the right to suspend accounts that violate these terms or provide false information.'],
            ['3. Review Policy','Business owners may not solicit, purchase, or incentivize reviews. You may respond to reviews professionally. Attempts to manipulate, fake, or suppress reviews will result in immediate account termination and may be reported to relevant authorities.'],
            ['4. Content Ownership','You retain ownership of content you upload (logos, photos, descriptions). By uploading content you grant Irema a non-exclusive license to display it on the platform. You must have the right to use all content you upload.'],
            ['5. Subscription & Payments','Free plan features are provided as-is. Paid plans (Professional/Enterprise) are billed as described at time of purchase. Payments via MTN MoMo, Airtel Money, or bank transfer are final unless otherwise stated. Irema reserves the right to change pricing with 30 days notice.'],
            ['6. Trial Period','14-day free trials are available once per business. Upon trial expiration, features revert to the free plan unless a paid subscription is activated. Irema may terminate trials for abuse or policy violations.'],
            ['7. Data & Privacy','We collect and process business data as described in our Privacy Policy. You agree not to use Irema to collect or process personal customer data in violation of Rwandan law or GDPR where applicable.'],
            ['8. Limitation of Liability','Irema is not liable for losses arising from customer reviews, service disruptions, or actions of third parties. Our maximum liability is limited to fees paid in the preceding 3 months.'],
            ['9. Governing Law','These terms are governed by the laws of Rwanda. Disputes shall be resolved in Kigali courts unless otherwise agreed in writing.'],
            ['10. Changes','Irema may update these terms with 14 days notice via email or platform notification. Continued use after notice constitutes acceptance.'],
          ].map(([title, text]) => (
            <div key={title} style={{marginBottom:18}}>
              <h4 style={{fontFamily:'Sora,sans-serif',fontSize:'0.88rem',fontWeight:700,color:'#2d8f6f',margin:'0 0 6px'}}>{title}</h4>
              <p style={{fontSize:'0.84rem',color:'#374151',lineHeight:1.75,margin:0}}>{text}</p>
            </div>
          ))}
          <div style={{marginTop:24,paddingTop:16,borderTop:'1px solid #e5e7eb',display:'flex',justifyContent:'flex-end'}}>
            <button onClick={()=>setShowBizTerms(false)} style={{padding:'10px 28px',background:'#2d8f6f',color:'white',border:'none',borderRadius:10,fontWeight:700,fontSize:'0.9rem',cursor:'pointer',fontFamily:'inherit'}}>
              I Understand
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
