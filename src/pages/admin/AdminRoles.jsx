import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../firebase/config';
import { collection, getDocs, setDoc, doc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '../../store/authStore';
import AdminLayout from './AdminLayout';
import './AdminPages.css';

const ALL_PERMISSIONS = [
  // Users
  { key: 'view_users',         label: 'View Users',              group: 'Users' },
  { key: 'edit_users',         label: 'Edit Users',              group: 'Users' },
  { key: 'delete_users',       label: 'Delete Users',            group: 'Users' },
  { key: 'ban_users',          label: 'Ban / Suspend Users',     group: 'Users' },
  { key: 'export_users',       label: 'Export User Data',        group: 'Users' },
  // Businesses
  { key: 'view_businesses',    label: 'View Businesses',         group: 'Businesses' },
  { key: 'edit_businesses',    label: 'Edit Businesses',         group: 'Businesses' },
  { key: 'verify_businesses',  label: 'Verify Businesses',       group: 'Businesses' },
  { key: 'delete_businesses',  label: 'Delete Businesses',       group: 'Businesses' },
  { key: 'feature_businesses', label: 'Feature Businesses',      group: 'Businesses' },
  // Reviews
  { key: 'view_reviews',       label: 'View Reviews',            group: 'Reviews' },
  { key: 'delete_reviews',     label: 'Delete Reviews',          group: 'Reviews' },
  { key: 'comment_reviews',    label: 'Comment on Reviews',      group: 'Reviews' },
  { key: 'pin_reviews',        label: 'Pin / Highlight Reviews', group: 'Reviews' },
  { key: 'flag_reviews',       label: 'Flag Reviews for Review', group: 'Reviews' },
  // Claims
  { key: 'manage_claims',      label: 'Manage Claims',           group: 'Claims' },
  { key: 'approve_claims',     label: 'Approve Claims',          group: 'Claims' },
  { key: 'reject_claims',      label: 'Reject Claims',           group: 'Claims' },
  // Reports
  { key: 'view_reports',       label: 'View Reports',            group: 'Reports' },
  { key: 'resolve_reports',    label: 'Resolve Reports',         group: 'Reports' },
  { key: 'escalate_reports',   label: 'Escalate Reports',        group: 'Reports' },
  // Analytics
  { key: 'view_analytics',     label: 'View Analytics',          group: 'Analytics' },
  { key: 'export_analytics',   label: 'Export Analytics Data',   group: 'Analytics' },
  // Blog & Content
  { key: 'view_blogs',         label: 'View Blog Posts',         group: 'Content' },
  { key: 'create_blogs',       label: 'Create Blog Posts',       group: 'Content' },
  { key: 'edit_blogs',         label: 'Edit Blog Posts',         group: 'Content' },
  { key: 'delete_blogs',       label: 'Delete Blog Posts',       group: 'Content' },
  { key: 'publish_blogs',      label: 'Publish Blog Posts',      group: 'Content' },
  { key: 'schedule_blogs',     label: 'Schedule Blog Posts',     group: 'Content' },
  // Newsletter
  { key: 'view_newsletter',    label: 'View Newsletter',         group: 'Content' },
  { key: 'manage_subscribers', label: 'Manage Subscribers',      group: 'Content' },
  { key: 'compose_newsletter', label: 'Compose Newsletter',      group: 'Content' },
  { key: 'schedule_newsletter',label: 'Schedule Newsletter',     group: 'Content' },
  { key: 'send_newsletter',    label: 'Send Newsletter',         group: 'Content' },
  { key: 'view_newsletter_analytics', label: 'View Newsletter Analytics', group: 'Content' },
  // Support & Chat
  { key: 'view_chat',          label: 'View Support Chat',       group: 'Support' },
  { key: 'reply_chat',         label: 'Reply to Chat',           group: 'Support' },
  { key: 'assign_chat',        label: 'Assign Chat Sessions',    group: 'Support' },
  { key: 'close_chat',         label: 'Close Chat Sessions',     group: 'Support' },
  // Notifications
  { key: 'send_notifications', label: 'Send Notifications',      group: 'Notifications' },
  { key: 'view_notification_status', label: 'View Notification Status', group: 'Notifications' },
  // Finance & Payments
  { key: 'view_payments',      label: 'View Payments',           group: 'Finance' },
  { key: 'export_payments',    label: 'Export Payment Data',     group: 'Finance' },
  { key: 'view_invoices',      label: 'View Invoices',           group: 'Finance' },
  { key: 'view_subscriptions', label: 'View Subscriptions',      group: 'Finance' },
  { key: 'manage_subscriptions', label: 'Manage Subscriptions',  group: 'Finance' },
  // System & Admin
  { key: 'manage_admins',      label: 'Manage Administrators',   group: 'System' },
  { key: 'manage_settings',    label: 'Manage Settings',         group: 'System' },
  { key: 'view_audit',         label: 'View Audit Trail',        group: 'System' },
  { key: 'manage_roles',       label: 'Manage Roles',            group: 'System' },
  // Technical
  { key: 'manage_api_keys',    label: 'Manage API Keys',         group: 'Technical' },
  { key: 'manage_webhooks',    label: 'Manage Webhooks',         group: 'Technical' },
  { key: 'view_logs',          label: 'View System Logs',        group: 'Technical' },
  { key: 'view_system_health', label: 'View System Health',      group: 'Technical' },
];

const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map(p => p.group))];

