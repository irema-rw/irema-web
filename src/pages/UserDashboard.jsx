import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  db, auth, storage,
  collection, query, where, getDocs, doc, deleteDoc, updateDoc, arrayUnion,
  storageRef, uploadBytes, getDownloadURL,
} from '../firebase/config';
import { updateProfile } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { useModalStore } from '../store/modalStore';
import StarRating from '../components/StarRating';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDate, getInitials } from '../utils/helpers';
import './UserDashboard.css';
import ReviewModal from '../components/ReviewModal';

function Stars({ rating, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize: size, color: i <= Math.round(rating || 0) ? '#e8b800' : '#d1d5db' }}>★</span>
      ))}
    </span>
  );
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:9999,
      background: type === 'error' ? '#ef4444' : '#2d8f6f', color:'white',
      padding:'12px 20px', borderRadius:12, fontSize:'0.88rem', fontWeight:600,
      boxShadow:'0 4px 20px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', gap:8,
    }}>
      {type === 'error' ? '✗' : '✓'} {msg}
    </div>
  );
}

/* ── User Review Widget Card — homepage style, click to open modal ── */
function UserReviewCard({ rev, cid, onDelete, onOpenModal, currentUser, t, i18n }) {
  const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Me';
  const COLORS = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6'];
  const color = COLORS[(name||'M').charCodeAt(0) % COLORS.length];
  const timeAgo = (() => {
    const ts = rev.createdAt;
    if (!ts) return '';
    const d = ts.toDate?ts.toDate():ts.seconds?new Date(ts.seconds*1000):null;
    if (!d) return '';
    const diff=Date.now()-d.getTime(),hrs=Math.floor(diff/3600000),days=Math.floor(diff/86400000);
    if (diff<60000) return t('time.just_now') || 'just now';
    if (hrs<1) return `${Math.floor(diff/60000)} ${t('time.min_ago') || 'min ago'}`;
    if (hrs<24) return `${hrs}${t('time.h_ago') || 'h ago'}`;
    if (days===1) return t('time.yesterday') || 'yesterday';
    if (days<7) return `${days} ${t('time.days_ago') || 'days ago'}`;
    return d.toLocaleDateString(i18n.language,{month:'short',day:'numeric',year:'numeric'});
  })();
  const firstImage = rev.images?.[0];
  const bizReplies = (rev.replies||[]).filter(r=>r.by==='business'||r.isBusinessReply);
  const hasReplies = (rev.replies||[]).length > 0;

  const handleCardClick = (e) => {
    // Don't open modal when clicking delete
    if (e.target.closest('.ud-delete-btn')) return;
    onOpenModal(rev);
  };

  return (
    <div onClick={handleCardClick}
      style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,
        padding:18,cursor:'pointer',display:'flex',flexDirection:'column',gap:9,
        transition:'box-shadow 0.18s,transform 0.18s,border-color 0.18s'}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)';e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.borderColor='var(--brand-light)';}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='';e.currentTarget.style.transform='';e.currentTarget.style.borderColor='var(--border)';}}>
      {/* Header: avatar + name + time + stars */}
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        {currentUser?.photoURL
          ? <img src={currentUser.photoURL} alt={name} style={{width:36,height:36,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
          : <div style={{width:36,height:36,borderRadius:'50%',background:color,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'0.88rem',flexShrink:0}}>{(name||'M')[0].toUpperCase()}</div>
        }
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:'0.88rem',color:'var(--text-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
            <div style={{display:'flex',gap:1,flexShrink:0}}>{[1,2,3,4,5].map(i=><span key={i} style={{fontSize:12,color:i<=(rev.rating||0)?'#e8b800':'#d1d5db'}}>★</span>)}</div>
            <span style={{fontSize:'0.72rem',color:'var(--text-4)'}}>{timeAgo}</span>
          </div>
        </div>
          <button className="ud-delete-btn" onClick={e=>{e.stopPropagation();onDelete(rev.id);}} title={t('profile.delete_review') || 'Delete review'}
          style={{marginLeft:4,background:'none',border:'none',cursor:'pointer',color:'var(--text-4)',display:'flex',padding:4,flexShrink:0}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
      {/* Comment */}
      {rev.comment && (
        <p style={{margin:0,fontSize:'0.86rem',color:'var(--text-2)',lineHeight:1.55,
          display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
          {rev.comment}
        </p>
      )}
      {/* First image */}
      {firstImage && <img src={firstImage} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:8}}/>}
      {/* Footer */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:7,marginTop:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.75rem',color:'var(--text-3)'}}>
          <div style={{width:22,height:22,borderRadius:5,background:'var(--brand-xlight)',color:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'0.7rem',flexShrink:0}}>
            {(rev.companyName||'?')[0].toUpperCase()}
          </div>
          <span style={{fontWeight:600,color:'var(--text-2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:120}}>{rev.companyName||t('profile.business')||'Business'}</span>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {bizReplies.length > 0 && <span style={{fontSize:'0.7rem',background:'#f0faf6',color:'#1f6b52',padding:'2px 8px',borderRadius:99,fontWeight:600}}>💬 {t('profile.replied') || 'Replied'}</span>}
          {hasReplies && <span style={{fontSize:'0.7rem',background:'var(--bg-2)',color:'var(--text-4)',padding:'2px 8px',borderRadius:99}}>{(rev.replies||[]).length}</span>}
          <span style={{fontSize:'0.72rem',color:'var(--brand)',fontWeight:600}}>View →</span>
        </div>
      </div>
    </div>
  );
}

function CompanyRow({ company, currentUser, onDelete, onReplyAdded, onOpenModal, t }) {
  const avgRating = company.reviews.reduce((s, r) => s + (r.rating || 0), 0) / company.reviews.length;
  const hasBusinessReplies = company.reviews.some(rev =>
    (rev.replies || []).some(r => r.by === 'business' || r.isBusinessReply)
  );

  return (
    <div className="ud-company-group" style={{marginBottom:28}}>
      {/* Company header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:10,borderBottom:'2px solid var(--border)'}}>
        <div style={{width:32,height:32,borderRadius:8,background:'var(--brand-xlight)',color:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:'0.9rem',flexShrink:0}}>
          {(company.name||'?')[0].toUpperCase()}
        </div>
        <div>
          <div style={{fontWeight:700,fontSize:'0.92rem',color:'var(--text-1)'}}>{company.name||t('profile.unknown_business')||'Unknown Business'}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:2}}>
            <div style={{display:'flex',gap:1}}>{[1,2,3,4,5].map(i=><span key={i} style={{fontSize:11,color:i<=Math.round(avgRating)?'#e8b800':'#d1d5db'}}>★</span>)}</div>
            <span style={{fontSize:'0.72rem',color:'var(--text-4)'}}>{company.reviews.length} {company.reviews.length!==1?(t('profile.reviews')||'reviews'):(t('profile.review')||'review')}</span>
            {hasBusinessReplies && <span style={{fontSize:'0.7rem',background:'#f0faf6',color:'#1f6b52',padding:'2px 8px',borderRadius:99,fontWeight:600}}>💬 {t('profile.business_replied') || 'Business replied'}</span>}
          </div>
        </div>
      </div>
      {/* Widget grid of review cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
        {company.reviews.map(rev => (
          <UserReviewCard
            key={rev.id}
            rev={rev}
            cid={company.id}
            onDelete={onDelete}
            onOpenModal={onOpenModal}
            currentUser={currentUser}
            t={t}
            i18n={i18n}
          />
        ))}
      </div>
    </div>
  );
}

export default function UserDashboard() {
  const { t, i18n } = useTranslation();
  const { user, userProfile } = useAuthStore();
  const { openModal } = useModalStore();
  const [photoUploading, setPhotoUploading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [reviewModal, setReviewModal] = useState(null); // review to show in modal
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [searchParams] = useSearchParams();
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [myReports, setMyReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  async function handleSaveProfile() {
    if (!editName.trim()) return;
    try {
      await updateProfile(user, { displayName: editName.trim() });
      await updateDoc(doc(db, 'users', user.uid), { displayName: editName.trim() }).catch(()=>{});
      showToast('Profile updated!');
      setEditProfileOpen(false);
      setTimeout(() => window.location.reload(), 600);
    } catch(e) { showToast('Update failed: ' + e.message, 'error'); }
  }

  useEffect(() => { if (user) { loadReviews(); loadMyReports(); } }, [user]);

  async function loadMyReports() {
    setReportsLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'reports'),
        where('reportedBy', '==', user.uid)
      ));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMyReports(data);
    } catch(e) { console.error(e); }
    setReportsLoading(false);
  }

  async function loadReviews() {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'reviews'),
        where('userId', '==', user.uid)
      ));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReviews(data);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function confirmDelete(id) {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'reviews', id));
      setReviews(prev => prev.filter(r => r.id !== id));
      setDeleteConfirm(null);
      showToast('Review deleted');
    } catch(e) {
      console.error(e);
      showToast('Failed to delete', 'error');
    }
    setDeleting(false);
  }

  function handleReplyAdded(reviewId, reply) {
    setReviews(prev => prev.map(r =>
      r.id === reviewId ? { ...r, replies: [...(r.replies || []), reply] } : r
    ));
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    // Guard — must be an image and under 5 MB to satisfy storage.rules
    if (!/^image\//.test(file.type || '')) {
      showToast('Please choose an image file', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image too large (max 5 MB)', 'error');
      return;
    }
    setPhotoUploading(true);
    try {
      // Sanitize extension so the storage path stays URL-safe.
      // Storage.rules uses userId-only for auth, so the filename doesn't
      // affect security — but spaces/special chars in the URL do cause
      // UX bugs (broken getDownloadURL in some SDK versions).
      const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      const rand = Math.random().toString(36).slice(2);
      const path = `profiles/${user.uid}/${Date.now()}_${rand}.${ext}`;
      const snap = await uploadBytes(
        storageRef(storage, path), file,
        { contentType: file.type || 'image/jpeg' }
      );
      const url = await getDownloadURL(snap.ref);
      await updateProfile(user, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url }).catch(() => {});
      // Update the authStore in-place so every component picks up the new
      // photoURL without needing a full page reload (which used to briefly
      // drop the user back to a signed-out view on slower networks).
      try {
        const store = useAuthStore.getState();
        store.setUser({ ...(store.user || user), photoURL: url });
        store.setUserProfile({ ...(store.userProfile || {}), photoURL: url });
      } catch {}
      showToast('Profile photo updated!');
    } catch(e) {
      console.error('Photo upload:', e);
      showToast('Upload failed: ' + (e?.message || 'unknown error'), 'error');
    }
    setPhotoUploading(false);
  }

  const displayName = user?.displayName || userProfile?.displayName || user?.email?.split('@')[0] || 'User';
  const initials = getInitials(displayName);
  const memberSince = user?.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en', { month: 'long', year: 'numeric' })
    : null;

  const reviewsByCompany = reviews.reduce((acc, rev) => {
    if (!acc[rev.companyId]) {
      acc[rev.companyId] = { name: rev.companyName, id: rev.companyId, reviews: [] };
    }
    acc[rev.companyId].reviews.push(rev);
    return acc;
  }, {});
  const companyList = Object.values(reviewsByCompany);

  // Scroll to reviews when ?tab=reviews is in URL
  useEffect(() => {
    if (searchParams.get('tab') === 'reviews' && !loading) {
      setTimeout(() => window.scrollTo({ top: 280, behavior: 'smooth' }), 100);
    }
  }, [searchParams, loading]);

  // Open specific review when ?openReview={id} is in URL (from notification click)
  useEffect(() => {
    const reviewId = searchParams.get('openReview');
    if (!reviewId || !reviews.length) return;
    const found = reviews.find(r => r.id === reviewId);
    if (found) {
      setReviewModal(found);
      setTimeout(() => window.scrollTo({ top: 280, behavior: 'smooth' }), 100);
    }
  }, [searchParams, reviews, loading]);

  return (
    <div className="user-dashboard">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="ud-hero">
        <div className="container">
          <div className="ud-hero-inner" style={{gap:24,alignItems:"center"}}>
            <div className="ud-avatar-wrap">
              {user?.photoURL
                ? <img src={user.photoURL} alt={displayName} className="ud-avatar-photo" />
                : <div className="ud-avatar-large">{initials}</div>
              }
              <label className="ud-photo-upload-btn" title="Click to add/change profile photo">
                {photoUploading ? '⏳' : '+'}
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhotoUpload} />
              </label>
            </div>
            <div className="ud-hero-info">
              <h1 className="ud-hero-name">{displayName}</h1>
              <div className="ud-hero-email">{user?.email}</div>
              {memberSince && <div className="ud-member-since">{t('profile.member_since')} {memberSince}</div>}
              <div className="ud-hero-stats">
                <div className="ud-hero-stat">
                  <div className="ud-hero-stat-num">{reviews.length}</div>
                  <div className="ud-hero-stat-label">{t('nav.my_reviews') || 'Reviews'}</div>
                </div>
                <div className="ud-stat-divider" />
                <div className="ud-hero-stat">
                  <div className="ud-hero-stat-num">{companyList.length}</div>
                  <div className="ud-hero-stat-label">{companyList.length === 1 ? (t('profile.business')||'Business') : (t('profile.businesses')||'Businesses')}</div>
                </div>
                {reviews.length > 0 && (
                  <>
                    <div className="ud-stat-divider" />
                    <div className="ud-hero-stat">
                      <div className="ud-hero-stat-num">
                        {(reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)}⭐
                      </div>
                      <div className="ud-hero-stat-label">{t('profile.avg_given') || 'Avg Given'}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="ud-hero-actions" style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end'}}>
              <button className="btn btn-outline-white" onClick={() => openModal('writeReview')}>
                ✍️ {t('review.write') || 'Write a Review'}
              </button>
              <button className="btn" style={{background:'rgba(255,255,255,0.15)',color:'white',border:'1px solid rgba(255,255,255,0.3)',fontSize:'0.82rem',padding:'6px 14px'}}
                onClick={() => { setEditName(displayName); setEditProfileOpen(true); }}>
                ✏️ {t('profile.edit_profile') || 'Edit Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="ud-section-header">
          <div>
            <h2 className="ud-section-title">
              {t('profile.reviews_tab') || 'My Reviews'}
              <span className="ud-section-count">{reviews.length}</span>
            </h2>
            <p className="ud-section-sub">
              {t('profile.click_review_desc') || 'Click any review to see full details and reply to business responses.'}
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : companyList.length === 0 ? (
          <div className="ud-empty card">
            <div className="ud-empty-icon">⭐</div>
            <h3>{t('profile.no_reviews_yet') || 'No reviews yet'}</h3>
            <p>{t('profile.no_reviews_desc') || 'Share your experience with businesses you have visited across Rwanda.'}</p>
            <button className="btn btn-primary" onClick={() => openModal('writeReview')}>
              {t('review.write') || 'Write a Review'}
            </button>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16}}>
            {reviews.slice().sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(rev => (
              <UserReviewCard
                key={rev.id}
                rev={rev}
                cid={rev.companyId}
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

      {/* ── My Reports ── */}
      <div className="container" style={{ marginTop: 40 }}>
        <div className="ud-section-header">
          <div>
            <h2 className="ud-section-title">
              My Reports
              <span className="ud-section-count">{myReports.length}</span>
            </h2>
            <p className="ud-section-sub">Reviews you have flagged for our moderation team.</p>
          </div>
        </div>

        {reportsLoading ? (
          <LoadingSpinner />
        ) : myReports.length === 0 ? (
          <div className="ud-empty card">
            <div className="ud-empty-icon">🏳️</div>
            <h3>No reports submitted</h3>
            <p>You haven't flagged any reviews yet. Use the flag icon on a review to report it.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myReports.map(report => {
              const statusColor = report.status === 'resolved'
                ? { bg: '#f0faf6', text: '#1f6b52', border: '#bbf7d0' }
                : report.status === 'dismissed'
                ? { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' }
                : { bg: '#fffbeb', text: '#92400e', border: '#fde68a' };
              const createdAt = report.createdAt?.toDate
                ? report.createdAt.toDate()
                : report.createdAt?.seconds
                ? new Date(report.createdAt.seconds * 1000)
                : null;

              return (
                <div key={report.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Business name */}
                      {report.companyName && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 4 }}>
                          📍 {report.companyName}
                        </div>
                      )}
                      {/* Review snippet */}
                      <p style={{
                        margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--text-2)',
                        lineHeight: 1.5, fontStyle: 'italic',
                        borderLeft: '3px solid var(--border)', paddingLeft: 10,
                      }}>
                        "{report.reviewSnippet || '—'}"
                      </p>
                      {/* Reason */}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                        <strong style={{ color: 'var(--text-2)' }}>Reason:</strong> {report.reason}
                        {report.comment && (
                          <span style={{ marginLeft: 6, color: 'var(--text-4)' }}>· "{report.comment}"</span>
                        )}
                      </div>
                      {createdAt && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-4)', marginTop: 4 }}>
                          Reported on {createdAt.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                    {/* Status badge */}
                    <span style={{
                      flexShrink: 0, padding: '3px 10px', borderRadius: 99,
                      fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
                      background: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}`,
                    }}>
                      {report.status || 'pending'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Detail Modal — using shared ReviewModal component */}
      {reviewModal && (
        <ReviewModal
          review={reviewModal}
          onClose={()=>setReviewModal(null)}
          mode="user"
          currentUser={user}
          reactions={{helpful:reviewModal.helpful||0,love:reviewModal.love||0,thanks:reviewModal.thanks||0}}
          onReact={null}
          companyName={reviewModal.companyName}
          onReply={async (reviewId, text) => {
            try {
              const reply = { by:'user', text, userId:user.uid,
                userName:user.displayName||user.email?.split('@')[0]||'User',
                when:new Date().toISOString(), timestamp:Date.now() };
              // Immediate modal update so reply appears instantly
              setReviewModal(prev => prev?.id===reviewId ? {...prev, replies:[...(prev.replies||[]),reply]} : prev);
              setReviews(prev => prev.map(r => r.id===reviewId ? {...r, replies:[...(r.replies||[]),reply]} : r));
              // Persist to Firestore
              await updateDoc(doc(db,'reviews',reviewId), { replies: arrayUnion(reply) });
            } catch(e) { console.error(e); }
          }}
        />
      )}

            {/* Profile Edit Modal */}
      {editProfileOpen && (
        <div className="ud-modal-overlay" onClick={e => e.target === e.currentTarget && setEditProfileOpen(false)}>
          <div className="ud-confirm-modal" style={{maxWidth:400}}>
            <h3>{t('profile.edit_profile') || 'Edit Profile'}</h3>
            <div style={{marginBottom:12}}>
              <label style={{display:'block',fontSize:'0.84rem',fontWeight:600,color:'var(--text-2)',marginBottom:6}}>{t('profile.display_name') || 'Display Name'}</label>
              <input
                className="ud-reply-textarea"
                style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',fontSize:'0.9rem',boxSizing:'border-box'}}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder={t('profile.your_display_name') || 'Your display name'}
                autoFocus
              />
            </div>
            <div style={{fontSize:'0.8rem',color:'var(--text-4)',marginBottom:16}}>
              {t('profile.photo_hint') || '📷 To change your profile photo, click the camera icon on your avatar.'}
            </div>
            <div className="ud-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setEditProfileOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveProfile} disabled={!editName.trim()}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="ud-modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="ud-confirm-modal">
            <h3>{t('profile.delete_review_confirm') || 'Delete Review?'}</h3>
            <p>{t('profile.delete_review_warning') || 'This review will be permanently removed and cannot be undone.'}</p>
            <div className="ud-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                className="btn"
                style={{ background:'#ef4444', color:'white', border:'none' }}
                onClick={() => confirmDelete(deleteConfirm)}
                disabled={deleting}
              >
                {deleting ? (t('profile.deleting') || 'Deleting…') : (t('profile.delete_review_btn') || 'Delete Review')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
