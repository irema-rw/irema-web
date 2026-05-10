import React, { useState } from 'react';
import { db, collection, addDoc, serverTimestamp, query, where, getDocs } from '../firebase/config';
import { useAuthStore } from '../store/authStore';

const REASONS = [
  'Spam or fake review',
  'Offensive or abusive content',
  'Irrelevant to this business',
  'Conflict of interest',
  'Privacy violation',
  'Other',
];

export default function ReportReviewModal({ review, company, onClose, onSuccess }) {
  const { user } = useAuthStore();
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason) { setError('Please select a reason.'); return; }
    if (!user) return;
    setSubmitting(true);
    setError('');
    try {
      // Guard: one report per user per review
      const existing = await getDocs(
        query(collection(db, 'reports'),
          where('reviewId', '==', review.id),
          where('reportedBy', '==', user.uid)
        )
      );
      if (!existing.empty) {
        setError('You have already reported this review.');
        setSubmitting(false);
        return;
      }

      await addDoc(collection(db, 'reports'), {
        targetType: 'review',
        reviewId: review.id,
        companyId: company?.id || review.companyId || '',
        companyName: company?.companyName || company?.name || '',
        reviewSnippet: (review.comment || '').slice(0, 200),
        reviewerName: review.userName || 'Anonymous',
        reviewRating: review.rating || 0,
        reportedBy: user.uid,
        reporterEmail: user.email || '',
        reason,
        comment: comment.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      onSuccess(review.id);
    } catch (e) {
      console.error(e);
      setError('Failed to submit report. Please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'slideUp 0.22s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-1)' }}>Report Review</h3>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* Review snippet */}
        <div style={{
          margin: '16px 20px 0', padding: '12px 14px',
          background: 'var(--surface-2)', borderRadius: 10,
          borderLeft: '3px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 4 }}>
            Review by <strong>{review.userName || 'Anonymous'}</strong>
            {' · '}{'★'.repeat(review.rating || 0)}
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
            {(review.comment || '').slice(0, 120)}{(review.comment || '').length > 120 ? '…' : ''}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px 20px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
            Reason <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-1)', fontSize: '0.88rem', marginBottom: 14,
              outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">Select a reason…</option>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
            Additional details <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Provide any additional context…"
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-1)', fontSize: '0.88rem', resize: 'vertical',
              fontFamily: 'inherit', marginBottom: 4, boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-4)', textAlign: 'right', marginBottom: 14 }}>
            {comment.length}/500
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '10px 12px', fontSize: '0.83rem', color: '#dc2626', marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-2)', fontSize: '0.88rem',
              cursor: 'pointer', fontWeight: 600,
            }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !reason} style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: submitting || !reason ? '#fca5a5' : '#ef4444',
              color: 'white', fontSize: '0.88rem', cursor: submitting || !reason ? 'not-allowed' : 'pointer',
              fontWeight: 600, transition: 'background 0.15s',
            }}>
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
