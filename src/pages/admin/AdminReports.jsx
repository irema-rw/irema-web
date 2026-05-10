import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import AdminLayout from './AdminLayout';
import './AdminPages.css';

const TIME_FILTERS = [
  { label:'All time', ms:null },
  { label:'5 min',   ms:5*60*1000 },
  { label:'1 hour',  ms:3600000 },
  { label:'1 week',  ms:7*86400000 },
  { label:'1 month', ms:30*86400000 },
  { label:'6 months',ms:180*86400000 },
  { label:'1 year',  ms:365*86400000 },
];

const SECTIONS = [
  { id:'businesses', label:'Business Reports', icon:'🏢' },
  { id:'users',      label:'User Reports',     icon:'👤' },
  { id:'reviews',    label:'Review Reports',   icon:'💬' },
];

export default function AdminReports() {
  const { t } = useTranslation();
  const { user: adminUser } = useAuthStore();
  const [section, setSection] = useState('businesses');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState(TIME_FILTERS[0]);
  const [viewReport, setViewReport] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg,type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db,'reports'));
        setReports(snap.docs.map(d=>({id:d.id,...d.data()})));
      } catch(e){console.error(e);}
      setLoading(false);
    })();
  }, []);

  const filtered = reports.filter(r => {
    const type = r.targetType || r.type || 'business';
    const matchSection = section==='businesses' ? (type==='business'||type==='company')
      : section==='reviews' ? type==='review'
      : type==='user';
    const matchSearch = !search || (r.reason||'').toLowerCase().includes(search.toLowerCase()) || (r.reporterEmail||'').toLowerCase().includes(search.toLowerCase()) || (r.reviewSnippet||'').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || (r.status||'pending')===statusFilter;
    const matchTime = !timeFilter.ms || (() => { const t=r.createdAt?.seconds?r.createdAt.seconds*1000:0; return Date.now()-t<=timeFilter.ms; })();
    return matchSection && matchSearch && matchStatus && matchTime;
  });

  const counts = {
    businesses: reports.filter(r=>{ const t=r.targetType||r.type||'business'; return t==='business'||t==='company'; }).length,
    users: reports.filter(r=>{ const t=r.targetType||r.type||'business'; return t==='user'; }).length,
    reviews: reports.filter(r=> (r.targetType||r.type)==='review').length,
  };
  const pending = filtered.filter(r=>!r.status||r.status==='pending').length;

  const resolve = async id => {
    await updateDoc(doc(db,'reports',id),{status:'resolved',resolvedAt:new Date(),resolvedBy:adminUser?.email});
    setReports(prev=>prev.map(r=>r.id===id?{...r,status:'resolved'}:r));
    showToast('Report marked as resolved');
  };

  const dismiss = async id => {
    await deleteDoc(doc(db,'reports',id));
    setReports(prev=>prev.filter(r=>r.id!==id));
    showToast('Report dismissed');
  };

  const escalate = async id => {
    await updateDoc(doc(db,'reports',id),{status:'escalated'});
    setReports(prev=>prev.map(r=>r.id===id?{...r,status:'escalated'}:r));
    showToast('Report escalated');
  };

  const formatDate = ts => { if(!ts)return'—'; const d=ts.toDate?ts.toDate():new Date(ts.seconds*1000); return d.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}); };

  return (
    <AdminLayout>
      {toast && <div className={`ap-toast ap-toast-${toast.type}`}>{toast.type==='success'?'✓':'✗'} {toast.msg}</div>}

      <div className="ap-page-header">
        <h1 className="ap-page-title">{t('admin.reports')}</h1>
        <span className="ap-count-badge" style={{background:'var(--warning-bg)',color:'var(--warning)',border:'1px solid var(--warning)'}}>
          {pending} pending
        </span>
      </div>

      {/* Section tabs */}
      <div className="ap-status-tabs" style={{marginBottom:'var(--sp-5)'}}>
        {SECTIONS.map(s=>(
          <button key={s.id} className={`ap-status-tab${section===s.id?' active':''}`} onClick={()=>setSection(s.id)}>
            <span>{s.icon}</span> {s.label}
            <span className={`ap-tab-count${section===s.id?' yellow':''}`}>{counts[s.id]}</span>
          </button>
        ))}
      </div>

      <div className="ap-table-wrap">
        <div className="ap-table-toolbar ap-toolbar-multi">
          <div className="ap-table-search">
            <svg className="ap-table-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder={t('admin.search_reports')||'Search reports…'} value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="ap-filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">{t('admin.pending')||'Pending'}</option>
            <option value="resolved">{t('admin.resolved')||'Resolved'}</option>
            <option value="escalated">{t('admin.escalated')||'Escalated'}</option>
          </select>
          <select className="ap-filter-select" value={timeFilter.label} onChange={e=>setTimeFilter(TIME_FILTERS.find(t=>t.label===e.target.value))}>
            {TIME_FILTERS.map(t=><option key={t.label}>{t.label}</option>)}
          </select>
          <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={()=>{setSearch('');setStatusFilter('');setTimeFilter(TIME_FILTERS[0]);}}>↺ Reset</button>
          <span className="ap-count-badge">{filtered.length}</span>
        </div>

        <table className="ap-table">
          <thead>
            <tr>
              <th>{t('admin.reporter')||'Reporter'}</th>
              <th>{section==='reviews' ? 'Review' : section==='businesses' ? 'Business' : 'User'} Reported</th>
              <th>{t('admin.reason')||'Reason'}</th>
              <th>{t('admin.date')||'Date'}</th>
              <th>{t('admin.status')||'Status'}</th>
              <th style={{textAlign:'right'}}>{t('admin.actions')||'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="ap-loading-cell"><div className="ap-spinner"/></td></tr>
            : filtered.length===0 ? <tr><td colSpan="6" className="ap-empty">
                {reports.length===0?`No ${section} reports yet — platform is clean ✓`:'No reports match your filters'}
              </td></tr>
            : filtered.map(r=>(
              <tr key={r.id} className="ap-tr-hover">
                <td style={{fontSize:'0.82rem'}}>{r.reporterEmail||'Anonymous'}</td>
                <td style={{maxWidth:260}}>
                  {section==='reviews' ? (
                    <div>
                      <div style={{fontSize:'0.78rem',color:'var(--text-3)',marginBottom:2}}>{r.reviewerName||'—'} {'★'.repeat(r.reviewRating||0)}</div>
                      <div className="ap-td-truncate" style={{fontSize:'0.82rem',fontStyle:'italic',color:'var(--text-2)'}}>"{r.reviewSnippet||'—'}"</div>
                      {r.companyName && <div style={{fontSize:'0.75rem',color:'var(--text-4)',marginTop:2}}>📍 {r.companyName}</div>}
                    </div>
                  ) : (
                    <span className="ap-td-bold">{r.targetName||r.businessName||r.userName||'—'}</span>
                  )}
                </td>
                <td className="ap-td-truncate" style={{maxWidth:160}}>{r.reason||r.message||'—'}</td>
                <td className="ap-td-date">{formatDate(r.createdAt)}</td>
                <td>
                  <span className={`ap-badge ${r.status==='resolved'?'green':r.status==='escalated'?'red':'yellow'}`}>
                    {r.status||'pending'}
                  </span>
                </td>
                <td>
                  <div className="ap-row-actions" style={{justifyContent:'flex-end'}}>
                    <button className="ap-icon-action-btn" title="View details" onClick={()=>setViewReport(r)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    {r.status!=='resolved' && <button className="ap-icon-action-btn success" title="Mark resolved" onClick={()=>resolve(r.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>}
                    {r.status==='pending' && <button className="ap-icon-action-btn warning" title="Escalate" onClick={()=>escalate(r.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01"/></svg>
                    </button>}
                    <button className="ap-icon-action-btn danger" title="Dismiss" onClick={()=>dismiss(r.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ap-table-footer"><span>Showing {filtered.length} of {reports.length} reports</span></div>
      </div>

      {/* View Report Modal */}
      {viewReport && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewReport(null)}>
          <div className="ap-modal">
            <div className="ap-modal-header">
              <h3>Report Details</h3>
              <button className="ap-modal-close" onClick={()=>setViewReport(null)}>✕</button>
            </div>
            <div className="ap-report-detail">
              <div className="ap-report-row"><span>Type</span><span className="ap-badge blue">{viewReport.targetType||viewReport.type||'business'}</span></div>
              <div className="ap-report-row"><span>{t('admin.reporter')||'Reporter'}</span><strong>{viewReport.reporterEmail||'Anonymous'}</strong></div>
              {(viewReport.targetType||viewReport.type)==='review' ? (
                <>
                  <div className="ap-report-row"><span>Business</span><strong>{viewReport.companyName||'—'}</strong></div>
                  <div className="ap-report-row"><span>Reviewer</span><strong>{viewReport.reviewerName||'—'} {'★'.repeat(viewReport.reviewRating||0)}</strong></div>
                  <div className="ap-report-reason" style={{marginTop:8}}>
                    <div className="ap-report-reason-label">Review Text</div>
                    <p style={{fontStyle:'italic'}}>"{viewReport.reviewSnippet||'—'}"</p>
                  </div>
                </>
              ) : (
                <div className="ap-report-row"><span>Target</span><strong>{viewReport.targetName||viewReport.businessName||viewReport.userName||'—'}</strong></div>
              )}
              <div className="ap-report-row"><span>{t('admin.date')||'Date'}</span><strong>{formatDate(viewReport.createdAt)}</strong></div>
              <div className="ap-report-row"><span>{t('admin.status')||'Status'}</span><span className={`ap-badge ${viewReport.status==='resolved'?'green':viewReport.status==='escalated'?'red':'yellow'}`}>{viewReport.status||'pending'}</span></div>
              <div className="ap-report-reason">
                <div className="ap-report-reason-label">Reason / Message</div>
                <p>{viewReport.reason||viewReport.message||'No reason provided'}</p>
                {viewReport.comment && <p style={{color:'var(--text-3)',fontSize:'0.85rem',marginTop:6}}>"{viewReport.comment}"</p>}
              </div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setViewReport(null)}>Close</button>
              {viewReport.status!=='resolved' && <button className="ap-btn ap-btn-primary" onClick={()=>{resolve(viewReport.id);setViewReport(null);}}>{t('admin.mark_resolved')||'Mark Resolved'}</button>}
              <button className="ap-btn ap-btn-danger" onClick={()=>{dismiss(viewReport.id);setViewReport(null);}}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
