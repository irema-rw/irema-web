import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../../firebase/config';
import { signInWithEmailAndPassword, onAuthStateChanged, updatePassword, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import './AdminLogin.css';
import { LANGUAGES } from '../../constants/languages';
import { getAuthErrorMessage } from '../../utils/authErrors';

async function verifyLoginTOTP(secret, code) {
  const period = 30;
  const now = Date.now();
  for (let i = -1; i <= 1; i++) {
    const counter = Math.floor((now + i * 30000) / 1000 / period);
    const msgBytes = new Uint8Array(8);
    let c = counter;
    for (let j = 7; j >= 0; j--) { msgBytes[j] = c & 0xff; c = Math.floor(c / 256); }
    const keyBytes = Uint8Array.from(atob(secret.replace(/-/g, '').replace(/_/g, '/').padRight(32, 'A')), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const hmacBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
    const hmacArray = new Uint8Array(hmacBuffer);
    const offset = hmacArray[hmacArray.length - 1] & 0xf;
    const binary = ((hmacArray[offset] & 0x7f) << 24) | ((hmacArray[offset + 1] & 0xff) << 16) | ((hmacArray[offset + 2] & 0xff) << 8) | (hmacArray[offset + 3] & 0xff);
    const otp = binary % 1000000;
    if (String(otp).padStart(6, '0') === code.trim()) return true;
  }
  return false;
}

function LogoMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="60" height="60" rx="14" fill="url(#loginLogoGrad)"/>
      <defs>
        <linearGradient id="loginLogoGrad" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1f6b52"/>
          <stop offset="100%" stopColor="#164d3b"/>
        </linearGradient>
      </defs>
      <polygon points="30,8 34.5,21.5 49,21.5 37.5,30 41.5,43.5 30,35 18.5,43.5 22.5,30 11,21.5 25.5,21.5" fill="#E8B800"/>
      <polygon points="30,13 33.2,22.8 43.5,22.8 35.4,28.8 38.2,38.5 30,33 21.8,38.5 24.6,28.8 16.5,22.8 26.8,22.8" fill="rgba(255,255,255,0.22)"/>
      <circle cx="30" cy="27" r="3.5" fill="rgba(255,255,255,0.55)"/>
    </svg>
  );
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [mustChangePw, setMustChangePw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [tempUser, setTempUser] = useState(null);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [pendingCredential, setPendingCredential] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  // If already logged in as admin, go straight to dashboard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) return;
      try {
        const snap = await getDoc(doc(db, 'admin_users', u.uid));
        if (snap.exists() && snap.data()?.isActive !== false) {
          navigate('/admin', { replace: true });
        }
      } catch {}
    });
    return unsub;
  }, [navigate]);

  function changeLang(code) {
    i18n.changeLanguage(code);
    localStorage.setItem('irema_lang', code);
    setLangOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const adminDoc = await getDoc(doc(db, 'admin_users', cred.user.uid));
      if (adminDoc.exists() && adminDoc.data().isActive !== false) {
        const data = adminDoc.data();
        if (data.mustChangePassword) {
          setTempUser(cred.user);
          setMustChangePw(true);
          setLoading(false);
          return;
        }
        const settingsSnap = await getDoc(doc(db, 'admin_settings', 'security')).catch(()=>null);
        const require2FA = settingsSnap?.data()?.require2FA || false;
        if (require2FA) {
          const twoFADoc = await getDoc(doc(db, 'admin_2fa', cred.user.uid)).catch(()=>null);
          if (twoFADoc?.data()?.enabled) {
            setPendingCredential(cred);
            setTotpRequired(true);
            setLoading(false);
            return;
          }
        }
        navigate('/admin');
      } else {
        await auth.signOut();
        setError(t('admin_login.error_no_access') || 'Access denied. Admin account not found or inactive.');
      }
    } catch(err) {
      setError(
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? (t('admin_login.error_invalid') || 'Invalid email or password. Please try again.')
          : getAuthErrorMessage(err)
      );
    }
    setLoading(false);
  }

  async function handleTOTPSubmit(e) {
    e.preventDefault();
    setTotpError(''); setTotpLoading(true);
    try {
      const twoFADoc = await getDoc(doc(db, 'admin_2fa', pendingCredential.user.uid)).catch(()=>null);
      const stored = twoFADoc?.data();
      if (!stored?.secret) { setTotpError('TOTP secret not found. Please contact your administrator.'); setTotpLoading(false); return; }
      const { decryptSecret } = await import('./AdminTwoFactor');
      const secret = await decryptSecret(stored.secret);
      if (!secret) { setTotpError('Failed to decrypt TOTP secret. Please contact your administrator.'); setTotpLoading(false); return; }
      const valid = await verifyLoginTOTP(secret, totpCode);
      if (!valid) { setTotpError('Invalid code. Make sure your authenticator app time is correct.'); setTotpLoading(false); return; }
      navigate('/admin');
    } catch(err) {
      setTotpError(err.message || 'Verification failed. Please try again.');
    }
    setTotpLoading(false);
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPw !== newPwConfirm) { setError('Passwords do not match.'); return; }
    setChangingPw(true);
    try {
      await updatePassword(tempUser, newPw);
      // Clear the mustChangePassword flag in Firestore
      const { doc: fsDoc, updateDoc } = await import('firebase/firestore');
      await updateDoc(fsDoc(db, 'admin_users', tempUser.uid), { mustChangePassword: false });
      navigate('/admin');
    } catch(err) {
      setError(getAuthErrorMessage(err));
    }
    setChangingPw(false);
  }

  // Force password change screen
  if (mustChangePw) {
    return (
      <div className="al-login-bg" role="main">
        <div className="al-login-card">
          <div className="al-login-brand">
            <div className="al-brand-icon">🔐</div>
            <div className="al-brand-text">Set New Password</div>
          </div>
          <p style={{fontSize:'0.88rem',color:'var(--text-3)',textAlign:'center',marginBottom:20}}>
            For security, please set a new password before continuing.
          </p>
          {error && <div className="al-error">{error}</div>}
          <form onSubmit={handleChangePassword}>
            <div className="al-form-group">
              <label className="al-form-label">New Password</label>
              <input className="al-form-input" type="password" placeholder="Min. 6 characters"
                value={newPw} onChange={e=>setNewPw(e.target.value)} required minLength="6" autoFocus/>
            </div>
            <div className="al-form-group">
              <label className="al-form-label">Confirm New Password</label>
              <input className="al-form-input" type="password" placeholder="Repeat password"
                value={newPwConfirm} onChange={e=>setNewPwConfirm(e.target.value)} required/>
            </div>
            <button className="al-submit-btn" type="submit" disabled={changingPw}>
              {changingPw ? 'Saving…' : 'Set Password & Continue →'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="al-login-bg" role="main">
      {/* Language switcher */}
      <div className="al-lang-switcher">
        <button className="al-lang-btn" onClick={() => setLangOpen(v => !v)}>
          {currentLang.label}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginLeft:4}}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {langOpen && (
          <div className="al-lang-dropdown">
            {LANGUAGES.map(l => (
              <button key={l.code} className={`al-lang-option${i18n.language === l.code ? ' active' : ''}`}
                onClick={() => changeLang(l.code)}>
                {l.name}
                {i18n.language === l.code && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="al-login-card">
        <div className="al-login-logo" aria-hidden="true">
          <LogoMark />
        </div>
        <h1 className="al-login-title">{t('admin_login.title') || 'Admin Portal'}</h1>
        <p className="al-login-sub">{t('admin_login.subtitle') || 'Secure access for Irema administrators'}</p>

        {error && (
          <div className="al-login-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, flexShrink: 0, display:'inline-block', verticalAlign:'middle' }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="al-login-form" noValidate>
          <div className="al-form-group">
            <label className="al-form-label" htmlFor="admin-email">{t('admin_login.email') || 'Email Address'}</label>
            <input
              id="admin-email" type="email" className="al-form-input"
              placeholder="admin@irema.rw"
              value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email"
            />
          </div>

          <div className="al-form-group">
            <label className="al-form-label" htmlFor="admin-password">{t('admin_login.password') || 'Password'}</label>
            <div className="al-pw-wrap">
              <input
                id="admin-password" type={showPw ? 'text' : 'password'} className="al-form-input"
                placeholder={t('admin_login.password_placeholder') || 'Enter your password'}
                value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password"
              />
              <button type="button" className="al-pw-toggle" aria-label={showPw ? 'Hide' : 'Show'} onClick={() => setShowPw(v => !v)}>
                {showPw
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {totpRequired && (
            <div className="al-form-group">
              <label className="al-form-label" htmlFor="totp-code">Two-Factor Code</label>
              <input
                id="totp-code" type="text" className="al-form-input"
                placeholder="000000" maxLength={6} autoComplete="one-time-code"
                value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                style={{ letterSpacing: '0.15em', fontSize: '1.1rem', maxWidth: 160 }}
                required
              />
              {totpError && <div className="al-login-error" style={{marginTop:6}} role="alert">{totpError}</div>}
              <button type="button" className="al-submit-btn" style={{marginTop:10, background:'var(--success)', fontSize:'0.85rem', padding:'10px'}}
                onClick={handleTOTPSubmit} disabled={totpLoading || totpCode.length !== 6}>
                {totpLoading ? 'Verifying…' : 'Verify Code'}
              </button>
              <button type="button" className="al-login-btn" style={{marginTop:8, background:'transparent', border:'1px solid var(--border)', color:'var(--text-3)', fontSize:'0.82rem'}}
                onClick={() => { setTotpRequired(false); setPendingCredential(null); setTotpCode(''); setTotpError(''); auth.signOut(); }}>
                ← Back to login
              </button>
            </div>
          )}

          {!totpRequired && (
            <button type="submit" className="al-login-btn" disabled={loading}>
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite', marginRight: 6, display:'inline-block' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  {t('admin_login.signing_in') || 'Signing in…'}
                </>
              ) : (t('admin_login.sign_in') || 'Sign In')}
            </button>
          )}
        </form>

        <div className="al-login-footer">
          <div className="al-login-ssl">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {t('admin_login.ssl') || '256-bit SSL Encrypted'}
          </div>
          <div className="al-login-help">{t('admin_login.help') || 'Having trouble? Contact your system administrator.'}</div>
        </div>
      </div>
    </div>
  );
}