// Role Templates - pre-built roles for common use cases
const ROLE_TEMPLATES = [
  {
    name: 'Content Manager',
    description: 'Manages blog posts, newsletters, and content publications',
    permissions: ['view_blogs','create_blogs','edit_blogs','delete_blogs','publish_blogs','schedule_blogs','view_newsletter','manage_subscribers','compose_newsletter','schedule_newsletter','send_newsletter','view_newsletter_analytics']
  },
  {
    name: 'Moderator',
    description: 'Moderates reviews, manages claims, and verifies businesses',
    permissions: ['view_businesses','verify_businesses','feature_businesses','view_reviews','comment_reviews','delete_reviews','flag_reviews','pin_reviews','manage_claims','approve_claims','reject_claims','view_reports']
  },
  {
    name: 'Support Agent',
    description: 'Provides customer support and manages support tickets',
    permissions: ['view_chat','reply_chat','assign_chat','close_chat','view_businesses','view_reviews','comment_reviews','manage_claims','view_reports']
  },
  {
    name: 'Data Analyst',
    description: 'Views analytics, generates reports, and exports data',
    permissions: ['view_analytics','export_analytics','view_reports','view_payments','view_invoices','view_subscriptions','export_payments']
  },
  {
    name: 'Technical Lead',
    description: 'Manages technical systems, logs, and integrations',
    permissions: ['view_logs','view_audit','view_system_health','manage_api_keys','manage_webhooks']
  }
];

const DEFAULT_ROLES = [
  { name: 'Super Admin', permissions: ALL_PERMISSIONS.map(p => p.key), isSystem: true },
  { name: 'Content Manager', permissions: ROLE_TEMPLATES[0].permissions, isSystem: false },
  { name: 'Moderator', permissions: ROLE_TEMPLATES[1].permissions, isSystem: false },
  { name: 'Support Agent', permissions: ROLE_TEMPLATES[2].permissions, isSystem: false },
  { name: 'Data Analyst', permissions: ROLE_TEMPLATES[3].permissions, isSystem: false },
  { name: 'Technical Lead', permissions: ROLE_TEMPLATES[4].permissions, isSystem: false },
];

