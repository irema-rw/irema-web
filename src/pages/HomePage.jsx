import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, collection, query, orderBy, limit, getDocs, where, doc, updateDoc, getDoc } from '../firebase/config';
import { useModalStore } from '../store/modalStore';
import CompanyCard from '../components/CompanyCard';
import StarRating from '../components/StarRating';
import LoadingSpinner from '../components/LoadingSpinner';
import { getCategoryLabel, formatRelativeTime, getRatingColor } from '../utils/helpers';
import { isArchivedRecord } from '../utils/adminModeration';
import './HomePage.css';
import StoriesSection from '../components/StoriesSection';
import ReviewDetailModal from '../components/ReviewDetailModal';

// SVG icons — cross-platform reliable
const CAT_ICONS = {
  restaurant: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>),
  bank: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2L2 7h20L12 2z"/></svg>),
  hotel: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22V8l9-6 9 6v14"/><path d="M9 22V12h6v10"/></svg>),
  healthcare: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>),
  education: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>),
  electronics: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>),
  supermarket: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>),
  telecom: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>),
  real_estate: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>),
  pharmacy: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12h6M12 9v6"/></svg>),
  fitness: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5h11M6.5 17.5h11M3 12h18M3 12c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3S3 13.7 3 12zM15 12c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3-3-1.3-3-3z"/></svg>),
  travel: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>),
};

