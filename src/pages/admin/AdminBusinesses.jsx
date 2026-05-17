import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable } from '../../firebase/config';
import { useLocation } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { useAdminPermissions } from '../../hooks/useAdminPermissions';
import AdminLayout from './AdminLayout';
import { getBusinessStatusBadge, getNextArchiveAction, isArchivedRecord } from '../../utils/adminModeration';
import './AdminPages.css';

const TIME_FILTERS = [
  { label:'All time', ms:null },
  { label:'5 min',   ms:5*60*1000 },
  { label:'1 hour',  ms:3600000 },
  { label:'1 week',  ms:7*86400000 },
  { label:'1 month', ms:30*86400000 },
  { label:'6 months',ms:180*86400000 },
  { label:'1 year',  ms:365*86400000 },
  { label:'5 years', ms:5*365*86400000 },
];

export default function AdminBusinesses() {
  const { t } = useTranslation();
  const { user: adminUser } = useAuthStore();
  const { can } = useAdminPermissions();
  const location = useLocation();
  const [businesses, setBusinesses] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return params.get('q') || '';
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState(TIME_FILTERS[0]);
  const [loading, setLoading] = useState(true);
  const [editBiz, setEditBiz] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [archiveBiz, setArchiveBiz] = useState(null);
  const [deleteBizItem, setDeleteBizItem] = useState(null);
  const [verifyBiz, setVerifyBiz] = useState(null);
  const [viewBiz, setViewBiz] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [featuresBiz, setFeaturesBiz] = useState(null); // business being feature-edited
  const [featuresForm, setFeaturesForm] = useState({});

  const AVAILABLE_FEATURES = [
    { id:'reply_reviews', label:'Reply to Reviews', plan:'professional', icon:'💬' },
    { id:'analytics_advanced', label:'Advanced Analytics', plan:'professional', icon:'📊' },
    { id:'qr_code', label:'QR Code Downloads', plan:'professional', icon:'📱' },
    { id:'competitor_insights', label:'Competitor Insights', plan:'professional', icon:'🏆' },
    { id:'verified_badge', label:'Verified Badge', plan:'professional', icon:'✓' },
    { id:'multi_listing', label:'Multiple Listings (up to 5)', plan:'enterprise', icon:'🏢' },
    { id:'ai_sentiment', label:'AI Sentiment Analysis', plan:'enterprise', icon:'🤖' },
    { id:'api_access', label:'API Access', plan:'enterprise', icon:'⚡' },
    { id:'white_label', label:'White-label Widgets', plan:'enterprise', icon:'🎨' },
    { id:'custom_nav', label:'Custom Navigation Menu', plan:'enterprise', icon:'🧭' },
    { id:'priority_support', label:'Priority Support', plan:'professional', icon:'🎯' },
  ];

  async function saveFeatures() {
    if (!featuresBiz) return;
    setSaving(true);
    try {
      await updateDoc(doc(db,'companies',featuresBiz.id), { enabledFeatures: featuresForm, updatedAt: serverTimestamp() });
      await addDoc(collection(db,'audit_logs'),{action:'biz_features_updated',detail:`Updated features for ${featuresBiz.companyName||featuresBiz.name}`,adminEmail:adminUser?.email,timestamp:serverTimestamp()});
      setBusinesses(prev=>prev.map(b=>b.id===featuresBiz.id?{...b,enabledFeatures:featuresForm}:b));
      setFeaturesBiz(null); showToast('Features updated');
    } catch(e) { showToast(e.message,'error'); }
    setSaving(false);
  }
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const showToast = (msg,type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); };

  useEffect(() => {
    (async () => {
      try {
        const [bizSnap, reviewSnap] = await Promise.all([
          getDocs(collection(db,'companies')),
          getDocs(collection(db,'reviews')).catch(()=>({docs:[]})),
        ]);
        // Count reviews per companyId
        const reviewCounts = {};
        reviewSnap.docs.forEach(d => {
          const cid = d.data().companyId;
          if (cid) reviewCounts[cid] = (reviewCounts[cid] || 0) + 1;
        });
        const data = bizSnap.docs.map(d => ({
          id: d.id, ...d.data(),
          totalReviews: reviewCounts[d.id] ?? d.data().totalReviews ?? 0
        }));
        data.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        setBusinesses(data); setFiltered(data);
      } catch(e){console.error(e);}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    let r=[...businesses];
    if(search){const q=search.toLowerCase();r=r.filter(b=>(b.companyName||b.name||'').toLowerCase().includes(q)||(b.category||'').toLowerCase().includes(q));}
    if(statusFilter){if(statusFilter==='verified')r=r.filter(b=>b.isVerified&&!isArchivedRecord(b));else if(statusFilter==='archived')r=r.filter(b=>isArchivedRecord(b));else if(statusFilter==='unverified')r=r.filter(b=>!b.isVerified&&!isArchivedRecord(b));else r=r.filter(b=>b.status===statusFilter);}
    if(catFilter) r=r.filter(b=>(b.category||'other')===catFilter);
    if(timeFilter.ms){const cut=Date.now()-timeFilter.ms;r=r.filter(b=>{const t=b.createdAt?.seconds?b.createdAt.seconds*1000:0;return !b.createdAt||t>=cut;});}
    setFiltered(r); setPage(1);
  }, [search, statusFilter, catFilter, timeFilter, businesses]);

  const confirmVerify = async () => {
    if (!verifyBiz) return;
    const nextVerified = !verifyBiz.isVerified;
    setSaving(true);
    try {
      await updateDoc(doc(db,'companies',verifyBiz.id),{isVerified:nextVerified});
      await addDoc(collection(db,'audit_logs'),{action:'biz_verified',detail:`${nextVerified?'Verified':'Removed verification for'} business ${verifyBiz.companyName||verifyBiz.name||verifyBiz.id}`,adminEmail:adminUser?.email,timestamp:serverTimestamp()});
      setBusinesses(prev=>prev.map(b=>b.id===verifyBiz.id?{...b,isVerified:nextVerified}:b));
      setVerifyBiz(null);
      showToast(`Business ${nextVerified?'verified':'verification removed'}`);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if(!deleteBizItem) return;
    setSaving(true);
    try {
      const deleteBusinessData = httpsCallable(functions, 'deleteBusinessData');
      await deleteBusinessData({ companyId: deleteBizItem.id });
      setBusinesses(prev=>prev.filter(b=>b.id!==deleteBizItem.id));
      setDeleteBizItem(null);
      showToast('Business and related data permanently deleted');
    } catch(e){showToast(e.message,'error');}
    setSaving(false);
  };

  const confirmArchive = async () => {
    if (!archiveBiz) return;
    const action = getNextArchiveAction(archiveBiz, 'business');
    setSaving(true);
    try {
      const update = action.nextStatus === 'archived'
        ? {
            status: 'archived',
            archivedAt: serverTimestamp(),
            archivedBy: adminUser?.email || null,
            previousStatus: archiveBiz.status || 'active',
          }
        : {
            status: archiveBiz.previousStatus && archiveBiz.previousStatus !== 'archived'
              ? archiveBiz.previousStatus
              : 'active',
            archivedAt: null,
            archivedBy: null,
            previousStatus: null,
          };
      await updateDoc(doc(db,'companies',archiveBiz.id), update);
      await addDoc(collection(db,'audit_logs'),{
        action: action.auditAction,
        detail:`${action.label}: ${archiveBiz.companyName||archiveBiz.name}`,
        adminEmail:adminUser?.email,
        timestamp:serverTimestamp()
      });
      setBusinesses(prev=>prev.map(b=>b.id===archiveBiz.id?{...b,...update}:b));
      window.dispatchEvent(new CustomEvent('irema:businessArchiveChanged', {
        detail: { companyId: archiveBiz.id, status: update.status }
      }));
      setArchiveBiz(null);
      showToast(`Business ${action.nextStatus === 'archived' ? 'archived' : 'unarchived'} successfully`);
    } catch(e){showToast(e.message,'error');}
    setSaving(false);
  };

  const saveEdit = async () => {
    if(!editBiz) return;
    setSaving(true);
    try {
      await updateDoc(doc(db,'companies',editBiz.id),editForm);
      setBusinesses(prev=>prev.map(b=>b.id===editBiz.id?{...b,...editForm}:b));
      setEditBiz(null);
      showToast('Business updated');
    } catch(e){showToast(e.message,'error');}
    setSaving(false);
  };

  const categories = [...new Set(businesses.map(b=>b.category||'other'))];
  const pageCount = Math.ceil(filtered.length/PER_PAGE);
  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const formatDate = ts => { if(!ts)return'—'; const d=ts.toDate?ts.toDate():new Date(ts.seconds*1000); return d.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}); };

  function handleExport() {
    const cols = ['companyName', 'category', 'averageRating', 'totalReviews', 'isVerified', 'country', 'phone', 'website'];
    const rows = filtered.map(item => cols.map(c => {
      const val = item[c] || '';
      return '"' + String(val).replace(/"/g, '""') + '"';
    }).join(','));
    const csv = [cols.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'businesses_export_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
    // Log export to audit
    addDoc(collection(db, 'audit_logs'), {
      action: 'export_businesses',
      detail: 'Exported ' + filtered.length + ' businesses to CSV',
      adminEmail: adminUser?.email,
      timestamp: serverTimestamp()
    }).catch(()=>{});
    showToast('Exported ' + filtered.length + ' businesses to CSV');
  }

  return (
    <AdminLayout>
      {toast && <div className={`ap-toast ap-toast-${toast.type}`}>{toast.type==='success'?'✓':'✗'} {toast.msg}</div>}

      <div className="ap-page-header">
        <h1 className="ap-page-title">{t('admin.businesses')}</h1>
        <div className="ap-header-actions">
          <button className="ap-btn ap-btn-secondary" onClick={handleExport}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3"/></svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="ap-table-wrap">
        <div className="ap-table-toolbar ap-toolbar-multi">
          <div className="ap-table-search">
            <svg className="ap-table-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder={t('admin.search_businesses')||'Search businesses…'} value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="ap-filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="verified">{t('admin.verified')||'Verified'}</option>
            <option value="unverified">{t('admin.unverified')||'Unverified'}</option>
            <option value="archived">Archived</option>
          </select>
          <select className="ap-filter-select" value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select className="ap-filter-select" value={timeFilter.label} onChange={e=>setTimeFilter(TIME_FILTERS.find(t=>t.label===e.target.value))}>
            {TIME_FILTERS.map(t=><option key={t.label}>{t.label}</option>)}
          </select>
          <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={()=>{setSearch('');setStatusFilter('');setCatFilter('');setTimeFilter(TIME_FILTERS[0]);}}>↺ Reset</button>
          <span className="ap-count-badge">{filtered.length} businesses</span>
        </div>

        <table className="ap-table">
          <thead><tr><th>Business</th><th>Owner</th><th>{t('admin.category')||'Category'}</th><th>{t('admin.avg_rating')||'Rating'}</th><th>Reviews</th><th>{t('admin.status')||'Status'}</th><th style={{textAlign:'right'}}>{t('admin.actions')||'Actions'}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className="ap-loading-cell"><div className="ap-spinner"/></td></tr>
            : paginated.length===0 ? <tr><td colSpan="7" className="ap-empty">No businesses match your filters</td></tr>
            : paginated.map(biz=>{
              const name=biz.companyName||biz.name||'Business';
              const statusBadge = getBusinessStatusBadge(biz);
              return (
                <tr key={biz.id} className={`ap-tr-hover${isArchivedRecord(biz) ? ' ap-row-inactive' : ''}`}>
                  <td>
                    <div className="ap-user-cell">
                      <div className="ap-avatar" style={{background:'linear-gradient(135deg,var(--info),#0ea5e9)'}}>{name[0].toUpperCase()}</div>
                      <div>
                        <div className="ap-user-info-name">{name}</div>
                        <div className="ap-user-info-sub">{biz.country||biz.city||'—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{fontSize:'0.78rem'}}>
                    <div style={{color:'var(--text-2)',fontWeight:500}}>{biz.adminEmail||biz.workEmail||biz.email||'—'}</div>
                    {biz.adminUserId && <div style={{fontSize:'0.68rem',color:'var(--text-4)'}}>UID: {biz.adminUserId.slice(0,8)}…</div>}
                  </td>
                  <td><span className="ap-badge gray">{biz.category||'—'}</span></td>
                  <td style={{fontWeight:700,color:biz.averageRating>=4?'var(--success)':'var(--text-2)'}}>{biz.averageRating?biz.averageRating.toFixed(1):'—'}</td>
                  <td className="ap-td-date">{biz.totalReviews||0}</td>
                  <td><span className={`ap-badge ${statusBadge.className}`}>{statusBadge.label}</span></td>
                  <td>
                    <div className="ap-row-actions" style={{justifyContent:'flex-end'}}>
                      <button className="ap-icon-action-btn" title="View" onClick={()=>setViewBiz(biz)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button className="ap-icon-action-btn" title="Manage Features" onClick={()=>{setFeaturesBiz(biz);setFeaturesForm(biz.enabledFeatures||{});}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                      </button>
                      <button className="ap-icon-action-btn" title="Edit" onClick={()=>{setEditBiz(biz);setEditForm({companyName:biz.companyName||biz.name||'',category:biz.category||'',description:biz.description||'',phone:biz.phone||'',website:biz.website||'',address:biz.address||''});}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      {can('verify_businesses') && (
                        <button className={`ap-icon-action-btn ${biz.isVerified?'warning':'success'}`} title={biz.isVerified?'Remove verification':'Verify'} onClick={()=>setVerifyBiz(biz)}>
                          {biz.isVerified
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          }
                        </button>
                      )}
                      {can('delete_businesses') && (
                      <button className={`ap-icon-action-btn ${isArchivedRecord(biz) ? 'success' : 'warning'}`} title={isArchivedRecord(biz) ? 'Unarchive' : 'Archive'} onClick={()=>setArchiveBiz(biz)}>
                        {isArchivedRecord(biz)
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18"/><path d="M5 7v13h14V7"/><path d="M9 11l3 3 3-3"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/></svg>
                        }
                      </button>
                      )}
                      {can('delete_businesses') && (
                      <button className="ap-icon-action-btn danger" title="Permanently delete" onClick={()=>setDeleteBizItem(biz)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="ap-table-footer">
          <span>Showing {Math.min((page-1)*PER_PAGE+1,filtered.length)}–{Math.min(page*PER_PAGE,filtered.length)} of {filtered.length}</span>
          {pageCount>1&&<div className="ap-pagination"><button className="ap-page-btn" disabled={page===1} onClick={()=>setPage(p=>p-1)}>‹</button>{Array.from({length:Math.min(pageCount,7)},(_,i)=>{let p=i+1;return <button key={p} className={`ap-page-btn${page===p?' active':''}`} onClick={()=>setPage(p)}>{p}</button>;})} <button className="ap-page-btn" disabled={page===pageCount} onClick={()=>setPage(p=>p+1)}>›</button></div>}
        </div>
      </div>

      {/* View Modal */}
      {viewBiz && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewBiz(null)}>
          <div className="ap-modal">
            <div className="ap-modal-header"><h3>Business Details</h3><button className="ap-modal-close" onClick={()=>setViewBiz(null)}>✕</button></div>
            <div className="ap-view-user-hero">
              <div className="ap-view-avatar" style={{background:'linear-gradient(135deg,var(--info),#0ea5e9)'}}>{(viewBiz.companyName||viewBiz.name||'B')[0].toUpperCase()}</div>
              <div>
                <div className="ap-view-name">{viewBiz.companyName||viewBiz.name}</div>
                <div className="ap-view-email">{viewBiz.email||'No email'}</div>
                <div style={{display:'flex',gap:4,marginTop:6,flexWrap:'wrap'}}>
                  <span className="ap-badge gray">{viewBiz.category||'other'}</span>
                  <span className={`ap-badge ${getBusinessStatusBadge(viewBiz).className}`}>{getBusinessStatusBadge(viewBiz).label}</span>
                </div>
              </div>
            </div>
            <div className="ap-view-grid">
              <div className="ap-view-stat"><span>{t('admin.avg_rating')||'Rating'}</span><strong>{viewBiz.averageRating?.toFixed(1)||'—'}</strong></div>
              <div className="ap-view-stat"><span>Reviews</span><strong>{viewBiz.totalReviews||0}</strong></div>
              <div className="ap-view-stat"><span>Country</span><strong>{viewBiz.country||'—'}</strong></div>
              <div className="ap-view-stat"><span>Phone</span><strong>{viewBiz.phone||'—'}</strong></div>
              <div className="ap-view-stat" style={{gridColumn:'1/-1'}}><span>Description</span><strong style={{fontWeight:400,fontSize:'0.82rem'}}>{viewBiz.description||'—'}</strong></div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setViewBiz(null)}>Close</button>
              <button className="ap-btn ap-btn-primary" onClick={()=>{setViewBiz(null);setEditBiz(viewBiz);setEditForm({companyName:viewBiz.companyName||viewBiz.name||'',category:viewBiz.category||'',description:viewBiz.description||'',phone:viewBiz.phone||'',website:viewBiz.website||'',address:viewBiz.address||''});}}>Edit Business</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editBiz && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditBiz(null)}>
          <div className="ap-modal">
            <div className="ap-modal-header"><h3>Edit Business</h3><button className="ap-modal-close" onClick={()=>setEditBiz(null)}>✕</button></div>
            <div className="ap-field-row">
              <div className="ap-field"><label>Business Name</label><input className="ap-input" value={editForm.companyName} onChange={e=>setEditForm(f=>({...f,companyName:e.target.value}))}/></div>
              <div className="ap-field"><label>{t('admin.category')||'Category'}</label><input className="ap-input" value={editForm.category} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))}/></div>
            </div>
            <div className="ap-field"><label>Description</label><textarea className="ap-input" rows={3} value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))}/></div>
            <div className="ap-field-row">
              <div className="ap-field"><label>Phone</label><input className="ap-input" value={editForm.phone} onChange={e=>setEditForm(f=>({...f,phone:e.target.value}))}/></div>
              <div className="ap-field"><label>Website</label><input className="ap-input" value={editForm.website} onChange={e=>setEditForm(f=>({...f,website:e.target.value}))}/></div>
            </div>
            <div className="ap-field"><label>Address</label><input className="ap-input" value={editForm.address} onChange={e=>setEditForm(f=>({...f,address:e.target.value}))}/></div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setEditBiz(null)}>{t('admin.cancel')||'Cancel'}</button>
              <button className="ap-btn ap-btn-primary" onClick={saveEdit} disabled={saving}>{saving?'Saving…':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {archiveBiz && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setArchiveBiz(null)}>
          <div className="ap-modal ap-modal-sm">
            <div className="ap-modal-header"><h3>{getNextArchiveAction(archiveBiz, 'business').label}</h3><button className="ap-modal-close" onClick={()=>setArchiveBiz(null)}>✕</button></div>
            <div className="ap-danger-box">
              <div className="ap-danger-icon">⚠️</div>
              <div>
                <strong>{isArchivedRecord(archiveBiz) ? 'Restore this business?' : 'Archive this business?'}</strong>
                <p>
                  {isArchivedRecord(archiveBiz)
                    ? <>Unarchiving <strong>{archiveBiz.companyName||archiveBiz.name}</strong> makes it visible on the platform again.</>
                    : <>Archiving <strong>{archiveBiz.companyName||archiveBiz.name}</strong> hides it from the public platform while preserving reviews, subscriptions, and business data for restoration.</>
                  }
                </p>
              </div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setArchiveBiz(null)}>{t('admin.cancel')||'Cancel'}</button>
              <button className={isArchivedRecord(archiveBiz) ? 'ap-btn ap-btn-success' : 'ap-btn ap-btn-danger'} onClick={confirmArchive} disabled={saving}>
                {saving ? getNextArchiveAction(archiveBiz, 'business').progressLabel : getNextArchiveAction(archiveBiz, 'business').label}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal */}
      {verifyBiz && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setVerifyBiz(null)}>
          <div className="ap-modal ap-modal-sm">
            <div className="ap-modal-header"><h3>{verifyBiz.isVerified ? 'Remove Verification' : 'Verify Business'}</h3><button className="ap-modal-close" onClick={()=>setVerifyBiz(null)}>✕</button></div>
            <div className="ap-danger-box">
              <div className="ap-danger-icon">⚠️</div>
              <div>
                <strong>{verifyBiz.isVerified ? 'Remove verified status?' : 'Confirm business verification?'}</strong>
                <p>
                  {verifyBiz.isVerified
                    ? <>This will remove the verified badge from <strong>{verifyBiz.companyName||verifyBiz.name}</strong> across the platform.</>
                    : <>This will mark <strong>{verifyBiz.companyName||verifyBiz.name}</strong> as verified and show the verified badge publicly.</>
                  }
                </p>
              </div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setVerifyBiz(null)}>{t('admin.cancel')||'Cancel'}</button>
              <button className={verifyBiz.isVerified ? 'ap-btn ap-btn-danger' : 'ap-btn ap-btn-success'} onClick={confirmVerify} disabled={saving}>
                {saving ? 'Saving...' : verifyBiz.isVerified ? 'Remove Verification' : 'Verify Business'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteBizItem && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setDeleteBizItem(null)}>
          <div className="ap-modal ap-modal-sm">
            <div className="ap-modal-header"><h3>Permanently Delete Business</h3><button className="ap-modal-close" onClick={()=>setDeleteBizItem(null)}>✕</button></div>
            <div className="ap-danger-box">
              <div className="ap-danger-icon">⚠️</div>
              <div><strong>This action cannot be undone</strong><p>Deleting <strong>{deleteBizItem.companyName||deleteBizItem.name}</strong> permanently removes the business, reviews, products, stories, claims, notifications, subscriptions, payments, and analytics snapshots. Use Archive when you only want to hide it.</p></div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setDeleteBizItem(null)}>{t('admin.cancel')||'Cancel'}</button>
              <button className="ap-btn ap-btn-danger" onClick={confirmDelete} disabled={saving}>{saving?'Deleting...':'Delete Permanently'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Features Modal — Fix 16: Admin assigns subscription nav features */}
      {featuresBiz && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setFeaturesBiz(null)}>
          <div className="ap-modal" style={{maxWidth:520}}>
            <div className="ap-modal-header">
              <h3>⚙️ Manage Features — {featuresBiz.companyName||featuresBiz.name}</h3>
              <button className="ap-modal-close" onClick={()=>setFeaturesBiz(null)}>✕</button>
            </div>
            <p style={{fontSize:'0.84rem',color:'var(--text-3)',marginBottom:16}}>
              Enable or disable features for this business. Features are tied to their subscription plan but can be manually overridden here.
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {AVAILABLE_FEATURES.map(f=>(
                <label key={f.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',cursor:'pointer',background:featuresForm[f.id]?'var(--brand-xlight)':'white',transition:'all 0.15s'}}>
                  <input type="checkbox" checked={!!featuresForm[f.id]} onChange={e=>setFeaturesForm(prev=>({...prev,[f.id]:e.target.checked}))} style={{width:16,height:16,accentColor:'var(--brand)'}}/>
                  <span style={{fontSize:'1.1rem'}}>{f.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:'0.88rem',color:'var(--text-1)'}}>{f.label}</div>
                    <div style={{fontSize:'0.72rem',color:'var(--text-4)',textTransform:'capitalize'}}>{f.plan} plan feature</div>
                  </div>
                  {featuresForm[f.id] && <span style={{fontSize:'0.7rem',fontWeight:700,color:'var(--brand)',background:'var(--brand-xlight)',padding:'2px 8px',borderRadius:99}}>Enabled</span>}
                </label>
              ))}
            </div>
            <div className="ap-modal-actions" style={{marginTop:20}}>
              <button className="ap-btn ap-btn-secondary" onClick={()=>setFeaturesBiz(null)}>Cancel</button>
              <button className="ap-btn ap-btn-primary" onClick={saveFeatures} disabled={saving}>{saving?'Saving…':'Save Features'}</button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