export default function AdminRoles() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // role being edited
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', permissions: [] });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  function showToast(msg, type='success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'admin_roles'));
        if (snap.empty) {
          // Seed defaults to Firestore so they persist
          const savedRoles = [];
          for (const r of DEFAULT_ROLES) {
            const id = `role_${r.name.toLowerCase().replace(/\s+/g,'_')}`;
            await setDoc(doc(db, 'admin_roles', id), { name: r.name, permissions: r.permissions, isSystem: r.isSystem || false }).catch(()=>{});
            savedRoles.push({ ...r, id });
          }
          setRoles(savedRoles);
        } else {
          setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch(e) {
        setRoles(DEFAULT_ROLES.map((r, i) => ({ ...r, id: `default_${i}` })));
      }
      setLoading(false);
    })();
  }, []);

  async function saveRole(role) {
    setSaving(true);
    try {
      await setDoc(doc(db, 'admin_roles', role.id), { name: role.name, permissions: role.permissions, isSystem: role.isSystem || false });
      setRoles(prev => prev.map(r => r.id === role.id ? role : r));
      setEditing(null);
      await addDoc(collection(db, 'audit_logs'), { action:'role_updated', detail:`Updated role: ${role.name}`, adminEmail: user?.email, timestamp: serverTimestamp() });
    } catch(e) { console.error(e); }
    setSaving(false);
  }

  async function createRole() {
    if (!newRole.name.trim()) return;
    setSaving(true);
    try {
      const id = `role_${Date.now()}`;
      const roleData = { name: newRole.name.trim(), permissions: newRole.permissions, isSystem: false, createdAt: serverTimestamp() };
      await setDoc(doc(db, 'admin_roles', id), roleData);
      const newEntry = { id, ...roleData };
      setRoles(prev => [...prev, newEntry]);
      setCreating(false);
      setNewRole({ name: '', permissions: [] });
      showToast('Role created: ' + roleData.name);
    } catch(e) { 
      console.error('Error creating role:', e);
      showToast('Error: ' + (e.message || 'Failed to create role. Check Firestore permissions.'), 'error');
    }
    setSaving(false);
  }

  async function deleteRole(id) {
    setDeleteConfirm(id);
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'admin_roles', deleteConfirm));
      setRoles(prev => prev.filter(r => r.id !== deleteConfirm));
      setDeleteConfirm(null);
      showToast('Role deleted successfully');
    } catch(e) {
      console.error(e);
      showToast('Error deleting role', 'error');
      setDeleteConfirm(null);
    }
  }

  function PermissionCheckboxGroup({ perms, onChange, disabled }) {
    const allPerms = ALL_PERMISSIONS.map(p => p.key);

    return (
      <div className="ap-perm-groups">
        {/* Quick Actions Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '12px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>
            {perms.length} / {allPerms.length} permissions
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="ap-btn ap-btn-tertiary ap-btn-xs"
              disabled={disabled}
              onClick={() => onChange(allPerms)}
              style={{ padding: '6px 10px', fontSize: '0.75rem' }}
            >
              All
            </button>
            <button
              className="ap-btn ap-btn-tertiary ap-btn-xs"
              disabled={disabled}
              onClick={() => onChange([])}
              style={{ padding: '6px 10px', fontSize: '0.75rem' }}
            >
              None
            </button>
          </div>
        </div>

        {/* Permission Groups */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px', padding: '0 20px' }}>
          {PERMISSION_GROUPS.map(group => {
            const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.key);
            const groupSelected = groupPerms.filter(p => perms.includes(p));
            const isGroupAllSelected = groupSelected.length === groupPerms.length;

            return (
              <div key={group} className="ap-perm-group" style={{
                paddingBottom: '12px',
                paddingLeft: '16px',
                paddingRight: '16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {/* Group Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '6px'
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    <span>{group}</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 500, textTransform: 'none' }}>({groupSelected.length}/{groupPerms.length})</span>
                  </div>
                  <button
                    className="ap-btn ap-btn-tertiary ap-btn-xs"
                    disabled={disabled}
                    onClick={() => {
                      const newPerms = isGroupAllSelected
                        ? perms.filter(p => !groupPerms.includes(p))
                        : [...new Set([...perms, ...groupPerms])];
                      onChange(newPerms);
                    }}
                    style={{ padding: '3px 8px', fontSize: '0.65rem', minWidth: '60px' }}
                  >
                    {isGroupAllSelected ? 'Deselect' : 'Select'}
                  </button>
                </div>

                {/* Group Permissions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {ALL_PERMISSIONS.filter(p => p.group === group).map(p => (
                    <label key={p.key} className="ap-perm-check" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                      fontSize: '0.8rem',
                      padding: '2px 0',
                      margin: 0
                    }}>
                      <input
                        type="checkbox"
                        checked={perms.includes(p.key)}
                        disabled={disabled}
                        onChange={e => {
                          if (e.target.checked) onChange([...perms, p.key]);
                          else onChange(perms.filter(k => k !== p.key));
                        }}
                        style={{
                          width: '14px',
                          height: '14px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          accentColor: 'var(--brand)',
                          marginTop: '1px'
                        }}
                      />
                      <span style={{ color: 'var(--text)', lineHeight: '1.2' }}>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="ap-page-header">
        <h1 className="ap-page-title">{t('admin.roles_title')||'Roles & Permissions'}</h1>
        <button className="ap-btn ap-btn-primary" onClick={() => setCreating(true)}>
          + New Role
        </button>
      </div>

      <p style={{ color:'var(--muted)', fontSize:'0.875rem', marginBottom:'var(--sp-6)' }}>
        Define what each admin role can access and manage within the platform.
      </p>

      {loading ? <div className="ap-table-wrap" style={{ padding:'40px', textAlign:'center', color:'var(--muted)' }}>Loading…</div>
      : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {roles.map(role => {
            const permissionPercentage = Math.round((role.permissions?.length || 0) / ALL_PERMISSIONS.length * 100);

            return (
              <div key={role.id} style={{
                background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--card-bg) 100%)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'var(--brand)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}>

                {/* Header with name and badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{
                      fontSize: '1.125rem',
                      fontWeight: 700,
                      color: 'var(--text)',
                      marginBottom: '6px'
                    }}>
                      {role.name}
                    </div>
                    {role.isSystem && (
                      <span style={{
                        display: 'inline-block',
                        background: 'rgba(0, 200, 150, 0.2)',
                        color: '#00c896',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        System Role
                      </span>
                    )}
                  </div>
                </div>

                {/* Permission count and progress */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{
                      fontSize: '0.8rem',
                      color: 'var(--muted)',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontWeight: 500
                    }}>
                      Permissions
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: 'var(--brand)'
                    }}>
                      {role.permissions?.length || 0}
                    </div>
                  </div>
                  <div style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    background: 'conic-gradient(var(--brand) 0deg ' + (permissionPercentage * 3.6) + 'deg, var(--border) ' + (permissionPercentage * 3.6) + 'deg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text)',
                    boxShadow: 'inset 0 0 0 8px var(--card-bg)'
                  }}>
                    {permissionPercentage}%
                  </div>
                </div>

                {/* Sample permissions list */}
                {(role.permissions?.length || 0) > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--muted)',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>
                      Sample Permissions
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(role.permissions || []).slice(0, 3).map(p => {
                        const pm = ALL_PERMISSIONS.find(x => x.key === p);
                        return pm ? (
                          <div key={p} style={{
                            fontSize: '0.8rem',
                            color: 'var(--text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span style={{
                              width: '4px',
                              height: '4px',
                              background: 'var(--brand)',
                              borderRadius: '50%',
                              marginTop: '1px'
                            }}></span>
                            {pm.label}
                          </div>
                        ) : null;
                      })}
                      {(role.permissions?.length || 0) > 3 && (
                        <div style={{
                          fontSize: '0.8rem',
                          color: 'var(--muted)',
                          fontWeight: 500,
                          marginTop: '4px'
                        }}>
                          +{role.permissions.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  <button
                    className="ap-btn ap-btn-primary ap-btn-sm"
                    onClick={() => setEditing({ ...role })}
                    style={{ flex: 1 }}
                  >
                    Edit
                  </button>
                  {!role.isSystem && (
                    <button
                      className="ap-btn ap-btn-danger ap-btn-sm"
                      onClick={() => deleteRole(role.id)}
                      style={{ flex: 1 }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit role modal */}
      {editing && (
        <div className="ap-modal-overlay" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="ap-modal" style={{ maxWidth:680 }}>
            <div className="ap-modal-header">
              <h3>Edit Role: {editing.name}</h3>
              <button className="ap-modal-close" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="ap-field">
              <label>{t('admin.role_name')||'Role Name'}</label>
              <input className="ap-input" value={editing.name} disabled={editing.isSystem}
                onChange={e => setEditing(r => ({...r, name: e.target.value}))} />
            </div>
            <div className="ap-field" style={{ marginTop:'var(--sp-5)' }}>
              <label>{t('admin.permissions')||'Permissions'}</label>
              <PermissionCheckboxGroup
                perms={editing.permissions || []}
                onChange={p => setEditing(r => ({...r, permissions: p}))}
                disabled={editing.isSystem}
              />
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={() => setEditing(null)}>{t('admin.cancel')||'Cancel'}</button>
              {!editing.isSystem && (
                <button className="ap-btn ap-btn-primary" onClick={() => saveRole(editing)} disabled={saving}>
                  {saving ? t('admin.saving')||'Saving…' : t('admin.save_role')||'Save Role'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create role modal */}
      {creating && (
        <div className="ap-modal-overlay" onClick={e => e.target === e.currentTarget && setCreating(false)}>
          <div className="ap-modal" style={{ maxWidth:'98vw', width: '1600px', maxHeight: '95vh', overflow: 'auto' }}>
            <div className="ap-modal-header">
              <h3>{t('admin.create_new_role')||'Create New Role'}</h3>
              <button className="ap-modal-close" onClick={() => setCreating(false)}>✕</button>
            </div>

            <div className="ap-field">
              <label style={{ fontSize:'0.875rem', fontWeight:600, marginBottom:'8px', display:'block' }}>Use Template (Optional)</label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:'8px', marginBottom:'16px' }}>
                {ROLE_TEMPLATES.map((template, idx) => (
                  <button
                    key={idx}
                    className="ap-btn ap-btn-secondary"
                    style={{ textAlign:'left', padding:'12px', fontSize:'0.875rem', height:'auto', border: newRole.permissions === template.permissions ? '2px solid var(--brand)' : '1px solid var(--border)' }}
                    onClick={() => setNewRole({ name: template.name, permissions: [...template.permissions] })}
                    title={template.description}
                  >
                    <div style={{ fontWeight:600 }}>{template.name}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--muted)', marginTop:'4px' }}>{template.permissions.length} permissions</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="ap-field">
              <label>{t('admin.role_name')||'Role Name'}</label>
              <input className="ap-input" value={newRole.name} placeholder={t('admin.role_placeholder')||'e.g. Custom Role'}
                onChange={e => setNewRole(r => ({...r, name: e.target.value}))} />
            </div>
            <div className="ap-field" style={{ marginTop:'var(--sp-5)' }}>
              <label>{t('admin.permissions')||'Permissions'}</label>
              <PermissionCheckboxGroup
                perms={newRole.permissions}
                onChange={p => setNewRole(r => ({...r, permissions: p}))}
                disabled={false}
              />
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn ap-btn-secondary" onClick={() => setCreating(false)}>{t('admin.cancel')||'Cancel'}</button>
              <button className="ap-btn ap-btn-primary" onClick={createRole} disabled={saving || !newRole.name.trim()}>
                {saving ? t('admin.creating')||'Creating…' : t('admin.create_role')||'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="ap-modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="ap-modal" style={{ maxWidth: '400px' }}>
            <div className="ap-modal-header">
              <h3>Delete Role</h3>
              <button className="ap-modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div style={{ padding: '0 20px 20px' }}>
              <p style={{
                color: 'var(--muted)',
                fontSize: '0.95rem',
                lineHeight: '1.5',
                marginBottom: '20px'
              }}>
                Are you sure you want to delete this role? This action cannot be undone.
              </p>
              <div style={{
                display: 'flex',
                gap: '12px'
              }}>
                <button
                  className="ap-btn ap-btn-secondary"
                  onClick={() => setDeleteConfirm(null)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  className="ap-btn ap-btn-danger"
                  onClick={confirmDelete}
                  style={{ flex: 1 }}
                >
                  Delete Role
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:9999,
          background: toast.type==='error' ? '#ef4444' : 'var(--brand)',
          color:'white', padding:'12px 20px', borderRadius:10,
          boxShadow:'0 4px 20px rgba(0,0,0,0.2)', fontSize:'0.875rem', fontWeight:500,
          display:'flex', alignItems:'center', gap:8
        }}>
          {toast.type==='error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}
    </AdminLayout>
  );
}
