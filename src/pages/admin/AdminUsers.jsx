import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable } from '../../firebase/config';
import { useLocation } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import { useAdminPermissions } from '../../hooks/useAdminPermissions';
import AdminLayout from './AdminLayout';
import { getNextArchiveAction, getUserStatusBadge, isArchivedRecord } from '../../utils/adminModeration';
import './AdminPages.css';

const TIME_FILTERS = [
  { label:'All time', ms: null },
  { label:'5 min',   ms: 5*60*1000 },
  { label:'1 hour',  ms: 3600000 },
  { label:'1 week',  ms: 7*86400000 },
  { label:'1 month', ms: 30*86400000 },
  { label:'6 months',ms: 180*86400000 },
  { label:'1 year',  ms: 365*86400000 },
  { label:'5 years', ms: 5*365*86400000 },
];

export default function AdminUsers() {
  const { t } = useTranslation();
  const { user: adminUser } = useAuthStore();
  const { can } = useAdminPermissions();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('q') || '';
  });
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState(TIME_FILTERS[0]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [archiveUser, setArchiveUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const showToast = (msg, type='success') => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 3200);
  };

  useEffect(() => {
    (async () => {
      try {
        const [userSnap, reviewSnap] = await Promise.all([
          getDocs(collection(db,'users')),
          getDocs(collection(db,'reviews')).catch(()=>({docs:[]})),
        ]);
        // Count reviews per userId
        const reviewCounts = {};
        reviewSnap.docs.forEach(d => {
          const uid = d.data().userId;
          if (uid) reviewCounts[uid] = (reviewCounts[uid] || 0) + 1;
        });
        const data = userSnap.docs.map(d => ({
          id: d.id, ...d.data(),
          totalReviews: reviewCounts[d.id] || d.data().totalReviews || 0
        }));
        data.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        setUsers(data); setFiltered(data);
      } catch(e){console.error(e);}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    let r = [...users];
    if (search) { const q=search.toLowerCase(); r=r.filter(u=>(u.email||'').toLowerCase().includes(q)||(u.displayName||'').toLowerCase().includes(q)); }
    if (roleFilter) r=r.filter(u=>(u.role||'user')===roleFilter);
    if (statusFilter === 'archived') r = r.filter(u => isArchivedRecord(u));
    if (statusFilter === 'active') r = r.filter(u => !isArchivedRecord(u));
    if (timeFilter.ms) {
      const cutoff = Date.now() - timeFilter.ms;
      r = r.filter(u => { const t=u.createdAt?.seconds?u.createdAt.seconds*1000:0; return t>=cutoff; });
    }
    setFiltered(r); setPage(1);
  }, [search, roleFilter, statusFilter, timeFilter, users]);

  const saveEdit = async () => {
    if (!editUser) return;
    if (editForm.role === 'admin') {
      alert('Admin accounts must be managed via the Administrators page, not the Users page.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db,'users',editUser.id), { displayName:editForm.displayName, role:editForm.role });
      await addDoc(collection(db,'audit_logs'),{action:'user_edited',detail:`Edited user: ${editUser.email}`,adminEmail:adminUser?.email,timestamp:serverTimestamp()});
      setUsers(prev=>prev.map(u=>u.id===editUser.id?{...u,...editForm}:u));
      setEditUser(null);
      showToast(`${editForm.displayName||editUser.email} updated successfully`);
    } catch(e){ showToast(e.message,'error'); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;
    setSaving(true);
    try {
      const deleteUserData = httpsCallable(functions, 'deleteUserData');
      await deleteUserData({ uid: deleteUser.id });
      setUsers(prev=>prev.filter(u=>u.id!==deleteUser.id));
      setDeleteUser(null);
      showToast('User and related data permanently deleted');
    } catch(e){ showToast(e.message,'error'); }
    setSaving(false);
  };

  const confirmArchive = async () => {
    if (!archiveUser) return;
    const action = getNextArchiveAction(archiveUser, 'user');
    setSaving(true);
    try {
      const update = action.nextStatus === 'archived'
        ? {
            status: 'archived',
            archivedAt: serverTimestamp(),
            archivedBy: adminUser?.email || null,
            previousStatus: archiveUser.status || 'active',
          }
        : {
            status: archiveUser.previousStatus && archiveUser.previousStatus !== 'archived'
              ? archiveUser.previousStatus
              : 'active',
            archivedAt: null,
            archivedBy: null,
            previousStatus: null,
          };
      await updateDoc(doc(db, 'users', archiveUser.id), update);
      await addDoc(collection(db, 'audit_logs'), {
        action: action.auditAction,
        detail: `${action.label}: ${archiveUser.email}`,
        adminEmail: adminUser?.email,
        timestamp: serverTimestamp(),
      });
      setUsers(prev => prev.map(u => u.id === archiveUser.id ? { ...u, ...update } : u));
      setArchiveUser(null);
      showToast(`${archiveUser.displayName || archiveUser.email} ${action.nextStatus === 'archived' ? 'archived' : 'unarchived'} successfully`);
    } catch (e) {
      showToast(e.message, 'error');
    }
    setSaving(false);
  };

  const formatDate = ts => {
    if (!ts) return '—';
    const d=ts.toDate?ts.toDate():new Date(ts.seconds*1000);
    return d.toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'});
  };

  const pageCount = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const roles = [...new Set(users.map(u=>u.role||'user'))];

  function handleExport() {
    const cols = ['displayName', 'email', 'role', 'totalReviews', 'country'];
    const rows = filtered.map(item => cols.map(c => {
      const val = item[c] || '';
      return '"' + String(val).replace(/"/g, '""') + '"';
    }).join(','));
    const csv = [cols.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users_export_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
    // Log export to audit
    addDoc(collection(db, 'audit_logs'), {
      action: 'export_users',
      detail: 'Exported ' + filtered.length + ' users to CSV',
      adminEmail: adminUser?.email,
      timestamp: serverTimestamp()
    }).catch(()=>{});
    showToast('Exported ' + filtered.length + ' users to CSV');
  }

  return (
    <AdminLayout>
      {toast && <div className={`ap-toast ap-toast-${toast.type}`}>{toast.type==='success'?'✓':'✗'} {toast.msg}</div>}

      <div className="ap-page-header">
        <h1 className="ap-page-title">{t('admin.users')}</h1>
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
            <input placeholder="Search by name or email…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="ap-filter-select" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {roles.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <select className="ap-filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <select className="ap-filter-select" value={timeFilter.label} onChange={e=>setTimeFilter(TIME_FILTERS.find(t=>t.label===e.target.value))}>
            {TIME_FILTERS.map(t=><option key={t.label} value={t.label}>{t.label}</option>)}
          </select>
          <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={()=>{setSearch('');setRoleFilter('');setStatusFilter('');setTimeFilter(TIME_FILTERS[0]);}}>↺ Reset</button>
          <span className="ap-count-badge">{filtered.length} users</span>
        </div>

        <table className="ap-table">
          <thead><tr><th>User</th><th>Role</th><th>{t('admin.joined')||'Joined'}</th><th>{t('admin.reviews_count')||'Reviews'}</th><th style={{textAlign:'right'}}>{t('admin.actions')||'Actions'}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="5" className="ap-loading-cell"><div className="ap-spinner"/></td></tr>
            : paginated.length===0 ? <tr><td colSpan="5" className="ap-empty">No users match your filters</td></tr>
            : paginated.map(user => {
              const name = user.displayName || user.firstName || user.email?.split('@')[0] || 'User';
              const statusBadge = getUserStatusBadge(user);
              return (
                <tr key={user.id} className={`ap-tr-hover${isArchivedRecord(user) ? ' ap-row-inactive' : ''}`}>
                  <td>
                    <div className="ap-user-cell">
                      <div className="ap-avatar" style={{background:`hsl(${name.charCodeAt(0)*13}deg 45% 55%)`}}>{name[0].toUpperCase()}</div>
                      <div>
                        <div className="ap-user-info-name">{name}</div>
                        <div className="ap-user-info-sub">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`ap-badge ${statusBadge.className}`}>{statusBadge.label}</span></td>
                  <td className="ap-td-date">{formatDate(user.createdAt)}</td>
                  <td className="ap-td-date">{user.totalReviews||0}</td>
                  <td>
                    <div className="ap-row-actions" style={{justifyContent:'flex-end'}}>
                      <button className="ap-icon-action-btn" title="View details" onClick={()=>setViewUser(user)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      {can('edit_users') && (
                        <button className="ap-icon-action-btn" title="Edit user" onClick={()=>{setEditUser(user);setEditForm({displayName:user.displayName||user.firstName||'',role:user.role||'user'});}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      )}
                      {can('edit_users') && (
                        <button className={`ap-icon-action-btn ${isArchivedRecord(user) ? 'success' : 'warning'}`} title={isArchivedRecord(user) ? 'Unarchive user' : 'Archive user'} onClick={()=>setArchiveUser(user)}>
                          {isArchivedRecord(user)
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18"/><path d="M5 7v13h14V7"/><path d="M9 11l3 3 3-3"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/></svg>
                          }
                        </button>
                      )}
                      {can('delete_users') && (
                        <button className="ap-icon-action-btn danger" title="Permanently delete user" onClick={()=>setDeleteUser(user)}>
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
          <span>Showing {Math.min((page-1)*PER_PAGE+1, filtered.length)}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length} users</span>
          {pageCount > 1 && (
            <div className="ap-pagination">
              <button className="ap-page-btn" disabled={page===1} onClick={()=>setPage(p=>p-1)}>‹</button>
              {Array.from({length:Math.min(pageCount,7)},(_,i)=>{
                let p = i+1;
                if(pageCount>7) { if(page<=4) p=i+1; else if(page>=pageCount-3) p=pageCount-6+i; else p=page-3+i; }
                return <button key={p} className={`ap-page-btn${page===p?' active':''}`} onClick={()=>setPage(p)}>{p}</button>;
              })}
              <button className="ap-page-btn" disabled={page===pageCount} onClick={()=>setPage(p=>p+1)}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* View Modal */}
      {viewUser && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setViewUser(null)}>
          <div className="ap-modal">
            <div className="ap-modal-header">
              <h3>User Profile</h3>
              <button className="ap-modal-close" onClick={()=>setViewUser(null)}>✕</button>
            </div>
            <div className="ap-view-user-hero">
              <div className="ap-view-avatar" style={{background:`hsl(${(viewUser.displayName||'U').charCodeAt(0)*13}deg 45% 55%)`}}>
                {(viewUser.displayName||viewUser.email||'U')[0].toUpperCase()}
              </div>
              <div>
                <div className="ap-view-name">{viewUser.displayName||viewUser.firstName||'—'}</div>
                <div className="ap-view-email">{viewUser.email}</div>
                <span className={`ap-badge ${viewUser.role==='admin'?'teal':viewUser.role==='company_admin'?'blue':'gray'}`} style={{marginTop:6}}>{viewUser.role||'user'}</span>
                {isArchivedRecord(viewUser) && <span className="ap-badge red" style={{marginTop:6,marginLeft:6}}>Archived</span>}
              </div>
            </div>
            <div className="ap-view-grid">
              <div className="ap-view-stat"><span>User ID</span><strong style={{fontSize:'0.72rem',wordBreak:'break-all'}}>{viewUser.id}</strong></div>
              <div className="ap-view-stat"><span>{t('admin.joined')||'Joined'}</span><strong>{formatDate(viewUser.createdAt)}</strong></div>
              <div className="ap-view-stat"><span>{t('admin.reviews_count')||'Reviews'}</span><strong>{viewUser.totalReviews||0}</strong></div>
              <div className="ap-view-stat"><span>Country</span><strong>{viewUser.country||'—'}</strong></div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setViewUser(null)}>Close</button>
              <button className="ap-btn ap-btn-primary" onClick={()=>{setViewUser(null);setEditUser(viewUser);setEditForm({displayName:viewUser.displayName||'',role:viewUser.role||'user'});}}>Edit User</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditUser(null)}>
          <div className="ap-modal">
            <div className="ap-modal-header">
              <h3>{t('admin.edit')+' '+t('admin.user')}</h3>
              <button className="ap-modal-close" onClick={()=>setEditUser(null)}>✕</button>
            </div>
            <div className="ap-edit-user-info">
              <div className="ap-avatar sm" style={{background:`hsl(${(editUser.displayName||'U').charCodeAt(0)*13}deg 45% 55%)`}}>{(editUser.displayName||editUser.email||'U')[0].toUpperCase()}</div>
              <div>
                <div style={{fontWeight:700,color:'var(--text-1)',fontSize:'0.9rem'}}>{editUser.email}</div>
                <div style={{fontSize:'0.75rem',color:'var(--text-4)'}}>UID: {editUser.id}</div>
              </div>
            </div>
            <div className="ap-field"><label>Display Name</label><input className="ap-input" value={editForm.displayName} onChange={e=>setEditForm(f=>({...f,displayName:e.target.value}))}/></div>
            <div className="ap-field">
              <label>Role</label>
              <select className="ap-input" value={editForm.role} onChange={e=>setEditForm(f=>({...f,role:e.target.value}))}>
                <option value="user">User</option>
                <option value="company_admin">Company Admin</option>
                {/* Admin role is managed separately via the Administrators page — not editable here */}
              </select>
              {editForm.role === 'admin' && (
                <p style={{fontSize:'0.75rem',color:'#ef4444',marginTop:4}}>
                  ⚠️ Admin accounts must be managed via the Administrators page, not here.
                </p>
              )}
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setEditUser(null)}>{t('admin.cancel')||'Cancel'}</button>
              <button className="ap-btn ap-btn-primary" onClick={saveEdit} disabled={saving}>{saving?'Saving…':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {archiveUser && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setArchiveUser(null)}>
          <div className="ap-modal ap-modal-sm">
            <div className="ap-modal-header">
              <h3>{getNextArchiveAction(archiveUser, 'user').label}</h3>
              <button className="ap-modal-close" onClick={()=>setArchiveUser(null)}>✕</button>
            </div>
            <div className="ap-danger-box">
              <div className="ap-danger-icon">⚠️</div>
              <div>
                <strong>{isArchivedRecord(archiveUser) ? 'Restore this user?' : 'Archive this user?'}</strong>
                <p>
                  {isArchivedRecord(archiveUser)
                    ? <>Unarchiving <strong>{archiveUser.displayName || archiveUser.email}</strong> makes their profile active on the platform again.</>
                    : <>Archiving <strong>{archiveUser.displayName || archiveUser.email}</strong> hides the user from the platform while keeping their data for future restoration.</>
                  }
                </p>
              </div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setArchiveUser(null)}>{t('admin.cancel')||'Cancel'}</button>
              <button className={isArchivedRecord(archiveUser) ? 'ap-btn ap-btn-success' : 'ap-btn ap-btn-danger'} onClick={confirmArchive} disabled={saving}>
                {saving ? getNextArchiveAction(archiveUser, 'user').progressLabel : getNextArchiveAction(archiveUser, 'user').label}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteUser && (
        <div className="ap-modal-overlay" onClick={e=>e.target===e.currentTarget&&setDeleteUser(null)}>
          <div className="ap-modal ap-modal-sm">
            <div className="ap-modal-header">
              <h3>Permanently Delete User</h3>
              <button className="ap-modal-close" onClick={()=>setDeleteUser(null)}>✕</button>
            </div>
            <div className="ap-danger-box">
              <div className="ap-danger-icon">⚠️</div>
              <div>
                <strong>This action cannot be undone</strong>
                <p>You are about to permanently delete <strong>{deleteUser.displayName||deleteUser.email}</strong>, their Auth account, profile, reviews, notifications, claims, support chats, and owned business data where applicable. Use Archive when you only want to hide the user while keeping their data restorable.</p>
              </div>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={()=>setDeleteUser(null)}>{t('admin.cancel')||'Cancel'}</button>
              <button className="ap-btn ap-btn-danger" onClick={confirmDelete} disabled={saving}>{saving?'Deleting...':'Delete Permanently'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
