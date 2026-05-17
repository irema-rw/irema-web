import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  db,
  collection, query, where, getDocs, doc, deleteDoc, updateDoc, arrayUnion,
} from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useModalStore } from '../store/modalStore';
import LoadingSpinner from '../components/LoadingSpinner';
import ReviewModal from '../components/ReviewModal';
import './UserDashboard.css';
import './MyReviewsPage.css';

/* ── Exact same card used on the UserDashboard ── */
function UserReviewCard({ rev, onDelete, onOpenModal, currentUser, t, i18n }) {
  const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Me';
  const COLORS = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6'];
  const color = COLORS[(name||'M').charCodeAt(0) % COLORS.length];

  const timeAgo = (() => {
    const ts = rev.createdAt;
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null;
    if (!d) return '';
    const diff = Date.now() - d.getTime(), hrs = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
    if (diff < 60000)  return t('time.just_now') || 'just now';
    if (hrs < 1)       return `${Math.floor(diff / 60000)} ${t('time.min_ago') || 'min ago'}`;
    if (hrs < 24)      return `${hrs}${t('time.h_ago') || 'h ago'}`;
    if (days === 1)    return t('time.yesterday') || 'yesterday';
    if (days < 7)      return `${days} ${t('time.days_ago') || 'days ago'}`;
    return d.toLocaleDateString(i18n.language, { month:'short', day:'numeric', year:'numeric' });
  })();

  const firstImage = rev.images?.[0];
  const bizReplies = (rev.replies || []).filter(r => r.by === 'business' || r.isBusinessReply);
  const hasReplies = (rev.replies || []).length > 0;

  return (
    <div
      onClick={e => { if (e.target.closest('.ud-delete-btn')) return; onOpenModal(rev); }}
      style={{
        background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14,
        padding:18, cursor:'pointer', display:'flex', flexDirection:'column', gap:9,
        transition:'box-shadow 0.18s, transform 0.18s, border-color 0.18s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.borderColor='var(--brand-light)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow=''; e.currentTarget.style.transform=''; e.currentTarget.style.borderColor='var(--border)'; }}
    >
      {/* Header: avatar + name + time + stars */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {currentUser?.photoURL
          ? <img src={currentUser.photoURL} alt={name} style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
          : <div style={{ width:36, height:36, borderRadius:'50%', background:color, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.88rem', flexShrink:0 }}>{(name||'M')[0].toUpperCase()}</div>
        }
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
            <div style={{ display:'flex', gap:1, flexShrink:0 }}>
              {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize:12, color: i <= (rev.rating||0) ? '#e8b800' : '#d1d5db' }}>★</span>)}
            </div>
            <span style={{ fontSize:'0.72rem', color:'var(--text-4)' }}>{timeAgo}</span>
          </div>
        </div>
        <button className="ud-delete-btn" onClick={e => { e.stopPropagation(); onDelete(rev.id); }}
          title={t('profile.delete_review') || 'Delete review'}
          style={{ marginLeft:4, background:'none', border:'none', cursor:'pointer', color:'var(--text-4)', display:'flex', padding:4, flexShrink:0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      </div>

      {/* Review text */}
      {rev.comment && (
        <p style={{ margin:0, fontSize:'0.86rem', color:'var(--text-2)', lineHeight:1.55,
          display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {rev.comment}
        </p>
      )}

      {/* First image */}
      {firstImage && <img src={firstImage} alt="" style={{ width:'100%', height:160, objectFit:'cover', borderRadius:8 }}/>}

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        borderTop:'1px solid var(--border)', paddingTop:7, marginTop:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.75rem', color:'var(--text-3)' }}>
          <div style={{ width:22, height:22, borderRadius:5, background:'var(--brand-xlight)', color:'var(--brand)',
            display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.7rem', flexShrink:0 }}>
            {(rev.companyName||'?')[0].toUpperCase()}
          </div>
          <span style={{ fontWeight:600, color:'var(--text-2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:120 }}>
            {rev.companyName || t('profile.business') || 'Business'}
          </span>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {bizReplies.length > 0 && (
            <span style={{ fontSize:'0.7rem', background:'#f0faf6', color:'#1f6b52', padding:'2px 8px', borderRadius:99, fontWeight:600 }}>
              {t('profile.replied') || 'Replied'}
            </span>
          )}
          {hasReplies && (
            <span style={{ fontSize:'0.7rem', background:'var(--bg-2)', color:'var(--text-4)', padding:'2px 8px', borderRadius:99 }}>
              {(rev.replies||[]).length}
            </span>
          )}
          <span style={{ fontSize:'0.72rem', color:'var(--brand)', fontWeight:600 }}>View →</span>
        </div>
      </div>
    </div>
  );
}

export default function MyReviewsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { openModal } = useModalStore();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [reviewModal, setReviewModal] = useState(null);

  useEffect(() => { if (user) loadReviews(); }, [user]);

  async function loadReviews() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'reviews'), where('userId', '==', user.uid)));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReviews(data);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function confirmDelete(id) {
    setDeleting(true);
    try { await deleteDoc(doc(db, 'reviews', id)); setReviews(p => p.filter(r => r.id !== id)); }
    catch(e) { console.error(e); }
    setDeleting(false);
    setDeleteConfirm(null);
  }

  return (
    <div className="user-dashboard">
      <div className="container">

        <div className="ud-section-header">
          <div>
            <h2 className="ud-section-title">
              {t('profile.reviews_tab') || 'My Reviews'}
              <span className="ud-section-count">{reviews.length}</span>
            </h2>
            <p className="ud-section-sub">
              {t('profile.click_review_desc') || 'Click on a review to see full details and business responses.'}
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : reviews.length === 0 ? (
          <div className="ud-empty card">
            <div className="ud-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h3>{t('profile.no_reviews_yet') || 'No reviews yet'}</h3>
            <p>{t('profile.no_reviews_desc') || 'Share your experience with businesses you have visited across Rwanda.'}</p>
            <button className="btn btn-primary" onClick={() => openModal('writeReview')}>
              {t('review.write') || 'Write a Review'}
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
            {reviews.slice().sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)).map(rev => (
              <UserReviewCard
                key={rev.id}
                rev={rev}
                onDelete={id => setDeleteConfirm(id)}
                onOpenModal={setReviewModal}
                currentUser={user}
                t={t}
                i18n={i18n}
              />
            ))}
          </div>
        )}
      </div>

      {reviewModal && (
        <ReviewModal
          review={reviewModal}
          onClose={() => setReviewModal(null)}
          mode="user"
          currentUser={user}
          reactions={{ helpful: reviewModal.helpful||0, love: reviewModal.love||0, thanks: reviewModal.thanks||0 }}
          onReact={null}
          companyName={reviewModal.companyName}
          onReply={async (reviewId, text) => {
            try {
              const reply = { by:'user', text, userId:user.uid,
                userName: user.displayName || user.email?.split('@')[0] || 'User',
                when: new Date().toISOString(), timestamp: Date.now() };
              setReviewModal(prev => prev?.id === reviewId ? { ...prev, replies:[...(prev.replies||[]), reply] } : prev);
              setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, replies:[...(r.replies||[]), reply] } : r));
              await updateDoc(doc(db, 'reviews', reviewId), { replies: arrayUnion(reply) });
            } catch(e) { console.error(e); }
          }}
        />
      )}

      {deleteConfirm && (
        <div className="ud-modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="ud-confirm-modal">
            <h3>{t('profile.delete_review_confirm') || 'Delete Review?'}</h3>
            <p>{t('profile.delete_review_warning') || 'This review will be permanently removed and cannot be undone.'}</p>
            <div className="ud-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn" style={{ background:'#ef4444', color:'white', border:'none' }}
                onClick={() => confirmDelete(deleteConfirm)} disabled={deleting}>
                {deleting ? (t('profile.deleting') || 'Deleting…') : (t('profile.delete_review_btn') || 'Delete Review')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
