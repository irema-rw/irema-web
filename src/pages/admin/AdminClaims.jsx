import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, getDocs, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import AdminLayout from './AdminLayout';
import './AdminPages.css';

const TABS = ['all', 'pending', 'approved', 'rejected'];

export default function AdminClaims() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [viewClaim, setViewClaim] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [claimsSnap, companiesSnap] = await Promise.all([
          getDocs(collection(db, 'claims')),
          getDocs(collection(db, 'companies')).catch(()=>({docs:[]})),
        ]);
        const bizMap = {};
        companiesSnap.docs.forEach(d => {
          bizMap[d.id] = d.data().companyName || d.data().name || d.id;
        });
        const data = claimsSnap.docs.map(d => ({
          id: d.id, ...d.data(),
          // Resolve company name from companies collection
          businessName: d.data().companyName || bizMap[d.data().companyId] || d.data().companyId || '—',
        }));
        setClaims(data);
      } catch(e){ console.error(e); }
      setLoading(false);
    })();
  }, []);

  async function updateStatus(id, status) {
    const claim = claims.find(c => c.id === id);
    await updateDoc(doc(db, 'claims', id), { status, resolvedAt: new Date(), resolvedBy: user?.email });

    // Transfer ownership on approval
    if (status === 'approved' && claim?.companyId && claim?.claimantUserId) {
      try {
        await updateDoc(doc(db, 'companies', claim.companyId), {
          adminUserId: claim.claimantUserId,
          adminEmail: claim.claimantEmail,
          status: 'active',
          updatedAt: new Date(),
        });
      } catch(e) { console.error('Ownership transfer failed:', e); }
    }

    // In-app notification to claimant
    if (claim?.claimantUserId) {
      const isApproved = status === 'approved';
      try {
        await addDoc(collection(db, 'notifications'), {
          targetUserId: claim.claimantUserId,
          type: isApproved ? 'claim_approved' : 'claim_rejected',
          title: isApproved ? '🎉 Claim Approved' : 'Claim Not Approved',
          message: isApproved
            ? `Your ownership claim for ${claim.businessName || 'your business'} has been approved. You can now access your business dashboard.`
            : `Your ownership claim for ${claim.businessName || 'your business'} could not be approved at this time. Please contact support for more information.`,
          companyId: claim.companyId || null,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch(e) { console.error('Failed to send claim notification:', e); }

      // Clean up pendingClaimId on rejection
      if (status === 'rejected') {
        try {
          await updateDoc(doc(db, 'users', claim.claimantUserId), { pendingClaimId: null });
        } catch(e) { console.error('Failed to clear pendingClaimId:', e); }
      }
    }

    setClaims(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    try {
      await addDoc(collection(db, 'audit_logs'), {
        action: `claim_${status}`,
        detail: `Claim ${id} ${status} — ${claim?.businessName || id}`,
        adminEmail: user?.email,
        adminId: user?.uid,
        timestamp: serverTimestamp(),
      });
    } catch(e) {}
  }

  const formatDate = ts => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts.seconds*1000);
    return d.toLocaleDateString();
  };

  const filtered = claims.filter(c => {
    const matchTab = activeTab === 'all' || (c.status || 'pending') === activeTab;
    const matchSearch = !search || (c.businessName||'').toLowerCase().includes(search.toLowerCase()) || (c.claimantName||'').toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const counts = { all: claims.length, pending: claims.filter(c=>!c.status||c.status==='pending').length, approved: claims.filter(c=>c.status==='approved').length, rejected: claims.filter(c=>c.status==='rejected').length };

  return (
    <AdminLayout>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Business Claims</h1>
        <span className="ap-count-badge">{counts.pending} pending</span>
      </div>

      {/* Status tabs */}
      <div className="ap-status-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`ap-status-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className={`ap-tab-count ${tab === 'pending' ? 'yellow' : tab === 'approved' ? 'green' : tab === 'rejected' ? 'red' : ''}`}>
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      <div className="ap-table-wrap">
        <div className="ap-table-toolbar">
          <div className="ap-table-search">
            <svg className="ap-table-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder={t('admin.search_claims')||'Search claims…'} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="ap-count-badge">{filtered.length} claims</span>
        </div>

        <table className="ap-table">
          <thead><tr><th>{t('admin.business')||'Business'}</th><th>{t('admin.claimant')||'Claimant'}</th><th>Email / Phone</th><th>{t('admin.date')||'Date'}</th><th>{t('admin.status')||'Status'}</th><th>{t('admin.actions')||'Actions'}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="ap-loading-cell">Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan="6" className="ap-empty">No claims in this category</td></tr>
            : filtered.map(c => (
              <tr key={c.id}>
                <td className="ap-td-bold">{c.businessName || c.companyId || '—'}</td>
                <td style={{ fontSize:'0.82rem' }}><div style={{fontWeight:600}}>{c.claimantName || '—'}</div>{c.claimantRole && <div style={{fontSize:'0.72rem',color:'var(--text-4)'}}>{c.claimantRole}</div>}</td>
                <td style={{ fontSize:'0.78rem', color:'var(--muted)' }}><div>{c.claimantEmail || c.email || '—'}</div>{c.claimantPhone && <div style={{fontSize:'0.72rem',color:'var(--text-4)'}}>{c.claimantPhone}</div>}</td>
                <td className="ap-td-date">{formatDate(c.createdAt || c.submittedAt)}</td>
                <td>
                  <span className={`ap-badge ${(c.status||'pending')==='approved'?'green':(c.status==='rejected'?'red':'yellow')}`}>
                    {c.status || 'pending'}
                  </span>
                </td>
                <td>
                  <div className="ap-row-actions">
                    <button className="ap-icon-action-btn" title="View details" onClick={()=>setViewClaim(c)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    {(c.status === 'pending' || !c.status) && <>
                      <button className="ap-btn ap-btn-primary ap-btn-sm" onClick={() => updateStatus(c.id,'approved')}>{t('admin.approve')||'Approve'}</button>
                      <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={() => updateStatus(c.id,'rejected')}>{t('admin.reject')||'Reject'}</button>
                    </>}
                    {c.status === 'approved' && (
                      <button className="ap-btn ap-btn-secondary ap-btn-sm" onClick={() => updateStatus(c.id,'rejected')}>Revoke</button>
                    )}
                    {c.status === 'rejected' && (
                      <button className="ap-btn ap-btn-primary ap-btn-sm" onClick={() => updateStatus(c.id,'approved')}>Re-approve</button>
                    )}
                    {c.resolvedBy && <span className="ap-resolved-by">by {c.resolvedBy}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ap-table-footer">
          <span>Showing {filtered.length} of {claims.length} claims</span>
        </div>
      </div>
      {/* Claim Detail Modal */}
      {viewClaim && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewClaim(null)}>
          <div className="ap-modal" style={{maxWidth:520}}>
            <div className="ap-modal-header">
              <h3>📋 Claim Details</h3>
              <button className="ap-modal-close" onClick={()=>setViewClaim(null)}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div style={{gridColumn:'1/-1',padding:'12px 16px',background:'var(--brand-xlight)',borderRadius:10,border:'1px solid var(--brand-light)'}}>
                <div style={{fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',color:'var(--brand)',letterSpacing:'0.06em',marginBottom:4}}>Business</div>
                <div style={{fontWeight:700,fontSize:'1rem',color:'var(--text-1)'}}>{viewClaim.businessName}</div>
                <div style={{fontSize:'0.75rem',color:'var(--text-4)',marginTop:2}}>ID: {viewClaim.companyId}</div>
                <div style={{marginTop:6}}>
                  <span className={`ap-badge ${viewClaim.alreadyClaimed?'yellow':'green'}`}>
                    {viewClaim.alreadyClaimed?'Already had an owner — transfer requested':'Previously unclaimed'}
                  </span>
                </div>
              </div>
              <div className="ap-view-stat"><span>Claimant Name</span><strong>{viewClaim.claimantName||'—'}</strong></div>
              <div className="ap-view-stat"><span>Email</span><strong style={{fontSize:'0.82rem'}}>{viewClaim.claimantEmail||'—'}</strong></div>
              <div className="ap-view-stat"><span>Phone</span><strong>{viewClaim.claimantPhone||'—'}</strong></div>
              <div className="ap-view-stat"><span>Role / Title</span><strong>{viewClaim.claimantRole||'—'}</strong></div>
              <div className="ap-view-stat"><span>Submitted</span><strong>{viewClaim.createdAt?.seconds?new Date(viewClaim.createdAt.seconds*1000).toLocaleDateString('en',{month:'long',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</strong></div>
              <div className="ap-view-stat"><span>Current Status</span><strong><span className={`ap-badge ${viewClaim.status==='approved'?'green':viewClaim.status==='rejected'?'red':'yellow'}`}>{viewClaim.status||'pending'}</span></strong></div>
              {viewClaim.resolvedBy && (
                <div className="ap-view-stat" style={{gridColumn:'1/-1'}}><span>Resolved By</span><strong>{viewClaim.resolvedBy}</strong></div>
              )}
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setViewClaim(null)}>Close</button>
              {(viewClaim.status==='pending'||!viewClaim.status) && <>
                <button className="ap-btn ap-btn-danger" onClick={()=>{updateStatus(viewClaim.id,'rejected');setViewClaim(null);}}>Reject</button>
                <button className="ap-btn ap-btn-primary" onClick={()=>{updateStatus(viewClaim.id,'approved');setViewClaim(null);}}>✓ Approve & Transfer</button>
              </>}
              {viewClaim.status==='approved' && (
                <button className="ap-btn ap-btn-secondary" onClick={()=>{updateStatus(viewClaim.id,'rejected');setViewClaim(null);}}>Revoke</button>
              )}
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
