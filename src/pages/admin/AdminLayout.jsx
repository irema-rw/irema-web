import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth, signOut } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getInitials } from '../../utils/helpers';
import { clearPermissionsCache } from '../../hooks/useAdminPermissions';
import { LANGUAGES } from '../../constants/languages';
import AdminBottomNav from './AdminBottomNav';
import './AdminLayout.css';

function NavIcon({ d, d2 }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d}/>{d2 && <path d={d2}/>}
    </svg>
  );
}

const NAV = [
  {
    label: 'MANAGEMENT', sectionKey: 'section_management',
    links: [
      { to: '/admin', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', icon2:'M9 22V12h6v10', label: 'Dashboard', labelKey: 'dashboard', end: true },
      { to: '/admin/analytics', icon: 'M18 20V10M12 20V4M6 20v-6', label: 'Analytics', labelKey: 'analytics' },
      { to: '/admin/users', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', icon2:'M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0', label: 'Users', labelKey: 'users' },
      { to: '/admin/businesses', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', label: 'Businesses', labelKey: 'businesses' },
    ]
  },
  {
    label: 'MODERATION', sectionKey: 'section_moderation',
    links: [
      { to: '/admin/reviews', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', label: 'Reviews', labelKey: 'reviews' },
      { to: '/admin/reports', icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', label: 'Reports', labelKey: 'reports' },
      { to: '/admin/claims', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Claims', labelKey: 'claims' },
      { to: '/admin/stories', icon: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.871V15.13a1 1 0 0 1-1.447.9L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z', label: 'Stories', labelKey: 'stories' },
    ]
  },
  {
    label: 'CONTENT', sectionKey: 'section_content',
    links: [
      { to: '/admin/blog', icon: 'M12 6.253v13m0-13C6.5 6.253 2 10.753 2 16.5S6.5 26.75 12 26.75s10-4.5 10-10.25S17.5 6.252 12 6.253zm0 5.801h3.008c.476 0 .862.38.862.845v.7c0 .466-.386.846-.862.846H12c-.476 0-.862-.38-.862-.846v-.7c0-.465.386-.845.862-.845z', label: 'Blog', labelKey: 'blog' },
      { to: '/admin/newsletter', icon: 'M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z', label: 'Newsletter', labelKey: 'newsletter' },
      { to: '/admin/support', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', label: 'Support', labelKey: 'support' },
    ]
  },
  {
    label: 'BILLING', sectionKey: 'section_billing',
    links: [
      { to: '/admin/subscriptions', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z', label: 'Subscriptions', labelKey: 'subscriptions' },
      { to: '/admin/enterprise', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', label: 'Enterprise', labelKey: 'enterprise' },
      { to: '/admin/features', icon: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18', label: 'Features', labelKey: 'features' },
      { to: '/admin/integrations', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z', label: 'Integrations', labelKey: 'integrations' },
    ]
  },
  {
    label: 'SYSTEM', sectionKey: 'section_system',
    links: [
      { to: '/admin/administrators', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10', label: 'Administrators', labelKey: 'administrators' },
      { to: '/admin/roles', icon: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18', label: 'Roles & Permissions', labelKey: 'roles_permissions' },
      { to: '/admin/translations', icon: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 0 1 6.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129', label: 'Translations', labelKey: 'translations' },
      { to: '/admin/audit', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z', label: 'Audit Trail', labelKey: 'audit_trail' },
      { to: '/admin/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', label: 'Settings', labelKey: 'settings' },
    ]
  },
];

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, clear } = useAuthStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const [search, setSearch] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dropRef = useRef(null);
  const langRef = useRef(null);

  async function handleLogout() {
    try {
      clearPermissionsCache();
      await signOut(auth);
      clear();
      // Use hard redirect to prevent module loading issues after logout
      window.location.href = '/admin/login';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/admin/login';
    }
  }

  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = getInitials(user?.displayName || user?.email || 'A');
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Admin';
  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  return (
    <div className="al-root">
      <header className="al-navbar">
        <NavLink to="/admin" className="al-navbar-brand">
          <div className="al-brand-icon" style={{background:'transparent',padding:0,overflow:'hidden',borderRadius:8}}>
            <svg width="28" height="28" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="44" height="44" rx="10" fill="#1a5c3e"/>
              <path d="M22 7l3.9 7.9 8.7 1.3-6.3 6.1 1.5 8.6-7.8-4.1-7.8 4.1 1.5-8.6L9.4 16.2l8.7-1.3z" fill="white" opacity="0.15"/>
              <path d="M22 8.5l3.6 7.3 8.1 1.2-5.9 5.7 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.9-5.7 8.1-1.2z" fill="#FFD700"/>
              <path d="M22 11l2.6 5.2 5.7.8-4.1 4 1 5.6-5.2-2.7-5.2 2.7 1-5.6-4.1-4 5.7-.8z" fill="white" opacity="0.25"/>
            </svg>
          </div>
          <span className="al-brand-text">Irema</span>
          <span className="al-brand-badge">Admin</span>
        </NavLink>

        <div className="al-navbar-center">
          <div className="al-search-wrap">
            <div className="al-search-icon-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <input type="search" className="al-search" placeholder={t('admin.search_placeholder') || 'Search users, businesses, reviews…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && search.trim()) {
                  const q = encodeURIComponent(search.trim());
                  const path = window.location.pathname;
                  if (path.includes('/users')) navigate(`/admin/users?q=${q}`);
                  else if (path.includes('/businesses')) navigate(`/admin/businesses?q=${q}`);
                  else if (path.includes('/reviews')) navigate(`/admin/reviews?q=${q}`);
                  else navigate(`/admin/users?q=${q}`);
                  setSearch('');
                }
              }}
            />
            {search && (
              <div className="al-search-hint">Press Enter to search</div>
            )}
          </div>
        </div>

        <div className="al-navbar-right">
          {/* Mobile sidebar toggle — only visible on small screens */}
          <button className="al-icon-btn al-sidebar-toggle" onClick={()=>setSidebarOpen(v=>!v)} aria-label="Toggle menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {sidebarOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>

          {/* Dark mode toggle */}
          <button className="al-icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark'
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>

          {/* Language */}
          <div className="al-lang-wrap" ref={langRef}>
            <button className="al-icon-btn al-lang-btn" onClick={() => setLangOpen(v => !v)}>
              {currentLang.label}
            </button>
            {langOpen && (
              <div className="al-lang-dropdown">
                {LANGUAGES.map(l => (
                  <button key={l.code} className={`al-lang-option${i18n.language === l.code ? ' active' : ''}`}
                    onClick={() => { i18n.changeLanguage(l.code); localStorage.setItem('irema_lang', l.code); setLangOpen(false); }}>
                    {l.name}
                    {i18n.language === l.code && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User pill */}
          <div className="al-user-wrap" ref={dropRef}>
            <button className="al-user-pill" onClick={() => setDropOpen(v => !v)}>
              <div className="al-user-avatar">{initials}</div>
              <span>{userName}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {dropOpen && (
              <div className="al-user-dropdown">
                <div className="al-dropdown-name">{userName}</div>
                <div className="al-dropdown-email">{user?.email}</div>
                <hr className="al-dropdown-divider"/>
                <button className="al-dropdown-item al-dropdown-logout" onClick={handleLogout}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  {t('admin.logout') || 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="al-body">
        <aside className={`al-sidebar${sidebarOpen ? " al-sidebar-open" : ""}`}>
          {NAV.map(section => (
            <nav key={section.label} className="al-nav-section">
              <div className="al-section-label">{t(`admin.${section.sectionKey}`) || section.label}</div>
              {section.links.map(link => (
                <NavLink key={link.to} to={link.to} end={link.end}
                  className={({ isActive }) => `al-nav-link${isActive ? ' active' : ''}`}>
                  <NavIcon d={link.icon} d2={link.icon2} />
                  {t(`admin.${link.labelKey}`) || link.label}
                </NavLink>
              ))}
            </nav>
          ))}

        </aside>
        {sidebarOpen && (
          <div className="al-sidebar-overlay" onClick={()=>setSidebarOpen(false)}/>
        )}
        <main className="al-main" onClick={()=>{ if(sidebarOpen) setSidebarOpen(false); }}>{children}</main>
      </div>

      <AdminBottomNav />
    </div>
  );
}
