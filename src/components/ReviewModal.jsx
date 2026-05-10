import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import StarRating from './StarRating';
import { formatRelativeTime } from '../utils/helpers';
import { validateReplyText } from '../utils/reviewLimits';

const AVATAR_COLORS = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6'];
const avatarColor = name => AVATAR_COLORS[(name||'A').charCodeAt(0) % AVATAR_COLORS.length];
const getInitials = name => name?.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';

/* ── Small role icon chips ── */
function RoleChip({ by, isBusinessReply, isAdminComment }) {
  if (by === 'business' || isBusinessReply) {
    return (
      <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:'0.68rem',fontWeight:700,
        background:'rgba(45,143,111,0.15)',color:'var(--brand,#2d8f6f)',border:'1px solid rgba(45,143,111,0.3)',borderRadius:99,padding:'2px 8px',flexShrink:0}}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Business
      </span>
    );
  }
  if (by === 'admin' || isAdminComment) {
    return (
      <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:'0.68rem',fontWeight:700,
        background:'rgba(239,68,68,0.15)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.3)',borderRadius:99,padding:'2px 8px',flexShrink:0}}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Admin
      </span>
    );
  }
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:'0.68rem',fontWeight:700,
      background:'var(--bg-2,#f3f4f6)',color:'var(--text-3,#6b7280)',border:'1px solid var(--border,#e5e7eb)',borderRadius:99,padding:'2px 8px',flexShrink:0}}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      User
    </span>
  );
}

/* ── Individual reply row ── */
function ReplyRow({ r, isLast }) {
  const timeStr = r.when
    ? formatRelativeTime({ seconds: Math.floor(new Date(r.when).getTime() / 1000) })
    : r.timestamp
    ? formatRelativeTime({ seconds: Math.floor(r.timestamp / 1000) })
    : '';
  const authorName = r.userName || (r.by === 'business' ? 'Business' : r.by === 'admin' ? 'Admin' : 'User');

  return (
    <div style={{
      display:'flex', gap:10, padding:'10px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border, #f3f4f6)',
    }}>
      {/* Small avatar */}
      <div style={{
        width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex',
        alignItems:'center', justifyContent:'center', fontSize:'0.68rem', fontWeight:700, color:'white',
        background: r.by==='business'||r.isBusinessReply ? '#2d8f6f' : r.by==='admin'||r.isAdminComment ? '#ef4444' : avatarColor(authorName),
      }}>
        {getInitials(authorName)}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:3}}>
          <span style={{fontWeight:700,fontSize:'0.8rem',color:'var(--text-1,#111827)'}}>{authorName}</span>
          <RoleChip by={r.by} isBusinessReply={r.isBusinessReply} isAdminComment={r.isAdminComment}/>
          {timeStr && <span style={{fontSize:'0.68rem',color:'var(--text-4,#9ca3af)'}}>{timeStr}</span>}
        </div>
        <p style={{margin:0,fontSize:'0.85rem',color:'var(--text-2,#374151)',lineHeight:1.5}}>{r.text||r.content}</p>
      </div>
    </div>
  );
}

