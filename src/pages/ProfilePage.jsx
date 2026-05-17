import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, storage, doc, updateDoc, storageRef, uploadBytes, getDownloadURL } from '../firebase/config';
import { getInitials } from '../utils/helpers';
import './ProfilePage.css';

const EyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function ProfilePage() {
  const { user } = useAuthStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const initials    = getInitials(displayName);
  const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';

  // Edit name
  const [editName, setEditName]       = useState(displayName);
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg]         = useState('');

  // Photo
  const [photoUploading, setPhotoUploading] = useState(false);

  // Change password
  const [pwForm, setPwForm]       = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr]         = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [showCur, setShowCur]     = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [showCon, setShowCon]     = useState(false);

  async function handleSaveName(e) {
    e.preventDefault();
    if (!editName.trim()) return;
    setNameLoading(true); setNameMsg('');
    try {
      await updateProfile(user, { displayName: editName.trim() });
      await updateDoc(doc(db, 'users', user.uid), { displayName: editName.trim() }).catch(() => {});
      setNameMsg('Name updated successfully.');
      setTimeout(() => window.location.reload(), 800);
    } catch(err) { setNameMsg('Failed: ' + err.message); }
    setNameLoading(false);
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setPhotoUploading(true);
    try {
      const ext  = file.name.split('.').pop();
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `profiles/${user.uid}/${Date.now()}_${rand}.${ext}`;
      const ref  = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url  = await getDownloadURL(ref);
      await updateProfile(user, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url }).catch(() => {});
      setTimeout(() => window.location.reload(), 400);
    } catch(err) { console.error(err); }
    setPhotoUploading(false);
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwErr(''); setPwSuccess(''); setPwLoading(true);
    const { current, next, confirm } = pwForm;
    if (next !== confirm)  { setPwErr('New passwords do not match.'); setPwLoading(false); return; }
    if (next.length < 6)   { setPwErr('Password must be at least 6 characters.'); setPwLoading(false); return; }
    try {
      const cred = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      setPwSuccess('Password updated successfully!');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch(err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwErr('Current password is incorrect.');
      } else {
        setPwErr(err.message || 'Failed to update password.');
      }
    }
    setPwLoading(false);
  }

  return (
    <div className="prof-page">
      {/* Header */}
      <div className="prof-header">
        <div className="container">
          <h1 className="prof-title">Profile</h1>
          <p className="prof-sub">Manage your account details</p>
        </div>
      </div>

      <div className="container prof-body">
        <div className="prof-grid">

          {/* ── Account card ── */}
          <div className="prof-card">
            <h2 className="prof-card-title">Account</h2>

            {/* Avatar */}
            <div className="prof-avatar-row">
              <div className="prof-avatar-wrap">
                {user?.photoURL
                  ? <img src={user.photoURL} alt={displayName} className="prof-avatar-img" />
                  : <div className="prof-avatar-initials">{initials}</div>
                }
                <label className="prof-photo-btn" title="Change photo">
                  {photoUploading
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="9" strokeDasharray="28 28" strokeDashoffset="0"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  }
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhotoUpload} />
                </label>
              </div>
              <div className="prof-avatar-info">
                <div className="prof-avatar-name">{displayName}</div>
                <div className="prof-avatar-email">{user?.email}</div>
              </div>
            </div>

            {/* Edit name */}
            <form onSubmit={handleSaveName} style={{ marginTop: 20 }}>
              <label className="prof-label">Display name</label>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  className="prof-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Your display name"
                  style={{ flex:1 }}
                />
                <button className="btn btn-primary" type="submit" disabled={nameLoading || !editName.trim()}
                  style={{ whiteSpace:'nowrap', padding:'10px 18px', fontSize:'0.84rem' }}>
                  {nameLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
              {nameMsg && <div className={`prof-msg${nameMsg.startsWith('Failed') ? ' prof-msg-err' : ''}`}>{nameMsg}</div>}
            </form>
          </div>

          {/* ── Change password card — hidden for Google users ── */}
          {!isGoogleUser && (
            <div className="prof-card">
              <h2 className="prof-card-title">Change Password</h2>
              <form onSubmit={handleChangePassword}>
                {pwErr     && <div className="prof-error">{pwErr}</div>}
                {pwSuccess && <div className="prof-success">{pwSuccess}</div>}

                {[
                  { label: 'Current password',     key: 'current', show: showCur, toggle: setShowCur },
                  { label: 'New password',          key: 'next',    show: showNew, toggle: setShowNew },
                  { label: 'Confirm new password',  key: 'confirm', show: showCon, toggle: setShowCon },
                ].map(({ label, key, show, toggle }) => (
                  <div key={key} className="prof-pw-row">
                    <label className="prof-label">{label}</label>
                    <div style={{ position:'relative' }}>
                      <input
                        className="prof-input"
                        type={show ? 'text' : 'password'}
                        value={pwForm[key]}
                        onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                        required
                        minLength={key !== 'current' ? 6 : undefined}
                        style={{ paddingRight: 42 }}
                      />
                      <button type="button" onClick={() => toggle(v => !v)}
                        style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                          background:'none', border:'none', cursor:'pointer', color:'var(--text-3)',
                          display:'flex', alignItems:'center', padding:0 }}>
                        {show ? <EyeOff /> : <EyeOpen />}
                      </button>
                    </div>
                  </div>
                ))}

                <button className="btn btn-primary" type="submit" disabled={pwLoading}
                  style={{ width:'100%', marginTop: 8 }}>
                  {pwLoading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