const CATEGORIES = [
  { key: 'restaurant' }, { key: 'bank' },
  { key: 'hotel' }, { key: 'healthcare' },
  { key: 'education' }, { key: 'electronics' },
  { key: 'supermarket' }, { key: 'telecom' },
  { key: 'real_estate' }, { key: 'pharmacy' },
  { key: 'fitness' }, { key: 'travel' },
];

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openModal } = useModalStore();
  // Search moved to navbar — removed duplicate hero search
  const suggestionsCache = useRef(null);
  const [topCompanies, setTopCompanies] = useState([]);
  const [recentReviews, setRecentReviews] = useState([]);
  const [stats, setStats] = useState({ users: 0, businesses: 0, reviews: 0 });
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);

  useEffect(() => {
    loadTopCompanies();
    loadRecentReviews();
    loadStats();

    // Hot-reload when a new review is submitted from anywhere on the site
    function handleNewReview() { loadRecentReviews(); loadStats(); }
    window.addEventListener('irema:newReview', handleNewReview);
    return () => window.removeEventListener('irema:newReview', handleNewReview);
  }, []);

  async function loadStats() {
    try {
      const [uSnap, bSnap, rSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), limit(1000))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'companies'), limit(1000))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'reviews'), limit(5000))).catch(() => ({ docs: [] })),
      ]);
      setStats({
        users: uSnap.docs?.length ?? 0,
        businesses: bSnap.docs?.filter(d => !isArchivedRecord(d.data()))?.length ?? 0,
        reviews: rSnap.docs?.length ?? 0,
      });
    } catch (e) { console.error(e); }
  }

  async function loadTopCompanies() {
    try {
      // Fast: use stored averageRating — no need to fetch all reviews
      const compSnap = await getDocs(
        query(collection(db, 'companies'), orderBy('averageRating', 'desc'), limit(12))
      );
      const companies = compSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !isArchivedRecord(c));
      setTopCompanies(companies.slice(0, 6));
    } catch (e) {
      // Fallback if index not ready: load without ordering
      try {
        const compSnap = await getDocs(collection(db, 'companies'));
        const companies = compSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(c => !isArchivedRecord(c))
          .sort((a, b) => (b.averageRating||0) - (a.averageRating||0));
        setTopCompanies(companies.slice(0, 6));
      } catch (e2) { console.error(e2); }
    }
    setLoadingCompanies(false);
  }

  async function loadRecentReviews() {
    try {
      // Load ALL reviews ordered by newest first — no limit
      const snap = await getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc')));
      const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Fetch linked companies so archived businesses are hidden from the public feed.
      const companyIds = [...new Set(reviews.map(r => r.companyId).filter(Boolean))];
      const logoMap = {};
      const archivedCompanyIds = new Set();
      await Promise.all(companyIds.map(async cid => {
        try {
          const cSnap = await getDoc(doc(db, 'companies', cid));
          if (cSnap.exists()) {
            const companyData = cSnap.data();
            if (isArchivedRecord(companyData)) archivedCompanyIds.add(cid);
            logoMap[cid] = companyData.logoUrl || null;
          }
        } catch {}
      }));
      setRecentReviews(reviews
        .filter(r => !archivedCompanyIds.has(r.companyId))
        .map(r => ({ ...r, companyLogoUrl: logoMap[r.companyId] || null })));
    } catch (e) { console.error(e); }
    setLoadingReviews(false);
  }

  // Search functionality moved to navbar — removed hero search duplication

  const fmtNum = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : n > 0 ? n.toString() : 'N/A';

  return (
    <div className="homepage">

      {/* ── Hero ── */}
      <section className="hero">
        <div className="container">
          <div className="hero-inner">
            <div className="hero-trust-badge">
              <span className="hero-trust-dot" />
              {stats.businesses > 0
                ? `Trusted by ${fmtNum(stats.businesses)}+ Rwandan businesses`
                : "Rwanda's #1 Business Review Platform"
              }
            </div>

            <h1>
              {t('home.hero_title')}<br />
              <span className="hero-accent">{t('home.hero_title_accent')}</span>
            </h1>
            <p className="hero-subtitle">{t('home.hero_subtitle')}</p>

            {/* Search moved to navbar for consistency */}


            <div className="hero-stats-bar">
              <div className="hero-stat">
                <div className="hero-stat-num">{fmtNum(stats.reviews)}<span>+</span></div>
                <div className="hero-stat-label">{t('home.reviews_label')}</div>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <div className="hero-stat-num">{fmtNum(stats.businesses)}<span>+</span></div>
                <div className="hero-stat-label">{t('home.services_label')}</div>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <div className="hero-stat-num">4</div>
                <div className="hero-stat-label">{t('home.languages_label')}</div>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <div className="hero-stat-num">
                  <img src="/rwanda-flag.png" alt="Rwanda" width="36" height="24" style={{borderRadius:4,objectFit:'cover',display:'block'}}/>
                </div>
                <div className="hero-stat-label">Rwanda</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <div className="hero-trustbar">
        <div className="container">
          <div className="hero-trustbar-inner">
            <div className="hero-trustbar-stars">
              <StarRating rating={5} size={22} />
            </div>
            <div className="hero-trustbar-text">
              <strong>Excellent</strong>. Based on {stats.reviews > 0 ? fmtNum(stats.reviews) + '+ reviews' : 'real reviews'}
            </div>
            <div className="hero-trustbar-text" style={{color:'var(--text-4)'}}>|</div>
            <div className="hero-trustbar-text">
              Rwanda's #1 Service Review Platform
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Reviews — Trustpilot-style grid ── */}
      <section className="section recent-reviews-section">
        <div className="container">
          <div className="section-header" style={{marginBottom:'var(--sp-7)'}}>
            <div>
              <div className="section-eyebrow"><span className="section-eyebrow-dot"/>Live</div>
              <h2 className="section-title">{t('home.recent_reviews')}</h2>
            </div>
            <ReviewPageControls reviews={recentReviews} />
          </div>
          {loadingReviews
            ? <LoadingSpinner />
            : recentReviews.length === 0
              ? <div style={{textAlign:'center',padding:'40px',color:'var(--text-4)'}}>
                  No reviews yet. Be the first!
                </div>
              : <ReviewGrid reviews={recentReviews} />
          }
        </div>
      </section>

      {/* ── Stories Section ── */}
      <StoriesSection limit={8} />

      {/* ── Top Rated Services ── */}
      <section className="section top-rated-section">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-eyebrow"><span className="section-eyebrow-dot"/>Verified</div>
              <h2 className="section-title">{t('home.top_rated')}</h2>
            </div>
            <Link to="/top-rated" className="btn btn-outline btn-sm">{t('common.view_all')}</Link>
          </div>
          {loadingCompanies ? <LoadingSpinner /> : (
            <div className="grid-auto">
              {topCompanies.map((c, i) => (
                <div key={c.id} className="animate-up" style={{animationDelay:`${i*0.07}s`}}>
                  <CompanyCard company={c} />
                </div>
              ))}
              {topCompanies.length === 0 && (
                <div style={{gridColumn:'1/-1', textAlign:'center', padding:'60px', color:'var(--text-4)'}}>
                  <div style={{marginBottom:'16px',display:'flex',justifyContent:'center'}}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                  <p>No services yet — be the first to add one!</p>
                  <Link to="/businesses" className="btn btn-primary" style={{marginTop:'16px'}}>Add Your Service</Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="section categories-section">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-eyebrow"><span className="section-eyebrow-dot"/>Browse</div>
              <h2 className="section-title">{t('home.explore_categories')}</h2>
            </div>
            <Link to="/search" className="btn btn-outline btn-sm">{t('common.view_all')}</Link>
          </div>
          <div className="categories-grid">
            {CATEGORIES.map((cat, i) => (
              <Link key={cat.key} to={`/search?category=${cat.key}`} className="category-tile animate-up" style={{animationDelay:`${i*0.05}s`}} onClick={()=>window.scrollTo({top:0,behavior:'instant'})}>
                <span className="category-tile-icon">{CAT_ICONS[cat.key]}</span>
                <span className="category-tile-label">{getCategoryLabel(cat.key, t)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="section how-section">
        <div className="container">
          <div className="section-header" style={{justifyContent:'center', textAlign:'center', flexDirection:'column', alignItems:'center'}}>
            <div className="section-eyebrow"><span className="section-eyebrow-dot"/>Simple</div>
            <h2 className="section-title">{t('home.how_it_works')}</h2>
            <p className="section-subtitle">{t('home.how_subtitle')}</p>
          </div>
          <div className="how-grid">
            {[
              { num:'1', title: t('home.step1_title'), desc: t('home.step1_desc') },
              { num:'2', title: t('home.step2_title'), desc: t('home.step2_desc') },
              { num:'3', title: t('home.step3_title'), desc: t('home.step3_desc') },
            ].map((step, i) => (
              <div key={step.num} className="how-step animate-up" style={{animationDelay:`${i*0.1}s`}}>
                <div className="how-step-num">{step.num}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── QR Banner ── */}
      <section className="qr-banner-section">
        <div className="container">
          <div className="qr-banner">
            <div className="qr-banner-text">
              <h2>{t('home.scan_qr')}</h2>
              <p>{t('home.scan_qr_subtitle')}</p>
              <Link to="/scan" className="btn btn-outline-white">Scan Now</Link>
            </div>
            <div className="qr-banner-visual">
              <div className="qr-mock">
                <div className="qr-corner tl" /><div className="qr-corner tr" />
                <div className="qr-corner bl" /><div className="qr-corner br" />
                <div className="qr-center">QR</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Download App Banner ── */}
      <section className="app-banner-section">
        <div className="container">
          <div className="app-banner">
            <div className="app-banner-visual">
              <div className="app-phone-mock">
                <div className="app-phone-screen">
                  <div className="app-screen-header" />
                  <div className="app-screen-content">
                    <div className="app-screen-card green" />
                    <div className="app-screen-card light" />
                  </div>
                </div>
              </div>
            </div>
            <div className="app-banner-text">
              <h3>{t('home.download_app_title')}</h3>
              <p>{t('home.download_app_sub')}</p>
              <div className="app-banner-btns">
                <a href="#" className="app-store-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  <div>
                    <span className="app-store-label">Download on the</span>
                    <span className="app-store-name">App Store</span>
                  </div>
                </a>
                <a href="#" className="app-store-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3.18 23.76c.34.19.73.2 1.08.02l13.47-7.74-2.9-2.9-11.65 10.62zM.54 1.43C.2 1.79 0 2.34 0 3.04v17.93c0 .7.2 1.25.54 1.6l.08.08 10.04-10.04v-.23L.62 1.35l-.08.08zM21.15 10.4l-2.9-1.67-3.22 3.22 3.22 3.22 2.93-1.68c.84-.48.84-1.26-.03-1.09zM4.26.22L17.73 7.96l-2.9 2.9L4.18.29l.08-.07z"/></svg>
                  <div>
                    <span className="app-store-label">Get it on</span>
                    <span className="app-store-name">Google Play</span>
                  </div>
                </a>
                <a href="#" className="app-store-btn">
                  <svg viewBox="0 0 100 100" width="20" height="20" fill="currentColor"><path d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm0 90C27.9 90 10 72.1 10 50S27.9 10 50 10s40 17.9 40 40-17.9 40-40 40zm-5-60h10v20H45zm0 30h10v10H45z"/></svg>
                  <div>
                    <span className="app-store-label">Explore it on</span>
                    <span className="app-store-name">AppGallery</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

function ReviewGrid({ reviews }) {
  const [shown, setShown] = React.useState(16); // 4 cols × 4 rows
  // Track which review the user wants to open in the detail modal. Clicking a
  // card no longer jumps straight to the business page — it opens this modal,
  // which contains an explicit "go to business" button.
  const [activeReview, setActiveReview] = React.useState(null);
  const visible = reviews.slice(0, shown);
  const hasMore = shown < reviews.length;

  return (
    <div className="review-grid-wrap">
      <div className="review-grid">
        {visible.map((rev, i) => (
          <ReviewCard key={rev.id || i} review={rev} onOpen={() => setActiveReview(rev)} />
        ))}
      </div>
      <div style={{textAlign:'center', marginTop:32}}>
        {hasMore && (
          <button
            className="btn btn-outline"
            style={{padding:'10px 32px', fontSize:'0.9rem', fontWeight:600}}
            onClick={() => setShown(s => s + 16)}
          >
            Load More Reviews
          </button>
        )}
        {reviews.length > 0 && (
          <p style={{marginTop:12, fontSize:'0.8rem', color:'var(--text-4)'}}>
            Showing {visible.length} of {reviews.length} reviews
          </p>
        )}
      </div>

      {activeReview && (
        <ReviewDetailModal
          review={activeReview}
          onClose={() => setActiveReview(null)}
        />
      )}
    </div>
  );
}

function ReviewPageControls({ reviews }) {
  return null; // Controls are inside ReviewGrid
}

function ReviewCard({ review, onOpen }) {
  const name = review.companyName || 'Unknown Service';
  const userName = review.userName || 'Anonymous';
  const comment = review.comment || '';
  const rating = review.rating || 0;
  const timeAgo = formatRelativeTime(review.createdAt);
  const initial = userName[0]?.toUpperCase() || 'A';
  const AVATAR_COLORS = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6'];
  const color = AVATAR_COLORS[userName.charCodeAt(0) % AVATAR_COLORS.length];
  const firstImage = review.images?.[0];

  // Card is now a button that opens the ReviewDetailModal rather than a
  // Link that jumps straight to the business page.
  return (
    <button
      type="button"
      onClick={onOpen}
      className="review-card-tp"
      style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
      aria-label={`View review by ${userName}`}
    >
      <div className="rct-header">
        {review.userPhotoURL
          ? <img src={review.userPhotoURL} alt={userName} className="rct-avatar rct-avatar-photo" />
          : <div className="rct-avatar" style={{background: color}}>{initial}</div>
        }
        <div className="rct-user-info">
          <div className="rct-username">{userName}</div>
          <div className="rct-time">{timeAgo}</div>
        </div>
      </div>
      <div className="rct-stars">
        <StarRating rating={rating} size={16} />
      </div>
      <p className="rct-comment">{comment.length > 130 ? comment.slice(0,130)+'…' : comment}</p>
      {firstImage && <img src={firstImage} alt="review photo" className="rct-review-img" />}
      <div className="rct-company-row">
        {review.companyLogoUrl
          ? <img src={review.companyLogoUrl} alt={name} className="rct-company-logo" />
          : <div className="rct-company-avatar">{name[0]?.toUpperCase()}</div>
        }
        <div>
          <div className="rct-company-name">{name}</div>
        </div>
      </div>
    </button>
  );
}