export default function ReviewModal({
  review, onClose, mode='user', currentUser,
  onReply, onDelete, reactions, onReact, companyName
}) {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [delConfirm, setDelConfirm] = useState(false);
  const [replyError, setReplyError] = useState('');

  if (!review) return null;

  const name = review.userName || review.userEmail?.split('@')[0] || 'Anonymous';
  const color = avatarColor(name);

  // All replies sorted by time, chronologically
  const allReplies = [...(review.replies||[])].sort((a,b) => {
    const ta = a.when ? new Date(a.when).getTime() : (a.timestamp||0);
    const tb = b.when ? new Date(b.when).getTime() : (b.timestamp||0);
    return ta - tb;
  });

  const send = async () => {
    if (!onReply) return;
    const validation = validateReplyText(replyText);
    if (!validation.ok) {
      setReplyError(validation.message);
      return;
    }
    setSending(true);
    try {
      await onReply(review.id, replyText.trim(), mode);
      setReplyText('');
      setReplyError('');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setSending(true);
    await onDelete(review.id);
    setSending(false);
    setDelConfirm(false);
    onClose();
  };

  const modalContent = (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',
          zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center',cursor:'zoom-out'}}>
          <img src={lightbox} alt="" style={{maxWidth:'92vw',maxHeight:'90vh',borderRadius:10,objectFit:'contain'}}/>
          <button onClick={()=>setLightbox(null)} style={{position:'absolute',top:18,right:18,
            background:'rgba(255,255,255,0.15)',border:'none',color:'white',width:38,height:38,
            borderRadius:'50%',fontSize:'1.1rem',cursor:'pointer'}}>✕</button>
        </div>
      )}

      {/* Delete confirm */}
      {delConfirm && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:10001,
          display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--surface,white)',border:'1px solid var(--border,#e5e7eb)',borderRadius:16,padding:28,maxWidth:380,width:'92vw',
            boxShadow:'0 24px 64px rgba(0,0,0,0.4)'}}>
            <h3 style={{margin:'0 0 8px',color:'var(--text-1,#111827)'}}>Delete this review?</h3>
            <p style={{color:'var(--text-3,#6b7280)',fontSize:'0.88rem',margin:'0 0 20px'}}>
              This action cannot be undone. The review will be permanently removed.
            </p>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setDelConfirm(false)} style={{padding:'9px 18px',borderRadius:8,
                border:'1px solid var(--border,#e5e7eb)',background:'var(--bg-2,white)',color:'var(--text-1,#111827)',cursor:'pointer',fontWeight:600,fontSize:'0.88rem'}}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={sending} style={{padding:'9px 18px',borderRadius:8,
                border:'none',background:'#ef4444',color:'white',cursor:'pointer',fontWeight:700,fontSize:'0.88rem'}}>
                {sending?'Deleting…':'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main overlay */}
      <div className="review-modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div className="review-modal">

          {/* ── Header: avatar / name / date / stars / close ── */}
          <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:16,paddingRight:80}}>
            {review.userPhotoURL
              ? <img src={review.userPhotoURL} alt={name} className="rm-avatar" style={{objectFit:'cover'}}/>
              : <div className="rm-avatar" style={{background:color}}>{getInitials(name)}</div>
            }
            <div style={{flex:1,minWidth:0}}>
              <div className="rm-name">{name}</div>
              <div className="rm-date">{formatRelativeTime(review.createdAt)}</div>
            </div>
            <StarRating rating={review.rating} size={16}/>
          </div>

          {/* Close button — top right */}
          <button className="review-modal-close" onClick={onClose}>✕</button>

          {/* Delete button — only admin, below close */}
          {mode==='admin' && onDelete && (
            <button onClick={()=>setDelConfirm(true)} title="Delete review"
              style={{position:'absolute',top:50,right:14,width:28,height:28,borderRadius:'50%',
                border:'1px solid #fecaca',background:'#fff5f5',color:'#ef4444',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          )}

          {/* Comment */}
          {review.comment && <div className="rm-comment">{review.comment}</div>}

          {/* Images */}
          {review.images?.length > 0 && (
            <div className="rm-images">
              {review.images.map((src,i)=>(
                <img key={i} src={src} alt={`photo ${i+1}`} className="rm-image"
                  style={{cursor:'zoom-in'}} onClick={()=>setLightbox(src)}/>
              ))}
            </div>
          )}

          {/* Reactions */}
          {reactions && (
            <div className="rm-reactions">
              {[
                ['helpful', <svg key="h" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>, 'Helpful', reactions.helpful||0],
                ['thanks', <svg key="t" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, 'Thanks', reactions.thanks||0],
                ['love', <svg key="l" width="14" height="14" viewBox="0 0 24 24" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>, 'Love', reactions.love||0],
              ].map(([type,icon,label,count])=>(
                <button key={type} className="rm-react-btn"
                  onClick={()=>mode!=='admin'&&onReact&&onReact(type)}
                  style={{cursor:mode==='admin'?'default':'pointer',opacity:mode==='admin'?0.7:1}}>
                  {icon} {label} {count>0&&<span className="rm-react-count">{count}</span>}
                </button>
              ))}
            </div>
          )}

          {/* ── All replies — chronological with role chips + timestamps ── */}
          {allReplies.length > 0 && (
            <div style={{borderTop:'1px solid var(--border,#f3f4f6)',paddingTop:14,marginBottom:4}}>
              <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-4,#9ca3af)',textTransform:'uppercase',
                letterSpacing:'0.07em',marginBottom:8}}>
                {allReplies.length} {allReplies.length===1?'Response':'Responses'}
              </div>
              {allReplies.map((r,i)=>(
                <ReplyRow key={i} r={r} isLast={i===allReplies.length-1}/>
              ))}
            </div>
          )}

          {/* ── Reply input ── */}
          {currentUser && onReply && (
            <div className="rm-reply-form">
              <div className="rm-reply-label">
                {mode==='admin'
                  ? <><span style={{color:'#ef4444'}}>🛡</span> Add Admin Note</>
                  : mode==='business'
                  ? <><span style={{color:'#2d8f6f'}}>🏢</span> Reply as Business Owner</>
                  : <>💬 Add a Comment</>
                }
              </div>
              <div className="rm-reply-row">
                <input
                  className="input rm-reply-input"
                  placeholder={
                    mode==='admin' ? 'Write an official admin note…'
                    : mode==='business' ? 'Write your business response…'
                    : 'Write a comment…'
                  }
                  value={replyText}
                  onChange={e=>{
                    const next = e.target.value;
                    setReplyText(next);
                    setReplyError(next.length > 1000 ? 'Replies can be at most 1000 characters.' : '');
                  }}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
                />
                <button
                  className={`btn btn-sm ${mode==='user'?'btn-outline':'btn-primary'}`}
                  onClick={send}
                  disabled={sending||!replyText.trim()||replyText.length > 1000}
                >
                  {sending?'…':'Reply'}
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
    </>
  );

  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(modalContent, document.body);
}
