import React, { useState } from 'react';
import { auth, db, doc, getIdToken, reload, sendEmailVerification, serverTimestamp, updateDoc } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { requiresEmailVerification } from '../utils/emailVerification';

export default function EmailVerificationGate({ children }) {
  const { user, userProfile, setUser, setUserProfile } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);

  if (!requiresEmailVerification(user, userProfile)) {
    return children;
  }

  async function checkAgain() {
    if (!auth.currentUser) return;
    setChecking(true);
    setError('');
    setMessage('');
    try {
      await reload(auth.currentUser);
      await getIdToken(auth.currentUser, true);
      setUser(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        const updates = {
          emailVerified: true,
          emailVerifiedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, 'users', auth.currentUser.uid), updates).catch(() => {});
        setUserProfile({ ...(userProfile || {}), ...updates });
        setMessage('Email verified. You can continue now.');
        return;
      }
      setError('Your email is not verified yet. Please click the link in your inbox, then check again.');
    } catch (e) {
      setError(e.message || 'Could not check verification status.');
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    if (!auth.currentUser || cooldown) return;
    setResending(true);
    setError('');
    setMessage('');
    try {
      await sendEmailVerification(auth.currentUser);
      setMessage(`Verification email sent to ${auth.currentUser.email}.`);
      setCooldown(true);
      setTimeout(() => setCooldown(false), 60000);
    } catch (e) {
      setError(e.message || 'Could not resend verification email.');
    } finally {
      setResending(false);
    }
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'var(--bg,#f7faf8)'}}>
      <section style={{width:'100%',maxWidth:460,background:'var(--surface,#fff)',border:'1px solid var(--border,#e5e7eb)',borderRadius:16,padding:28,boxShadow:'0 16px 48px rgba(0,0,0,0.08)',textAlign:'center'}}>
        <div style={{width:54,height:54,borderRadius:14,background:'#eef8f3',display:'grid',placeItems:'center',margin:'0 auto 16px',color:'#2d8f6f'}}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>
        </div>
        <h1 style={{fontFamily:'var(--font-display,Sora,sans-serif)',fontSize:'1.35rem',margin:'0 0 8px',color:'var(--text-1,#111827)'}}>Verify your email to continue</h1>
        <p style={{fontSize:'0.92rem',lineHeight:1.6,color:'var(--text-2,#374151)',margin:'0 0 18px'}}>
          We sent a verification link to <strong>{user?.email}</strong>. Click the link in your inbox, then come back here.
        </p>
        {message && <div style={{background:'#eef8f3',border:'1px solid #c8ead9',color:'#1f6b52',borderRadius:10,padding:'10px 12px',fontSize:'0.84rem',marginBottom:12}}>{message}</div>}
        {error && <div style={{background:'#fff1f2',border:'1px solid #fecdd3',color:'#be123c',borderRadius:10,padding:'10px 12px',fontSize:'0.84rem',marginBottom:12}}>{error}</div>}
        <div style={{display:'grid',gap:10}}>
          <button onClick={checkAgain} disabled={checking} className="btn btn-primary" style={{width:'100%'}}>
            {checking ? 'Checking...' : "I've verified, check again"}
          </button>
          <button onClick={resend} disabled={resending || cooldown} className="btn btn-outline" style={{width:'100%'}}>
            {resending ? 'Sending...' : cooldown ? 'Resend available in 60 seconds' : 'Resend email'}
          </button>
        </div>
        <p style={{fontSize:'0.78rem',lineHeight:1.5,color:'var(--text-4,#6b7280)',margin:'16px 0 0'}}>
          Check your spam folder if the email is not in your inbox. Keep this tab open after clicking the link.
        </p>
      </section>
    </main>
  );
}
