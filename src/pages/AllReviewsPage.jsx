import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db, collection, query, orderBy, getDocs, doc, getDoc } from '../firebase/config';
import StarRating from '../components/StarRating';
import LoadingSpinner from '../components/LoadingSpinner';
import ReviewDetailModal from '../components/ReviewDetailModal';
import { formatRelativeTime } from '../utils/helpers';
import './HomePage.css';

/* ── Review card — same design as homepage ── */
function ReviewCard({ review, onOpen }) {
  const name      = review.companyName || 'Unknown Service';
  const userName  = review.userName   || 'Anonymous';
  const comment   = review.comment    || '';
  const rating    = review.rating     || 0;
  const timeAgo   = formatRelativeTime(review.createdAt);
  const initial   = userName[0]?.toUpperCase() || 'A';
  const COLORS    = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6'];
  const color     = COLORS[userName.charCodeAt(0) % COLORS.length];
  const firstImage = review.images?.[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="review-card-tp"
      style={{ textAlign:'left', font:'inherit', cursor:'pointer' }}
      aria-label={`View review by ${userName}`}
    >
      <div className="rct-header">
        {review.userPhotoURL
          ? <img src={review.userPhotoURL} alt={userName} className="rct-avatar rct-avatar-photo" />
          : <div className="rct-avatar" style={{ background: color }}>{initial}</div>
        }
        <div className="rct-user-info">
          <div className="rct-username">{userName}</div>
          <div className="rct-time">{timeAgo}</div>
        </div>
      </div>
      <div className="rct-stars">
        <StarRating rating={rating} size={16} />
      </div>
      <p className="rct-comment">{comment.length > 130 ? comment.slice(0, 130) + '…' : comment}</p>
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

/* ── Grid with load-more ── */
function ReviewGrid({ reviews }) {
  const [shown, setShown] = useState(16);
  const [active, setActive] = useState(null);
  const visible = reviews.slice(0, shown);
  const hasMore = shown < reviews.length;

  return (
    <div className="review-grid-wrap">
      <div className="review-grid">
        {visible.map((rev, i) => (
          <ReviewCard key={rev.id || i} review={rev} onOpen={() => setActive(rev)} />
        ))}
      </div>
      <div style={{ textAlign:'center', marginTop:32 }}>
        {hasMore && (
          <button
            className="btn btn-outline"
            style={{ padding:'10px 32px', fontSize:'0.9rem', fontWeight:600 }}
            onClick={() => setShown(s => s + 16)}
          >
            Load More Reviews
          </button>
        )}
        {reviews.length > 0 && (
          <p style={{ marginTop:12, fontSize:'0.8rem', color:'var(--text-4)' }}>
            Showing {visible.length} of {reviews.length} reviews
          </p>
        )}
      </div>
      {active && (
        <ReviewDetailModal review={active} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

/* ── Page ── */
export default function AllReviewsPage() {
  const { t } = useTranslation();
  const [reviews, setReviews]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'reviews'), orderBy('createdAt', 'desc'))
        );
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Batch-fetch company logos for the first 20 reviews only (perf)
        const ids = [...new Set(data.slice(0, 20).map(r => r.companyId).filter(Boolean))];
        const logoMap = {};
        await Promise.all(ids.map(async id => {
          try {
            const s = await getDoc(doc(db, 'companies', id));
            if (s.exists()) logoMap[id] = s.data().logoUrl || null;
          } catch {}
        }));

        setReviews(data.map(r => ({ ...r, companyLogoUrl: logoMap[r.companyId] || null })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  return (
    <section className="section recent-reviews-section" style={{ paddingTop: 40 }}>
      <div className="container">
        <div className="section-header" style={{ marginBottom: 'var(--sp-7)' }}>
          <div>
            <div className="section-eyebrow">
              <span className="section-eyebrow-dot" />Live
            </div>
            <h2 className="section-title">All Reviews</h2>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : reviews.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'var(--text-4)' }}>
            No reviews yet. Be the first!
          </div>
        ) : (
          <ReviewGrid reviews={reviews} />
        )}
      </div>
    </section>
  );
}
