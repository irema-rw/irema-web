import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { browserLocalPersistence, setPersistence } from 'firebase/auth';
import { useModalStore } from '../store/modalStore';
import { useAuthStore } from '../store/authStore';
import {
  auth, db, doc, setDoc, getDoc, serverTimestamp,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithRedirect, googleProvider, updateProfile, sendPasswordResetEmail,
  collection, query, where, getDocs, addDoc, updateDoc, runTransaction,
  storage, storageRef, uploadBytes, getDownloadURL
} from '../firebase/config';
import { signInWithPopup } from 'firebase/auth';
import { ensureUniqueSlug } from '../utils/slug';
import { validateReviewText } from '../utils/reviewLimits';
import { resolveAuthFlow } from './AuthRedirectHandler';
import { useNavigate } from 'react-router-dom';

// ── Review upload constants ──────────────────────────────────────────────────
const MAX_REVIEW_PHOTOS  = 4;           // max photos per review
const MAX_PHOTO_SIZE_MB  = 5;           // per-file size cap shown to users
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;

const sanitizeText = (text) => {
  if (!text) return '';
  const el = document.createElement('div');
  el.textContent = text;
  return el.innerHTML;
};

import StarRatingInput from './StarRatingInput';
import './AuthModal.css';

export default function AuthModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeModal, modalData, openModal, closeModal } = useModalStore();
  const { user } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [bizWarning, setBizWarning] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Write review state
  // Pre-select company from modalData (when clicking Write Review on a company page)
  const preselectedCompany = modalData?.company || null;
  const [selectedCompany, setSelectedCompany] = useState(preselectedCompany);
  const [reviewStep, setReviewStep] = useState(preselectedCompany ? 2 : 1);
  const [companySearch, setCompanySearch] = useState('');
  const [companyResults, setCompanyResults] = useState([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);
  // Image upload
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const fileInputRef = useRef(null);
  // Add new business inline
  const [showAddBiz, setShowAddBiz] = useState(false);
  const [newBizForm, setNewBizForm] = useState({ name:'', category:'', country:'RW', address:'', city:'' });
  const [addingBiz, setAddingBiz] = useState(false);

  const CATS = ['restaurant','bank','hotel','healthcare','education','electronics','supermarket','telecom','real_estate','pharmacy','fitness','travel','other'];

  useEffect(() => {
    if (modalData?.company) { setSelectedCompany(modalData.company); setReviewStep(2); }
  }, [modalData]);

  useEffect(() => {
    if (!activeModal) {
      setEmail(''); setPassword(''); setError(''); setLoading(false);
      setCompanySearch(''); setCompanyResults([]); setSelectedCompany(null);
      setRating(0); setComment(''); setCommentError(''); setReviewStep(1); setReviewSuccess(false);
      setSelectedImages([]); setImagePreviews([]); setShowAddBiz(false);
      setForgotMode(false); setForgotEmail(''); setForgotSent(false);
    }
  }, [activeModal]);

  if (!['login', 'signup', 'writeReview'].includes(activeModal)) return null;

  // Terms & Conditions modal (shown inline when user clicks link)
  if (showTermsModal) return (
    <div className="modal-overlay" onClick={()=>setShowTermsModal(false)}>
      <div className="modal" style={{maxWidth:600,maxHeight:'80vh',overflow:'auto'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h2 style={{margin:0,fontSize:'1.2rem',fontWeight:800,color:'var(--text-1)'}}>Terms & Conditions</h2>
          <button onClick={()=>setShowTermsModal(false)} style={{background:'none',border:'none',fontSize:'1.2rem',cursor:'pointer',color:'var(--text-3)'}}>✕</button>
        </div>
        <div style={{fontSize:'0.84rem',lineHeight:1.8,color:'var(--text-2)'}}>
          <p style={{fontWeight:700,color:'var(--text-1)'}}>Effective Date: January 1, 2026 | Irema Ltd, Kigali, Rwanda</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>1. Acceptance of Terms</h4>
          <p>By creating an account on Irema, you agree to be bound by these Terms & Conditions. Irema is Rwanda's trusted business review platform connecting consumers with service providers across East Africa.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>2. User Accounts</h4>
          <p>You must provide accurate information when creating your account. You are responsible for maintaining the security of your account credentials. Irema reserves the right to suspend accounts that violate these terms.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>3. Review Policy</h4>
          <p>Reviews must be honest, based on genuine personal experience, and comply with Rwandan law. Defamatory, fraudulent, or misleading reviews will be removed. Users who submit false reviews may have their accounts terminated.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>4. Business Listings</h4>
          <p>Business owners are responsible for the accuracy of their listing information. Irema is not liable for any loss arising from inaccurate business information. Businesses must not engage in review manipulation or fraud.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>5. Intellectual Property</h4>
          <p>All content submitted to Irema (reviews, photos, business information) grants Irema a non-exclusive licence to display that content on the platform. You retain ownership of your original content.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>6. Privacy</h4>
          <p>Irema collects and processes personal data in accordance with Rwanda's Law No. 058/2021 on Personal Data Protection. Your data is used to operate the platform, improve services, and comply with legal obligations. We do not sell personal data to third parties.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>7. Prohibited Conduct</h4>
          <p>Users must not: submit spam or automated reviews, impersonate others, scrape or copy platform data, engage in review trading or buying, or use the platform for illegal activities under Rwandan law.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>8. Limitation of Liability</h4>
          <p>Irema provides the platform "as is". We are not liable for the accuracy of reviews, business decisions made based on platform content, or any indirect damages arising from use of the platform.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>9. Governing Law</h4>
          <p>These terms are governed by the laws of the Republic of Rwanda. Any disputes shall be resolved in Rwandan courts.</p>
          <h4 style={{color:'var(--brand)',marginBottom:4}}>10. Contact</h4>
          <p>For questions about these terms, contact: <a href="mailto:legal@irema.rw" style={{color:'var(--brand)'}}>legal@irema.rw</a></p>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:16}} onClick={()=>{setTermsAccepted(true);setShowTermsModal(false);}}>
          ✓ I Accept These Terms
        </button>
      </div>
    </div>
  );

  function handleOverlayClick(e) { if (e.target === e.currentTarget) closeModal(); }

  async function handleGoogleAuth() {
    if (!termsAccepted && !isLogin) { setError('Please accept the Terms & Conditions to continue.'); return; }
    setLoading(true); setError('');
    try {
      // Try popup first (opens in new window like other apps)
      try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithPopup(auth, googleProvider);
        const uid = result.user.uid;

        // Check if user is admin (block from user portal)
        const adminSnap = await getDoc(doc(db, 'admin_users', uid)).catch(() => null);
        if (adminSnap?.exists() && adminSnap.data()?.isActive !== false) {
          await auth.signOut();
          setError('Admin accounts must use the Admin Portal at /admin/login');
          setLoading(false);
          return;
        }

        // Check if user is business owner (redirect to business dashboard)
        const bizSnap = await getDocs(query(collection(db, 'companies'), where('adminUserId', '==', uid))).catch(() => ({ empty: true }));
        if (!bizSnap.empty) {
          await auth.signOut();
          setError('This account is registered as a business. Please login at the Business Portal.');
          setLoading(false);
          return;
        }

        // Regular user - create profile if doesn't exist
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            displayName: result.user.displayName,
            email: result.user.email,
            photoURL: result.user.photoURL,
            role: 'user',
            createdAt: serverTimestamp(),
          });
        }
        closeModal();
        return;
      } catch (popupErr) {
        // If popup fails (COOP blocking, user blocked popups, etc), fall back to redirect
        if (popupErr?.code !== 'auth/cancelled-popup-request') {
          console.warn('Popup sign-in failed, falling back to redirect:', popupErr?.message);
          sessionStorage.setItem('irema_auth_intent', 'user');
          localStorage.setItem('irema_auth_intent', 'user');
          await signInWithRedirect(auth, googleProvider);
        }
        return;
      }
    } catch (e) {
      setError(e?.message || 'Google sign-in failed');
    } finally { setLoading(false); }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    // Basic email validation before hitting Firebase
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail.trim())) {
      setError('Please enter a valid email address (e.g. name@example.com)');
      setForgotLoading(false);
      return;
    }
    try {
      // Configure email action with proper return URL for better deliverability
      const actionCodeSettings = {
        url: `${window.location.origin}/?mode=resetPassword&oobCode=EMAIL_CODE`,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, forgotEmail.trim(), actionCodeSettings);
      setForgotSent(true);
    } catch(err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        setError('We couldn\'t find an account with that email. Please check the address and try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes before trying again.');
      } else {
        setError('Something went wrong. Please try again or contact support@irema.rw');
      }
    }
    setForgotLoading(false);
  }

  async function handleEmailLogin(e) {
    e.preventDefault(); setLoading(true); setError('');
    // Validate form before Firebase call
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { setError('Please enter your email address.'); setLoading(false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Please enter a valid email address.'); setLoading(false); return; }
    if (!password) { setError('Please enter your password.'); setLoading(false); return; }
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const uid = cred.user.uid;
      // Block admin accounts from user portal
      const adminSnap = await getDoc(doc(db, 'admin_users', uid)).catch(() => null);
      if (adminSnap?.exists() && adminSnap.data()?.isActive !== false) {
        await auth.signOut();
        setError('Admin accounts must use the Admin Portal at /admin/login');
        setLoading(false); return;
      }
      // Block business-only accounts from user portal
      const bizSnap = await getDocs(query(collection(db, 'companies'), where('adminUserId', '==', uid))).catch(() => ({ empty: true }));
      if (!bizSnap.empty) {
        await auth.signOut();
        setBizWarning(true);
        setLoading(false); return;
      }
      closeModal();
    } catch (e) {
      setError(e.code === 'auth/invalid-credential' ? 'Invalid email or password' : e.message);
    } finally { setLoading(false); }
  }

  async function handleEmailSignup(e) {
    e.preventDefault();
    if (!termsAccepted) { setError('Please accept the Terms & Conditions to continue.'); return; }
    // Validate form before Firebase call
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { setError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Please enter a valid email address.'); return; }
    if (!password) { setError('Please enter a password.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    // Require password strength: uppercase, lowercase, number, and symbol
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(password)) {
      setError('Password must contain uppercase, lowercase, number, and symbol (@$!%*?&).');
      return;
    }
    setLoading(true); setError('');
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const uid = result.user.uid;
      const displayName = trimmedEmail.split('@')[0];
      await updateProfile(result.user, { displayName });
      const profileData = { displayName, email: trimmedEmail, role: 'user', createdAt: serverTimestamp() };
      await setDoc(doc(db, 'users', uid), profileData);
      // Force immediate profile update in authStore (onAuthStateChanged fires async)
      useAuthStore.getState().setUserProfile(profileData);
      closeModal();
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try logging in, or use a different email.');
      } else {
        setError(e.message);
      }
    } finally { setLoading(false); }
  }

  async function searchCompanies(q) {
    if (!q.trim()) { setCompanyResults([]); return; }
    try {
      const snap = await getDocs(collection(db, 'companies'));
      const lower = q.toLowerCase();
      const results = [];
      snap.forEach(d => {
        const data = d.data();
        const name = (data.companyName || data.name || '').toLowerCase();
        const cat = (data.category||'').toLowerCase();
        if (name.includes(lower) || cat.includes(lower)) results.push({ id: d.id, ...data });
      });
      setCompanyResults(results.slice(0, 6));
    } catch (e) {
      console.error('Company search failed:', e);
      setError('Could not load search results. Please check your connection and try again.');
    }
  }

  // Store preview locally; upload to Firebase Storage on submit
  function handleImageSelect(e) {
    const files = Array.from(e.target.files).slice(0, MAX_REVIEW_PHOTOS);
    if (!files.length) return;
    // Validate file sizes before accepting
    const oversized = files.filter(f => f.size > MAX_PHOTO_SIZE_BYTES);
    if (oversized.length) {
      setError(
        `Each photo must be under ${MAX_PHOTO_SIZE_MB} MB. ` +
        `${oversized.map(f => f.name).join(', ')} ${oversized.length === 1 ? 'exceeds' : 'exceed'} this limit.`
      );
      e.target.value = '';
      return;
    }
    setError('');
    // Store File objects for upload, create object URLs for preview
    setSelectedImages(files);
    setImagePreviews(files.map(f => URL.createObjectURL(f)));
  }

  async function uploadReviewImages(reviewId) {
    if (!selectedImages.length) return [];
    if (!user?.uid) {
      console.warn('uploadReviewImages: no authed user, skipping');
      return [];
    }
    const urls = [];
    const failures = [];
    for (const file of selectedImages) {
      try {
        // Sanitize extension so paths stay URL-safe
        const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
        // Use user-keyed path — doesn't require review doc to exist first (avoids eventual consistency issues)
        const rand = Math.random().toString(36).slice(2);
        const path = `review-photos/users/${user.uid}/${reviewId}_${Date.now()}_${rand}.${ext}`;
        const ref = storageRef(storage, path);
        const snap = await uploadBytes(ref, file, { contentType: file.type || 'image/jpeg' });
        const url = await getDownloadURL(snap.ref);
        urls.push(url);
      } catch (e) {
        console.error('Image upload failed:', e);
        failures.push(e?.message || String(e));
      }
    }
    // Image upload failures are NON-FATAL: we still want the review itself
    // to save even if every photo fails (network hiccup, CORS, etc.). The
    // submit handler can show a soft notice when some images were dropped.
    if (failures.length) {
      console.warn(`Review image upload: ${failures.length} failed, ${urls.length} succeeded`, failures);
    }
    return urls;
  }

  // Add a new business and proceed to review it
  async function handleAddBusiness(e) {
    e.preventDefault();
    if (!newBizForm.name.trim() || !newBizForm.category) { setError('Name and category required'); return; }
    setAddingBiz(true); setError('');
    try {
      // Reserve a unique slug up-front so /business/<slug> works the moment
      // the doc lands — no "slug backfill on first visit" race.
      const slug = await ensureUniqueSlug(newBizForm.name);
      const ref = await addDoc(collection(db, 'companies'), {
        name: newBizForm.name, companyName: newBizForm.name,
        slug,
        category: newBizForm.category, country: 'RW',
        address: newBizForm.address || '',
        city: newBizForm.city || '',
        averageRating: 0, totalReviews: 0, isVerified: false,
        status: 'unverified', createdAt: serverTimestamp(),
        addedBy: user?.uid || 'anonymous',
      });
      const created = { id: ref.id, slug, name: newBizForm.name, companyName: newBizForm.name, category: newBizForm.category };
      setSelectedCompany(created);
      setShowAddBiz(false);
      setReviewStep(2);
    } catch(e) { setError(e.message); }
    setAddingBiz(false);
  }

  async function handleSubmitReview(e) {
    e.preventDefault();
    if (!user) { openModal('login'); return; }
    if (!selectedCompany) { setError('Please search and select a business to review.'); return; }
    if (rating === 0) { 
      setError('⭐ Please select a star rating before submitting.');
      // Shake the star input to draw attention
      const starEl = document.querySelector('.star-rating-input');
      if (starEl) { starEl.style.animation = 'shake 0.4s ease'; setTimeout(()=>{ starEl.style.animation=''; }, 400); }
      return; 
    }
    const reviewValidation = validateReviewText(comment);
    if (!reviewValidation.ok) {
      setCommentError(reviewValidation.message);
      return;
    }
    setCommentError('');
    setLoading(true); setError('');
    try {
      // Check if user is trying to review their own business
      const userCompanySnap = await getDocs(
        query(collection(db, 'companies'), where('adminUserId', '==', user.uid))
      );
      const userOwnedCompanyIds = userCompanySnap.docs.map(d => d.id);
      if (userOwnedCompanyIds.includes(selectedCompany.id)) {
        setError('You cannot review your own business.');
        setLoading(false);
        return;
      }

      // Users can review any number of times - no rate limiting

      // Create the review with status 'pending' so admins can moderate before it goes live
      const reviewData = {
        userId: user.uid, userName: user.displayName || user.email,
        companyId: selectedCompany.id, companyName: selectedCompany.companyName || selectedCompany.name,
        rating, comment: sanitizeText(comment), createdAt: serverTimestamp(), replies: [], helpful: 0, status: 'pending',
        images: [],
      };
      const reviewRef = await addDoc(collection(db, 'reviews'), reviewData);

      // Upload images to Firebase Storage (using review ID as folder), then update review
      if (selectedImages.length > 0) {
        const imageUrls = await uploadReviewImages(reviewRef.id);
        if (imageUrls.length > 0) {
          await updateDoc(reviewRef, { images: imageUrls });
        }
      }

      // Atomically update company rating using a transaction to prevent race conditions.
      // Reads current averageRating + totalReviews, computes the new weighted average, writes back.
      await runTransaction(db, async (txn) => {
        const companyRef = doc(db, 'companies', selectedCompany.id);
        const companySnap = await txn.get(companyRef);
        const data = companySnap.data() || {};
        const prevTotal = data.totalReviews || 0;
        const prevSum   = (data.averageRating || 0) * prevTotal;
        const newTotal  = prevTotal + 1;
        const newAvg    = parseFloat(((prevSum + rating) / newTotal).toFixed(2));
        txn.update(companyRef, { totalReviews: newTotal, averageRating: newAvg });
      });

      // Notify business owner — targetUserId ensures only the business owner sees this
      if (selectedCompany.adminUserId) {
        const notifData = {
          companyId: selectedCompany.id,
          type: 'new_review',
          targetUserId: selectedCompany.adminUserId,
          message: `New ${rating}★ review from ${user.displayName||user.email}: "${(comment||'').slice(0,60)}${comment.length>60?'…':''}"`,
          reviewId: reviewRef.id,
          createdAt: serverTimestamp(),
          read: false,
          userId: user.uid,
          userName: user.displayName || user.email,
        };
        if (selectedCompany.slug) notifData.companySlug = selectedCompany.slug;
        await addDoc(collection(db, 'notifications'), notifData).catch(() => {});
      }
      setReviewSuccess(true);
      // Dispatch event so CompanyPage can add the new review to the list in real-time
      window.dispatchEvent(new CustomEvent('irema:newReview', {
        detail: { companyId: selectedCompany.id }
      }));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (activeModal === 'writeReview') {
    return (
      <div className="modal-overlay" onClick={handleOverlayClick}>
        <div className="modal-box">
          <button className="modal-close-btn" onClick={closeModal}>✕</button>
          <div className="modal-icon">✍️</div>
          <h2>{t('review.write')}</h2>

          {!user ? (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <p style={{ marginBottom: 16 }}>{t('review.login_required')}</p>
              <button className="btn btn-primary" onClick={() => openModal('login')}>{t('nav.login')}</button>
            </div>
          ) : reviewSuccess ? (
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
                Review submitted successfully!
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', marginBottom: 6 }}>
                Thank you for reviewing <strong>{selectedCompany?.companyName || selectedCompany?.name}</strong>
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
                Your {rating}★ review will be moderated and published within 24 hours. This helps other customers make informed decisions.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setReviewSuccess(false);
                    setReviewStep(1);
                    setSelectedCompany(null);
                    setRating(0);
                    setComment('');
                    setSelectedImages([]);
                    setImagePreviews([]);
                  }}
                >
                  Write Another Review
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={closeModal}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {reviewStep === 1 && (
                <div className="review-step">
                  <p style={{fontSize:'0.85rem',color:'var(--text-3)',marginBottom:12,marginTop:8}}>
                    Search for the business you want to review:
                  </p>
                  <input
                    className="input" style={{ marginTop: 16 }}
                    placeholder={t('review.search_company')}
                    value={companySearch}
                    onChange={e => { setCompanySearch(e.target.value); searchCompanies(e.target.value); }}
                  />
                  {companyResults.length > 0 && (
                    <div className="company-results">
                      {companyResults.map(c => (
                        <button key={c.id} className="company-result-item" onClick={() => { setSelectedCompany(c); setReviewStep(2); }}>
                          <div className="company-result-avatar">{(c.companyName || c.name || '?')[0]}</div>
                          <div>
                            <div className="company-result-name">{c.companyName || c.name}</div>
                            <div className="company-result-cat" style={{textTransform:"capitalize"}}>{(c.category||"").replace(/_/g," ")}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Not found - option to add */}
                  {companySearch.length >= 2 && companyResults.length === 0 && (
                    <div className="add-biz-hint">
                      <p>{t('review.not_found_hint')} "{companySearch}"?</p>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddBiz(true); setNewBizForm(p=>({...p, name: companySearch})); }}>
                        + Add this business & review it
                      </button>
                    </div>
                  )}
                  {showAddBiz && (
                    <form onSubmit={handleAddBusiness} className="add-biz-form">
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginBottom: 10 }}>
                        Add this business to Irema. The owner can later claim it and will see all your reviews.
                      </p>
                      <input className="input" placeholder={t('review.business_name') + ' *'} required
                        value={newBizForm.name} onChange={e=>setNewBizForm(p=>({...p,name:e.target.value}))}/>
                      <input className="input" placeholder="Street address (optional)" style={{marginTop:8}}
                        value={newBizForm.address} onChange={e=>setNewBizForm(p=>({...p,address:e.target.value}))}/>
                      <input className="input" placeholder="City / District in Rwanda (optional)" style={{marginTop:8}}
                        value={newBizForm.city} onChange={e=>setNewBizForm(p=>({...p,city:e.target.value}))}/>
                      <select className="input" required value={newBizForm.category}
                        onChange={e=>setNewBizForm(p=>({...p,category:e.target.value}))}>
                        <option value="">Select category *</option>
                        {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                      {error && <div className="alert alert-error">{error}</div>}
                      <div style={{ display:'flex', gap:8 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setShowAddBiz(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={addingBiz}>{addingBiz ? t('common.loading') : t('review.add_business')}</button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {reviewStep === 2 && selectedCompany && (
                <form onSubmit={handleSubmitReview} className="review-form">
                  <div className="selected-company-card">
                    <div className="company-result-avatar">{(selectedCompany.companyName || selectedCompany.name || '?')[0]}</div>
                    <div>
                      <strong>{selectedCompany.companyName || selectedCompany.name}</strong>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', textTransform:'capitalize' }}>{(selectedCompany.category||"").replace(/_/g," ")}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setReviewStep(1); setSelectedImages([]); setImagePreviews([]); }} style={{ marginLeft: 'auto' }}>Change</button>
                  </div>

                  <label className="form-label">{t('review.your_rating')}</label>
                  <StarRatingInput value={rating} onChange={setRating} size={36} />

                  <label className="form-label" style={{ marginTop: 16 }}>{t('review.your_experience')}</label>
                  <textarea className="input" rows={4} required
                    placeholder={t('review.comment_placeholder')}
                    value={comment} onChange={e => {
                      const next = e.target.value;
                      setComment(next);
                      setCommentError(next.length > 1000 ? 'Reviews can be at most 1000 characters.' : '');
                    }} />
                  {commentError && <div className="alert alert-error">{commentError}</div>}

                  {/* Image upload */}
                  <div className="review-image-upload">
                    <label className="form-label">{t('review.add_photo')}</label>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
                      onClick={() => fileInputRef.current?.click()}>
                      📷 {t('review.select_gallery')}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display:'none' }}
                      onChange={handleImageSelect} />
                    {imagePreviews.length > 0 && (
                      <div className="review-image-previews">
                        {imagePreviews.map((src, i) => (
                          <div key={i} className="review-img-thumb">
                            <img src={src} alt={`photo ${i+1}`} />
                            <button type="button" className="review-img-remove"
                              onClick={() => { setImagePreviews(p=>p.filter((_,j)=>j!==i)); setSelectedImages(p=>p.filter((_,j)=>j!==i)); }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {error && <div className="alert alert-error">{error}</div>}
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading || rating === 0 || comment.length > 1000}>
                    {loading ? t('review.submitting') : t('review.submit')}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Login / Signup
  const isLogin = activeModal === 'login';

  // Forgot password screen — shown as overlay within the same modal
  if (forgotMode) {
    return (
      <div className="modal-overlay" onClick={handleOverlayClick}>
        <div className="modal-box">
          <button className="modal-close-btn" onClick={closeModal}>✕</button>
          <div className="modal-icon">🔑</div>
          <h2 style={{fontSize:'1.3rem',fontWeight:800,color:'var(--text-1)',marginBottom:6}}>Reset Password</h2>
          <p className="modal-subtitle">Enter your email and we'll send you a reset link.</p>
          {forgotSent ? (
            <div style={{textAlign:'center',padding:'24px 0'}}>
              <div style={{fontSize:'2.5rem',marginBottom:12}}>✅</div>
              <p style={{fontWeight:700,color:'var(--brand)',marginBottom:8}}>Check your inbox!</p>
              <p style={{fontSize:'0.85rem',color:'var(--text-3)',marginBottom:20}}>A reset link was sent to <strong>{forgotEmail}</strong>.</p>
              <button className="btn btn-primary" style={{width:'100%'}} onClick={()=>{setForgotMode(false);setForgotSent(false);}}>Back to Login</button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
              <input className="input" type="email" placeholder="Your email address"
                value={forgotEmail} onChange={e=>{setForgotEmail(e.target.value);setError('');}}
                required autoFocus style={{marginBottom:16}}/>
              <button className="btn btn-primary" type="submit" style={{width:'100%',marginBottom:12}} disabled={forgotLoading}>
                {forgotLoading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <button type="button" className="btn btn-outline" style={{width:'100%'}} onClick={()=>{setForgotMode(false);setError('');}}>
                ← Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-box">
        <button className="modal-close-btn" onClick={closeModal}>✕</button>
        <div className="modal-icon" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
          {isLogin
            ? <svg width="36" height="36" viewBox="0 0 60 60" fill="none"><rect width="60" height="60" rx="14" fill="#1a5c3e"/><path d="M30 8l3.9 7.9 8.7 1.3-6.3 6.1 1.5 8.6L30 27.9l-7.8 4.1 1.5-8.6-6.3-6.1 8.7-1.3z" fill="#FFD700"/></svg>
            : <svg width="36" height="36" viewBox="0 0 60 60" fill="none"><rect width="60" height="60" rx="14" fill="#2d8f6f"/><path d="M30 8l3.9 7.9 8.7 1.3-6.3 6.1 1.5 8.6L30 27.9l-7.8 4.1 1.5-8.6-6.3-6.1 8.7-1.3z" fill="#FFD700"/><path d="M20 40h20M24 46h12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
          }
        </div>
        <h2>{isLogin ? t('auth.login_title') : t('auth.signup_title')}</h2>
        <p className="modal-subtitle">{t('auth.subtitle')}</p>
        <button className="google-btn" onClick={handleGoogleAuth}
          disabled={loading || (!isLogin && !termsAccepted)}
          style={{opacity:(!isLogin && !termsAccepted)?0.5:1,cursor:(!isLogin && !termsAccepted)?'not-allowed':'pointer'}}>
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" width="20" alt="G" />
          {t('auth.continue_google')}
        </button>
        <div className="divider"><span>or</span></div>
        <form onSubmit={isLogin ? handleEmailLogin : handleEmailSignup}>
          <input className="input" type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} required style={{ marginBottom: 10 }} />
          <div style={{position:'relative',marginBottom: isLogin ? 6 : 16}}>
            <input className="input" type={showPassword?'text':'password'} placeholder={t('auth.password')} value={password} onChange={e => setPassword(e.target.value)} required style={{marginBottom:0,paddingRight:44,width:'100%',boxSizing:'border-box'}} />
            <button type="button" onClick={()=>setShowPassword(v=>!v)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',padding:0,display:'flex'}}>
              {showPassword
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
          {isLogin && (
            <div style={{textAlign:'right',marginBottom:12}}>
              <button type="button" className="link-btn" style={{fontSize:'0.8rem',color:'var(--text-3)'}}
                onClick={()=>{setForgotMode(true);setForgotEmail(email);setError('');}}>
                Forgot password?
              </button>
            </div>
          )}
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading || (!isLogin && !termsAccepted)}>
            {loading ? t('common.loading') : (isLogin ? t('auth.login_btn') : t('auth.signup_btn'))}
          </button>
        </form>
        {/* T&C checkbox shown BELOW the form on signup */}
        {!isLogin && (
          <div style={{margin:'16px 0 0',padding:'12px 14px',background:'var(--bg)',borderRadius:10,border:'1px solid var(--border)'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
              <input type="checkbox" id="terms-check-bottom" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}
                style={{width:16,height:16,marginTop:2,accentColor:'var(--brand)',cursor:'pointer',flexShrink:0}}/>
              <label htmlFor="terms-check-bottom" style={{fontSize:'0.75rem',color:'var(--text-3)',lineHeight:1.5,cursor:'pointer'}}>
                I agree to Irema's{' '}
                <button type="button" style={{background:'none',border:'none',color:'var(--brand)',fontWeight:600,cursor:'pointer',padding:0,fontSize:'0.75rem'}}
                  onClick={()=>setShowTermsModal(true)}>Terms & Conditions</button>
                {' '}and{' '}
                <a href="/privacy" target="_blank" style={{color:'var(--brand)',fontWeight:600,fontSize:'0.75rem'}}>Privacy Policy</a>
              </label>
            </div>
          </div>
        )}
        <p className="modal-switch">
          {isLogin ? t('auth.no_account') : t('auth.have_account')}{' '}
          <button className="link-btn" onClick={() => openModal(isLogin ? 'signup' : 'login')}>
            {isLogin ? t('auth.sign_up_link') : t('auth.sign_in_link')}
          </button>
        </p>
      </div>
      {bizWarning && (
        <div className="modal-overlay" onClick={() => setBizWarning(false)} style={{ zIndex: 2000 }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 36, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏢</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-1)', marginBottom: 12 }}>Business Account Detected</h2>
            <p style={{ color: 'var(--text-3)', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: 24 }}>
              This account is registered as a Business account. Please use the Business Portal to manage your business.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={() => { setBizWarning(false); window.location.href = '/businesses'; }}
                style={{ width: '100%' }}
              >
                Go to Business Portal
              </button>
              <button
                className="link-btn"
                onClick={() => setBizWarning(false)}
                style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
