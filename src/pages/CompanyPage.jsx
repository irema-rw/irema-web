import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { db, auth, storage, collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, addDoc, deleteDoc, serverTimestamp, onAuthStateChanged, googleProvider, increment } from '../firebase/config';
import { useModalStore } from '../store/modalStore';
import StarRating from '../components/StarRating';
import LoadingSpinner from '../components/LoadingSpinner';
import { getCategoryLabel, formatRelativeTime, getRatingColor, getRatingLabel, getInitials } from '../utils/helpers';
import { sanitizeUrl } from '../utils/security';
import { slugify, ensureUniqueSlug, findCompanyBySlug, companyPath } from '../utils/slug';
import { validateReplyText } from '../utils/reviewLimits';
import './CompanyPage.css';
import StoriesSection from '../components/StoriesSection';
import ReportReviewModal from '../components/ReportReviewModal';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const AVATAR_COLORS = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6','#ec4899'];
function avatarColor(name) { return AVATAR_COLORS[(name?.charCodeAt(0)||0) % AVATAR_COLORS.length]; }

export default function CompanyPage() {
  // Two routes feed this page: /business/:slug (canonical) and the legacy
  // /company/:id. We pick whichever param is present, load the doc, and
  // canonicalise the URL below.
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeSlug = params.slug || null;
  const routeId   = params.id   || null;
  const { t, i18n } = useTranslation();
  const { openModal } = useModalStore();
  const [company, setCompany] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [user, setUser] = useState(null);
  const [sortBy, setSortBy] = useState('newest');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [replyText, setReplyText] = useState({});
  const [replyError, setReplyError] = useState('');
  const [submittingReply, setSubmittingReply] = useState(null);
  const [isBusinessOwner, setIsBusinessOwner] = useState(false);
  // Review modal state
  const [activeReview, setActiveReview] = useState(null);
  const [lightboxImg, setLightboxImg] = useState(null); // { src, list, idx }
  // Reactions per review
  const [reactions, setReactions] = useState({}); // { reviewId: { helpful:n, thanks:n, love:n } }
  // Current logged-in user's reaction for each review (at most one type per review).
  const [userReactionByReview, setUserReactionByReview] = useState({}); // { reviewId: 'helpful'|'thanks'|'love' }
  // Translation per review
  const [translated, setTranslated] = useState({}); // { reviewId: text }
  const [translating, setTranslating] = useState({});
  // Reporting
  const [reportModal, setReportModal] = useState(null); // review object | null
  const [reportedReviews, setReportedReviews] = useState(new Set()); // reviewIds the current user already reported

  useEffect(() => { const u = onAuthStateChanged(auth, setUser); return u; }, []);

  // Auto-open review modal if ?review=1 is in URL (from QR scan)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('review') !== '1') return;
    if (!company) return;
    const timer = setTimeout(() => openModal('writeReview', { company }), 800);
    return () => clearTimeout(timer);
  }, [company?.id]);

  // Open specific review when ?openReview={id} is in URL (from notification click)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reviewId = params.get('openReview');
    if (!reviewId || !reviews.length) return;
    const found = reviews.find(r => r.id === reviewId);
    if (found) {
      setActiveReview(found);
    }
  }, [reviews]);
  // Load company once we know which param we got (slug or id).
  useEffect(() => { if (routeSlug || routeId) { loadCompany(); } }, [routeSlug, routeId]);
  // Generate QR once we have the resolved company (so the code points at the canonical URL)
  useEffect(() => { if (company?.id) generateQR(); }, [company?.id, company?.slug]);

  // Once company is resolved, load reviews + products keyed off its real id.
  useEffect(() => {
    if (!company?.id) return;
    loadReviews();
    loadProducts();
  }, [company?.id]);

  async function loadProducts() {
    if (!company?.id) return;
    try {
      const snap = await getDocs(query(collection(db, 'products'), where('companyId', '==', company.id), where('active', '==', true)));
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.category||'').localeCompare(b.category||'')));
    } catch {}
  }
  useEffect(() => { if (user && company) setIsBusinessOwner(company.adminUserId === user.uid); }, [user, company]);

  // Real-time: reload reviews when a new review is submitted from the modal
  useEffect(() => {
    if (!company?.id) return;
    const cid = company.id;
    function handleNewReview(e) {
      if (e.detail?.companyId === cid) {
        getDocs(query(collection(db, 'reviews'), where('companyId', '==', cid)))
          .then(snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setReviews(data);
          }).catch(() => {});
        getDoc(doc(db, 'companies', cid))
          .then(d => { if (d.exists()) setCompany(prev => ({ ...prev, ...d.data() })); })
          .catch(() => {});
      }
    }
    window.addEventListener('irema:newReview', handleNewReview);
    return () => window.removeEventListener('irema:newReview', handleNewReview);
  }, [company?.id]);

  // Lock scroll when modal open
  useEffect(() => {
    if (activeReview || lightboxImg) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [activeReview, lightboxImg]);

  async function loadCompany() {
    try {
      let resolved = null;
      if (routeSlug) {
        // Primary path: look up the company by its stored slug.
        resolved = await findCompanyBySlug(routeSlug);
      }
      if (!resolved && routeId) {
        // Legacy path: /company/:id. Load by id, canonicalise later.
        const snap = await getDoc(doc(db, 'companies', routeId));
        if (snap.exists()) resolved = { id: snap.id, ...snap.data() };
      }
      if (!resolved) { setLoading(false); return; }

      // Back-fill a slug on the fly for legacy docs that don't have one yet
      // so the URL rewrite below lands on the canonical /business/<slug> path.
      // The firestore rule lets any signed-in user set `slug` when it is
      // missing (owner/admin gate only applies to other fields), so we try
      // the write for every authenticated visitor — this makes canonicalisation
      // work on refresh even for users who aren't the business owner. Anon
      // visits fall through and just stay on /company/:id.
      if (!resolved.slug) {
        try {
          const generated = await ensureUniqueSlug(resolved.companyName || resolved.name || 'business', resolved.id);
          if (auth?.currentUser) {
            // swallow errors — if the write is denied, we still canonicalise
            // the URL in-memory below via `resolved.slug = generated`.
            await updateDoc(doc(db, 'companies', resolved.id), { slug: generated }).catch(() => {});
          }
          resolved = { ...resolved, slug: generated };
        } catch {}
      }

      setCompany(resolved);

      // Canonicalise URL: if we arrived via /company/:id or via a different
      // slug (e.g. after a rename), replace the location with the clean one.
      if (resolved.slug) {
        const want = `/business/${resolved.slug}`;
        if (location.pathname !== want) {
          navigate({ pathname: want, search: location.search }, { replace: true });
        }
      }

      // Track unique profile view per session
      const viewKey = `viewed_${resolved.id}`;
      if (!sessionStorage.getItem(viewKey)) {
        sessionStorage.setItem(viewKey, '1');
        updateDoc(doc(db, 'companies', resolved.id), { viewCount: increment(1) }).catch(() => {});
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadReviews() {
    if (!company?.id) return;
    try {
      const snap = await getDocs(query(collection(db, 'reviews'), where('companyId', '==', company.id)));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(data);
      const r = {};
      const ubr = {}; // userReactionByReview
      data.forEach(rv => { r[rv.id] = { helpful: 0, thanks: 0, love: 0 }; });
      try {
        const reviewIds = data.map(rv => rv.id);
        const chunks = [];
        for (let i = 0; i < reviewIds.length; i += 10) chunks.push(reviewIds.slice(i, i + 10));
        for (const chunk of chunks) {
          const rxSnap = await getDocs(query(collection(db, 'review_reactions'), where('reviewId', 'in', chunk)));
          rxSnap.docs.forEach(rx => {
            const rxd = rx.data();
            if (!r[rxd.reviewId]) r[rxd.reviewId] = { helpful: 0, thanks: 0, love: 0 };
            if (rxd.type === 'helpful') r[rxd.reviewId].helpful = (r[rxd.reviewId].helpful||0) + 1;
            else if (rxd.type === 'thanks') r[rxd.reviewId].thanks = (r[rxd.reviewId].thanks||0) + 1;
            else if (rxd.type === 'love') r[rxd.reviewId].love = (r[rxd.reviewId].love||0) + 1;
            // Record the CURRENT signed-in user's reaction per review (one per review)
            if (user && rxd.userId === user.uid) ubr[rxd.reviewId] = rxd.type;
          });
        }
      } catch {}
      setReactions(r);
      if (user) setUserReactionByReview(ubr);
    } catch (e) { console.error(e); }
  }

  async function generateQR() {
    // QR points at the canonical /business/<slug> URL when available, falling
    // back to /company/<id> on legacy docs that still lack a slug.
    const key = company?.slug || company?.id || routeSlug || routeId || '';
    if (!key) return;
    const prefix = company?.slug || routeSlug ? '/business/' : '/company/';
    const url = `${window.location.origin}${prefix}${company?.slug || routeSlug || company?.id || routeId}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width:256, margin:2, color:{ dark:'#0f1923', light:'#ffffff' } });
      setQrDataUrl(dataUrl);
    } catch {}
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement('a'); a.href = qrDataUrl;
    a.download = `${company?.companyName||'irema'}-qr.png`; a.click();
  }

  async function submitReply(reviewId, isBusinessReply = false) {
    const text = replyText[reviewId];
    if (!user) return;
    const validation = validateReplyText(text);
    if (!validation.ok) {
      setReplyError(validation.message);
      return;
    }
    setSubmittingReply(reviewId);
    try {
      const review = reviews.find(r => r.id === reviewId);
      const newReply = { by: isBusinessReply ? 'business' : 'user', text: text.trim(), userId: user.uid,
        userName: user.displayName || user.email, when: new Date() };
      const updatedReplies = [...(review.replies || []), newReply];
      await updateDoc(doc(db, 'reviews', reviewId), { replies: updatedReplies });
      const updated = reviews.map(r => r.id === reviewId ? { ...r, replies: updatedReplies } : r);
      setReviews(updated);
      if (activeReview?.id === reviewId) setActiveReview({ ...activeReview, replies: updatedReplies });
      setReplyText(prev => ({ ...prev, [reviewId]: '' }));
      setReplyError('');
    } catch (e) { console.error(e); }
    setSubmittingReply(null);
  }

  async function handleReaction(reviewId, type) {
    if (!user) { openModal('login'); return; }
    const rxKey = `${reviewId}_${user.uid}`;
    const rxRef = doc(db, 'review_reactions', rxKey);
    const currentType = userReactionByReview[reviewId]; // 'helpful' | 'thanks' | 'love' | undefined
    const cur = reactions[reviewId] || { helpful: 0, thanks: 0, love: 0 };

    try {
      if (currentType === type) {
        // TOGGLE OFF: user clicked the same reaction they already gave — remove it
        await deleteDoc(rxRef);
        setReactions(prev => ({
          ...prev,
          [reviewId]: { ...cur, [type]: Math.max(0, (cur[type]||0) - 1) },
        }));
        setUserReactionByReview(prev => {
          const next = { ...prev };
          delete next[reviewId];
          return next;
        });
      } else if (currentType) {
        // REPLACE: user previously reacted with a different type — swap it
        await setDoc(rxRef, {
          reviewId, userId: user.uid, type, createdAt: serverTimestamp(),
        });
        setReactions(prev => ({
          ...prev,
          [reviewId]: {
            ...cur,
            [currentType]: Math.max(0, (cur[currentType]||0) - 1),
            [type]: (cur[type]||0) + 1,
          },
        }));
        setUserReactionByReview(prev => ({ ...prev, [reviewId]: type }));
      } else {
        // NEW: first-time reaction
        await setDoc(rxRef, {
          reviewId, userId: user.uid, type, createdAt: serverTimestamp(),
        });
        setReactions(prev => ({
          ...prev,
          [reviewId]: { ...cur, [type]: (cur[type]||0) + 1 },
        }));
        setUserReactionByReview(prev => ({ ...prev, [reviewId]: type }));
      }
    } catch (e) { console.error('reaction failed', e); }
  }

  async function translateReview(reviewId, text) {
    if (translated[reviewId]) {
      setTranslated(p => ({ ...p, [reviewId]: null }));
      return;
    }

    setTranslating(p => ({ ...p, [reviewId]: true }));

    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../firebase/config');

      const callClaudeAPI = httpsCallable(functions, 'callClaudeAPI');
      const result = await callClaudeAPI({
        mode: 'translate',
        message: text,
        targetLanguage: i18n.language === 'rw' ? 'Kinyarwanda'
          : i18n.language === 'fr' ? 'French'
          : i18n.language === 'sw' ? 'Swahili'
          : 'English'
      });

      setTranslated(p => ({ ...p, [reviewId]: result.data.message }));
    } catch (error) {
      console.error('Translation error:', error);
      setTranslated(p => ({ ...p, [reviewId]: text }));
    } finally {
      setTranslating(p => ({ ...p, [reviewId]: false }));
    }
  }

  // Load which reviews the current user has already reported (so we can disable the flag button)
  useEffect(() => {
    if (!user || !company?.id) return;
    getDocs(query(collection(db, 'reports'),
      where('reportedBy', '==', user.uid),
      where('companyId', '==', company.id)
    )).then(snap => {
      setReportedReviews(new Set(snap.docs.map(d => d.data().reviewId)));
    }).catch(() => {});
  }, [user?.uid, company?.id]);

  function handleReportSuccess(reviewId) {
    setReportedReviews(prev => new Set([...prev, reviewId]));
    setReportModal(null);
  }

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortBy === 'newest') return (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0);
    if (sortBy === 'highest') return (b.rating||0) - (a.rating||0);
    if (sortBy === 'lowest') return (a.rating||0) - (b.rating||0);
    return 0;
  });

  // Use backend-stored average rating, fall back to computed
  const avgRating = company?.averageRating ||
    (reviews.length ? reviews.reduce((s,r)=>s+(r.rating||0),0)/reviews.length : 0);

  if (loading) return <LoadingSpinner fullPage />;
  if (!company) return <div className="container" style={{padding:'60px 0',textAlign:'center'}}>Company not found. <Link to="/">Go home</Link></div>;

  const name = company.companyName || company.name;
  const ratingColor = getRatingColor(avgRating);
  const ratingLabel = getRatingLabel(avgRating, i18n.language);
  // Business banner can be a dedicated background image, or fall back to photo gallery
  // Business banner images come from the owner's uploaded photos (company.photos[])
  // Review images are shown only on individual review cards, not the banner
  const heroImages = (company?.photos||[]).filter(Boolean).slice(0,5);
  const hasBackgroundImage = !!company?.backgroundImageUrl;

  return (
    <div className="company-page">
      {/* ── Hero header (Yelp-style with photo banner) ── */}
      <div className="company-hero-header">
        {/* Photo banner */}
        <div className="company-photo-banner">
          {hasBackgroundImage ? (
            <img src={company.backgroundImageUrl} alt={name} className="company-banner-main" />
          ) : heroImages.length > 0 ? (
            <>
              <img src={heroImages[0]} alt={name} className="company-banner-main" />
              {heroImages.slice(1,4).map((src, i) => (
                <img key={i} src={src} alt="" className="company-banner-thumb" />
              ))}
              {heroImages.length > 3 && (
                <button className="company-banner-see-all" onClick={() => setLightboxImg({src:heroImages[0],list:heroImages,idx:0})}>
                  See all {heroImages.length} photos
                </button>
              )}
            </>
          ) : (
            <div className="company-banner-placeholder">
              <div className="company-banner-letter">{name[0]?.toUpperCase()}</div>
            </div>
          )}
        </div>

        {/* Info row */}
        <div className="company-info-header">
          <div className="container">
            <div className="company-info-inner">
              <div className="company-logo-wrap">
                {company.logoUrl
                  ? <img src={company.logoUrl} alt={name} className="company-logo-img" />
                  : <div className="company-logo-initial">{name[0]?.toUpperCase()}</div>
                }
              </div>
              <div className="company-info-body">
                <div className="company-info-top">
                  <h1 className="company-title">{name}</h1>
                  {company.isVerified && <span className="company-verified-badge">✓ {t('company.verified')}</span>}
                </div>
                <div className="company-meta-chips">
                  <span className="company-chip category-chip">{getCategoryLabel(company.category, t)}</span>
                  {company.address && <span className="company-chip">📍 {company.address}</span>}
                  {company.phone && <a href={`tel:${company.phone}`} className="company-chip link-chip">📞 {company.phone}</a>}
                  {company.website && <a href={sanitizeUrl(company.website)} target="_blank" rel="noopener noreferrer" className="company-chip link-chip">🌐 {company.website.replace(/^https?:\/\//,'')}</a>}
                  {company.email && <a href={`mailto:${company.email}`} className="company-chip link-chip">✉️ {company.email}</a>}
                </div>
                <div className="company-rating-row">
                  <StarRating rating={avgRating} size={20} />
                  <span className="company-rating-num" style={{color:ratingColor}}>{avgRating.toFixed(1)}</span>
                  <span className="company-rating-label" style={{color:ratingColor}}>{ratingLabel}</span>
                  <span className="company-rating-count">· {reviews.length} {t('company.total_reviews')}</span>
                </div>
              </div>
              <div className="company-action-col">
                {isBusinessOwner && (
                  <button className="btn btn-outline company-write-btn"
                    onClick={() => window.location.href = '/company-dashboard'}
                    style={{marginRight:8}}>
                    📊 {t('cd.overview')||'Dashboard'}
                  </button>
                )}
                <button className="btn btn-primary company-write-btn"
                  onClick={() => user ? openModal('writeReview',{company}) : openModal('login')}>
                  ✍️ {t('company.write_review')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="container company-body-grid">
        {/* LEFT: Reviews */}
        <div className="company-reviews-col">
          {/* Rating breakdown */}
          <div className="rating-summary-card">
            <div className="rating-summary-top">
              <div className="rating-big-num">{avgRating.toFixed(1)}</div>
              <div className="rating-summary-right">
                <StarRating rating={avgRating} size={18} />
                <div style={{fontSize:'0.8rem',color:'var(--text-4)',marginTop:4}}>{reviews.length} {t('company.total_reviews')}</div>
                <div className="rating-bars">
                  {[5,4,3,2,1].map(star => {
                    const count = reviews.filter(r=>r.rating===star).length;
                    const pct = reviews.length ? (count/reviews.length)*100 : 0;
                    return (
                      <div key={star} className="rating-bar-row">
                        <span className="rating-bar-label">{star}★</span>
                        <div className="rating-bar-track"><div className="rating-bar-fill" style={{width:`${pct}%`,background:getRatingColor(star)}}/></div>
                        <span className="rating-bar-count">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sort controls */}
          <div className="reviews-header">
            <h2 className="reviews-title">{t('company.all_reviews')} ({reviews.length})</h2>
            <div className="sort-btns">
              {[['newest',t('review.sort_newest')],['highest',t('review.sort_highest')],['lowest',t('review.sort_lowest')]].map(([v,l]) => (
                <button key={v} className={`sort-btn${sortBy===v?' active':''}`} onClick={()=>setSortBy(v)}>{l}</button>
              ))}
            </div>
          </div>

          {/* Reviews grid (Yelp-style widgets) */}
          {sortedReviews.length === 0 ? (
            <div className="empty-reviews">
              <p>{t('review.no_reviews')}</p>
              <button className="btn btn-primary" onClick={()=>user?openModal('writeReview',{company}):openModal('login')}>
                {t('company.write_review')}
              </button>
            </div>
          ) : (
            <div className="review-widgets-grid">
              {sortedReviews.map(review => (
                <ReviewWidget
                  key={review.id} review={review}
                  reactions={reactions[review.id]}
                  myReaction={userReactionByReview[review.id]}
                  isTranslating={translating[review.id]}
                  translatedText={translated[review.id]}
                  onOpen={() => setActiveReview(review)}
                  onReact={(type) => handleReaction(review.id, type)}
                  onTranslate={() => translateReview(review.id, review.comment)}
                  canReport={!!user && review.userId !== user.uid}
                  isReported={reportedReviews.has(review.id)}
                  onReport={() => setReportModal(review)}
                  t={t}
                  lang={i18n.language}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Business info sidebar */}
        <aside className="company-sidebar">
          <div className="biz-info-card">
            <h3>{t('company.business_info') || 'Business Info'}</h3>
            {company.address && (
              <div className="biz-info-row">
                <span className="biz-info-icon">📍</span>
                <div>
                  <div className="biz-info-label">{t('company.address')||'Address'}</div>
                  <div className="biz-info-value">{company.address}</div>
                  <a
                    href={`https://www.mapbox.com/directions/?location=${encodeURIComponent((company.address||'') + ' ' + (company.city||'') + ' Rwanda')}&access_token=${MAPBOX_TOKEN}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{fontSize:'0.74rem',color:'var(--brand)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:4,marginTop:4,textDecoration:'none'}}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    Get Directions
                  </a>
                </div>
              </div>
            )}
            {/* Embedded mini map */}
            {company.address && (
              <div style={{marginTop:8,borderRadius:10,overflow:'hidden',border:'1px solid var(--border)'}}>
                <a 
                  href={`https://www.mapbox.com/mDirections/?place=${encodeURIComponent((company.address||'') + (company.city ? ', ' + company.city : '') + ', Rwanda')}&access_token=${MAPBOX_TOKEN}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{position:'relative',display:'block',height:'160px',background:'linear-gradient(135deg,#e8e8e8 0%,#d0d0d0 100%)',overflow:'hidden',textDecoration:'none'}}
                >
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8}}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{fontSize:13,fontWeight:600,color:'#444'}}>View on Map</span>
                  </div>
                  <div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(255,255,255,0.9)',padding:'8px 12px',fontSize:11,color:'#666',textAlign:'center',borderTop:'1px solid #ddd'}}>
                    {company.address}{company.city ? `, ${company.city}` : ''}
                  </div>
                </a>
              </div>
            )}
            {company.phone && (
              <div className="biz-info-row">
                <span className="biz-info-icon">📞</span>
                <div><div className="biz-info-label">{t('company.phone')||'Phone'}</div><div className="biz-info-value"><a href={`tel:${company.phone}`}>{company.phone}</a></div></div>
              </div>
            )}
            {company.website && (
              <div className="biz-info-row">
                <span className="biz-info-icon">🌐</span>
                <div><div className="biz-info-label">{t('company.website')||'Website'}</div><div className="biz-info-value"><a href={sanitizeUrl(company.website)} target="_blank" rel="noopener noreferrer">{company.website.replace(/^https?:\/\//,'')}</a></div></div>
              </div>
            )}
            {company.email && (
              <div className="biz-info-row">
                <span className="biz-info-icon">✉️</span>
                <div><div className="biz-info-label">{t('company.email')||'Email'}</div><div className="biz-info-value"><a href={`mailto:${company.email}`}>{company.email}</a></div></div>
              </div>
            )}
            <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)'}}>
              <span className={`ap-badge ${company.isVerified?'green':'gray'}`}>
                {company.isVerified ? '✓ '+t('company.verified') : '• '+(t('company.unverified')||'Unverified')}
              </span>
            </div>
          </div>

          <div className="write-review-card">
            <h3>✍️ {t('company.write_review')}</h3>
            <p style={{fontSize:'0.84rem',color:'var(--brand-dark)',lineHeight:1.5,marginBottom:16}}>
              {t('review.share_exp')||'Share your experience and help others make better decisions.'}
            </p>
            <button className="btn btn-primary" style={{width:'100%'}}
              onClick={()=>user?openModal('writeReview',{company}):openModal('login')}>
              {user ? t('company.write_review') : t('nav.login')}
            </button>
          </div>
        </aside>
      </div>

      {/* ── Products / Menu — shown only if business has listed products ── */}
      {products.length > 0 && (
        <section style={{ padding: '48px 0', background: 'var(--bg-2)' }}>
          <div className="container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                Products & Menu
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-4)' }}>{products.length} item{products.length !== 1 ? 's' : ''}</span>
            </div>
            {/* Group by category */}
            {(() => {
              const cats = [...new Set(products.map(p => p.category || 'Other'))];
              return cats.map(cat => (
                <div key={cat} style={{ marginBottom: 32 }}>
                  {cats.length > 1 && (
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 14 }}>
                      {cat}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                    {products.filter(p => (p.category || 'Other') === cat).map(product => (
                      <div key={product.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.2s, transform 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}>
                        {product.imageUrl && (
                          <img src={product.imageUrl} alt={product.name}
                            style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }}
                            onError={e => e.target.style.display = 'none'}/>
                        )}
                        <div style={{ padding: 16 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-1)', marginBottom: 4 }}>{product.name}</div>
                          {product.description && (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>{product.description}</p>
                          )}
                          {product.price && (
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--brand)' }}>
                              {Number(product.price).toLocaleString()} {product.currency || 'RWF'}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>
      )}

      {/* ── Company Stories — full width below reviews ── */}
      {company && (
        <StoriesSection
          companyId={company.id}
          companyName={company.companyName || company.name}
          showUpload={false}
          currentUser={user}
          limit={6}
        />
      )}

      {/* ── Review detail modal ── */}
      {activeReview && (
        <ReviewModal
          review={activeReview}
          replyText={replyText[activeReview.id]||''}
          replyError={replyError}
          onReplyChange={v => {
            setReplyText(p=>({...p,[activeReview.id]:v}));
            setReplyError(v.length > 1000 ? 'Replies can be at most 1000 characters.' : '');
          }}
          onReplySubmit={() => submitReply(activeReview.id, isBusinessOwner)}
          submitting={submittingReply===activeReview.id}
          reactions={reactions[activeReview.id]}
          myReaction={userReactionByReview[activeReview.id]}
          onReact={type=>handleReaction(activeReview.id,type)}
          translated={translated[activeReview.id]}
          isTranslating={translating[activeReview.id]}
          onTranslate={()=>translateReview(activeReview.id,activeReview.comment)}
          lang={i18n.language}
          onImageClick={(src,list,idx)=>setLightboxImg({src,list,idx})}
          onClose={()=>setActiveReview(null)}
          t={t}
        />
      )}

      {/* ── Image lightbox ── */}
      {lightboxImg && (
        <ImageLightbox
          src={lightboxImg.src}
          list={lightboxImg.list}
          idx={lightboxImg.idx}
          onNavigate={(newIdx)=>setLightboxImg({...lightboxImg,src:lightboxImg.list[newIdx],idx:newIdx})}
          onClose={()=>setLightboxImg(null)}
        />
      )}
      {reportModal && (
        <ReportReviewModal
          review={reportModal}
          company={company}
          onClose={() => setReportModal(null)}
          onSuccess={handleReportSuccess}
        />
      )}
    </div>
  );
}

/* ── Review Widget (Yelp-style card) ── */
function ReviewWidget({ review, reactions, myReaction, isTranslating, translatedText, onOpen, onReact, onTranslate, canReport, isReported, onReport, t, lang }) {
  const name = review.userName || 'Anonymous';
  const comment = translatedText || review.comment || '';
  const short = comment.length > 120 ? comment.slice(0,120)+'…' : comment;
  const color = avatarColor(name);
  const hasImages = review.images?.length > 0;

  return (
    <div className="review-widget" onClick={onOpen}>
      <div className="rw-header">
        <div className="rw-avatar" style={{background:color}}>{getInitials(name)}</div>
        <div className="rw-user-info">
          <div className="rw-name">{name}</div>
          <div className="rw-date">{formatRelativeTime(review.createdAt, lang)}</div>
        </div>
        <StarRating rating={review.rating} size={14} />
      </div>
      <p className="rw-comment">{short}</p>
      {hasImages && (
        <div className="rw-images">
          {review.images.slice(0,3).map((src,i)=>(
            <img key={i} src={src} alt="" className="rw-thumb" />
          ))}
          {review.images.length > 3 && <div className="rw-more-imgs">+{review.images.length-3}</div>}
        </div>
      )}
      <div className="rw-footer">
        <div className="rw-reactions" onClick={e=>e.stopPropagation()}>
          <button
            key="helpful"
            className={`rw-react-btn${myReaction==='helpful'?' rw-react-btn-active':''}`}
            aria-pressed={myReaction==='helpful'}
            title={myReaction==='helpful' ? 'Remove reaction' : 'Helpful'}
            onClick={()=>onReact('helpful')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            {(reactions?.helpful||0)||''}
          </button>
          <button
            key="love"
            className={`rw-react-btn${myReaction==='love'?' rw-react-btn-active':''}`}
            aria-pressed={myReaction==='love'}
            title={myReaction==='love' ? 'Remove reaction' : 'Love'}
            onClick={()=>onReact('love')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            {(reactions?.love||0)||''}
          </button>
          <button className="rw-react-btn" onClick={e=>{e.stopPropagation();onTranslate();}} disabled={isTranslating}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            {isTranslating ? '…' : ''}
          </button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}} onClick={e=>e.stopPropagation()}>
          {(review.replies?.length>0) && (
            <span className="rw-reply-count">💬 {review.replies.length}</span>
          )}
          {canReport && (
            <button
              className="rw-react-btn"
              title={isReported ? 'Already reported' : 'Report this review'}
              disabled={isReported}
              onClick={onReport}
              style={{ opacity: isReported ? 0.5 : 1, color: isReported ? 'var(--text-4)' : undefined }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isReported ? 'currentColor' : '#ef4444'} strokeWidth="2" strokeLinecap="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
              {isReported ? 'Reported' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Review Modal ── */
function ReviewModal({ review, user, isBusinessOwner, replyText, replyError, onReplyChange, onReplySubmit, submitting, reactions, myReaction, onReact, translated, isTranslating, onTranslate, onImageClick, onClose, t, lang }) {
  const name = review.userName || 'Anonymous';
  const color = avatarColor(name);
  const comment = translated || review.comment || '';
  const bizReplies = (review.replies||[]).filter(r=>r.by==='business'||r.isBusinessReply);
  const userReplies = (review.replies||[]).filter(r=>!(r.by==='business'||r.isBusinessReply));

  return (
    <div className="review-modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="review-modal">
        <button className="review-modal-close" onClick={onClose}>✕</button>

        {/* Reviewer info */}
        <div className="rm-header">
          <div className="rm-avatar" style={{background:color}}>{getInitials(name)}</div>
          <div>
            <div className="rm-name">{name}</div>
            <div className="rm-date">{formatRelativeTime(review.createdAt, lang)}</div>
          </div>
          <div className="rm-stars"><StarRating rating={review.rating} size={18} /></div>
        </div>

        {/* Review text */}
        <div className="rm-comment">{comment}</div>

        {/* Translate button */}
        <button className="rm-translate-btn" onClick={onTranslate} disabled={isTranslating}>
          🌐 {isTranslating ? 'Translating…' : (translated ? 'Show Original' : `Translate`)}
        </button>

        {/* Images gallery */}
        {review.images?.length > 0 && (
          <div className="rm-images">
            {review.images.map((src,i)=>(
              <img key={i} src={src} alt={`photo ${i+1}`} className="rm-image"
                onClick={()=>onImageClick(src,review.images,i)}
                style={{cursor:'pointer'}}
              />
            ))}
          </div>
        )}

        {/* Reactions */}
        <div className="rm-reactions">
          {[
            ['helpful', <svg key="h" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>, 'Helpful', (reactions?.helpful||0)],
            ['thanks', <svg key="t" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, 'Thanks', (reactions?.thanks||0)],
            ['love', <svg key="l" width="14" height="14" viewBox="0 0 24 24" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>, 'Love', (reactions?.love||0)],
          ].map(([type,icon,label,count])=>(
            <button
              key={type}
              className={`rm-react-btn${myReaction===type?' rm-react-btn-active':''}`}
              aria-pressed={myReaction===type}
              title={myReaction===type ? 'Click again to remove' : label}
              onClick={()=>onReact(type)}
            >
              {icon} {label} {count>0&&<span className="rm-react-count">{count}</span>}
            </button>
          ))}
        </div>

        {/* Business reply section */}
        {bizReplies.length > 0 && (
          <div className="rm-biz-replies">
            <div className="rm-section-label">🏢 Business Response</div>
            {bizReplies.map((r,i)=>(
              <div key={i} className="rm-biz-reply">
                <div className="rm-reply-meta">{r.userName||'Business'} · {formatRelativeTime(r.when, lang)}</div>
                <p className="rm-reply-text">{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* User replies section */}
        {userReplies.length > 0 && (
          <div className="rm-user-replies">
            <div className="rm-section-label">💬 Comments</div>
            {userReplies.map((r,i)=>(
              <div key={i} className="rm-user-reply">
                <div className="rm-reply-meta">{r.userName||'User'} · {formatRelativeTime(r.when, lang)}</div>
                <p className="rm-reply-text">{r.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Reply input */}
        {user && (
          <div className="rm-reply-form">
            <div className="rm-reply-label">
              {isBusinessOwner ? '🏢 Reply as Business Owner' : '💬 Add a Comment'}
            </div>
            <div className="rm-reply-row">
              <input
                className="input rm-reply-input"
                placeholder={isBusinessOwner ? 'Write your business response…' : 'Write a comment…'}
                value={replyText}
                onChange={e=>onReplyChange(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onReplySubmit();}}}
              />
              <button
                className={`btn btn-sm ${isBusinessOwner?'btn-primary':'btn-outline'}`}
                onClick={onReplySubmit}
                disabled={submitting||!replyText.trim()||replyText.length > 1000}
              >
                {submitting?'…':t('review.reply')}
              </button>
            </div>
            {replyError && (
              <div style={{marginTop:8,fontSize:'0.78rem',color:'#ef4444',fontWeight:600}}>
                {replyError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Image Lightbox ── */
function ImageLightbox({ src, list, idx, onNavigate, onClose }) {
  useEffect(() => {
    const handler = e => {
      if (e.key==='Escape') onClose();
      if (e.key==='ArrowRight'&&idx<list.length-1) onNavigate(idx+1);
      if (e.key==='ArrowLeft'&&idx>0) onNavigate(idx-1);
    };
    window.addEventListener('keydown',handler);
    return ()=>window.removeEventListener('keydown',handler);
  },[idx,list,onNavigate,onClose]);

  return (
    <div className="lightbox-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <button className="lightbox-close" onClick={onClose}>✕</button>
      {idx>0 && <button className="lightbox-nav lightbox-prev" onClick={()=>onNavigate(idx-1)}>‹</button>}
      <img src={src} alt="" className="lightbox-img" />
      {idx<list.length-1 && <button className="lightbox-nav lightbox-next" onClick={()=>onNavigate(idx+1)}>›</button>}
      <div className="lightbox-counter">{idx+1} / {list.length}</div>
    </div>
  );
}
