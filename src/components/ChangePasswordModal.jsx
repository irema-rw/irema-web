import React, { useState } from 'react';
import { auth } from '../firebase/config';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { getAuthErrorMessage } from '../utils/authErrors';

/**
 * Unified Change Password Modal — used across User, Business, and Admin portals.
 * Props:
 *   onClose: () => void
 *   theme: 'light' | 'dark'  (optional, defaults to current data-theme)
 */
export default function ChangePasswordModal({ onClose, theme }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Strength indicator
  const getStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    return score;
  };
  const strength = getStrength(next);
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][strength] || '';
  const strengthColor = ['', '#ef4444', '#f59e0b', '#e8b800', '#2d8f6f', '#1a5c3e'][strength] || '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (next.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (next === current) { setError('New password must be different from current password.'); return; }
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) { setError('Not logged in. Please refresh and try again.'); setSaving(false); return; }
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);
      setSuccess(true);
      setTimeout(() => onClose(), 2500);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Current password is incorrect. Please try again.');
      } else {
        setError(getAuthErrorMessage(err));
      }
    }
    setSaving(false);
  }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
    animation: 'fadeIn 0.18s ease',
  };

  const box = {
    background: 'var(--surface, white)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 20,
    padding: '32px 28px',
    width: '100%', maxWidth: 420,
    maxHeight: '95vh', overflowY: 'auto',
    boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
    animation: 'fadeInUp 0.22s ease',
    position: 'relative',
  };

  const inputWrap = { position: 'relative', marginBottom: 0 };
  const inputStyle = {
    width: '100%', padding: '11px 42px 11px 14px',
    border: '1.5px solid var(--border, #e5e7eb)',
    borderRadius: 10, fontSize: '0.9rem',
    color: 'var(--text-1, #111)',
    background: 'var(--bg, #f9fafb)',
    outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
  const eyeBtn = {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-4, #9ca3af)', display: 'flex', padding: 0,
  };
  const label = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2, #374151)', marginBottom: 6 };
  const fieldWrap = { marginBottom: 16 };

  function EyeIcon({ show }) {
    return show
      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16, width: 32, height: 32,
          borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg-2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-3)', fontSize: '0.85rem',
        }}>✕</button>

        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 14 }}>🔐</div>
            <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand, #2d8f6f)', marginBottom: 8 }}>
              Password Updated!
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: 20 }}>
              Your password has been changed successfully.
            </p>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--brand-xlight)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand, #2d8f6f)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: 24, paddingRight: 32 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand-xlight, #eef8f3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand, #2d8f6f)" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Change Password</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 4 }}>Enter your current password then choose a new one</p>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: '0.83rem', color: '#ef4444', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={fieldWrap}>
                <label style={label}>Current Password</label>
                <div style={inputWrap}>
                  <input style={inputStyle} type={showCurrent ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={current} onChange={e => setCurrent(e.target.value)}
                    autoComplete="current-password" required
                    onFocus={e => e.target.style.borderColor = 'var(--brand, #2d8f6f)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border, #e5e7eb)'}/>
                  <button type="button" style={eyeBtn} onClick={() => setShowCurrent(v => !v)} tabIndex={-1}>
                    <EyeIcon show={showCurrent}/>
                  </button>
                </div>
              </div>

              <div style={fieldWrap}>
                <label style={label}>New Password</label>
                <div style={inputWrap}>
                  <input style={inputStyle} type={showNext ? 'text' : 'password'}
                    placeholder="Min. 6 characters"
                    value={next} onChange={e => setNext(e.target.value)}
                    autoComplete="new-password" required minLength={6}
                    onFocus={e => e.target.style.borderColor = 'var(--brand, #2d8f6f)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border, #e5e7eb)'}/>
                  <button type="button" style={eyeBtn} onClick={() => setShowNext(v => !v)} tabIndex={-1}>
                    <EyeIcon show={showNext}/>
                  </button>
                </div>
                {next.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      {[1,2,3,4,5].map(i => (
                        <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= strength ? strengthColor : 'var(--bg-3, #e5e7eb)', transition: 'background 0.2s' }}/>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: strengthColor, fontWeight: 600 }}>{strengthLabel}</span>
                  </div>
                )}
              </div>

              <div style={{...fieldWrap, marginBottom: 24}}>
                <label style={label}>Confirm New Password</label>
                <div style={inputWrap}>
                  <input style={{...inputStyle, borderColor: confirm && next && confirm !== next ? '#ef4444' : undefined}}
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat new password"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password" required
                    onFocus={e => e.target.style.borderColor = confirm && next && confirm !== next ? '#ef4444' : 'var(--brand, #2d8f6f)'}
                    onBlur={e => e.target.style.borderColor = confirm && next && confirm !== next ? '#ef4444' : 'var(--border, #e5e7eb)'}/>
                  <button type="button" style={eyeBtn} onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                    <EyeIcon show={showConfirm}/>
                  </button>
                </div>
                {confirm && next && confirm !== next && (
                  <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 4, display: 'block' }}>Passwords don't match</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={onClose}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving || (confirm && next !== confirm)}
                  style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: saving ? 'var(--brand-light)' : 'var(--brand, #2d8f6f)', color: 'white', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {saving ? (
                    <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{animation:'spin 0.8s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Updating…</>
                  ) : 'Update Password'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
