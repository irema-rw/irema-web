import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './AdminBottomNav.css';

function NavIcon({ d, d2, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const MoreIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="5"  r="1" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>
  </svg>
);

/* Primary bar — 4 most-used pages */
const PRIMARY = [
  {
    to: '/admin', label: 'Dashboard', end: true,
    d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    d2: 'M9 22V12h6v10',
  },
  {
    to: '/admin/users', label: 'Users',
    d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
    d2: 'M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
  },
  {
    to: '/admin/reviews', label: 'Reviews',
    d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  },
  {
    to: '/admin/reports', label: 'Reports',
    d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  },
];

/* More sheet — secondary pages */
const MORE = [
  {
    to: '/admin/analytics', label: 'Analytics',
    d: 'M18 20V10M12 20V4M6 20v-6',
  },
  {
    to: '/admin/businesses', label: 'Businesses',
    d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  },
  {
    to: '/admin/claims', label: 'Claims',
    d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  {
    to: '/admin/subscriptions', label: 'Billing',
    d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z',
  },
  {
    to: '/admin/administrators', label: 'Admins',
    d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  },
  {
    to: '/admin/stories', label: 'Stories',
    d: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.871V15.13a1 1 0 0 1-1.447.9L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
  },
  {
    to: '/admin/blog', label: 'Blog',
    d: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  },
  {
    to: '/admin/settings', label: 'Settings',
    d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  },
  {
    to: '/admin/two-factor', label: '2FA',
    d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10 M9 12l2 2 4-4',
  },
];

function isActive(item, pathname) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(item.to + '/');
}

export default function AdminBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef(null);

  /* Close sheet on outside tap */
  useEffect(() => {
    if (!moreOpen) return;
    function onOutside(e) {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [moreOpen]);

  /* Body padding class */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const apply = () => {
      if (mq.matches) document.body.classList.add('admin-has-bottom-nav');
      else             document.body.classList.remove('admin-has-bottom-nav');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      document.body.classList.remove('admin-has-bottom-nav');
    };
  }, []);

  const moreIsActive = MORE.some(item => isActive(item, location.pathname));

  function go(to) {
    navigate(to);
    setMoreOpen(false);
  }

  return (
    <>
      {/* ── Bottom bar ── */}
      <nav className="abn-bar" aria-label="Admin navigation">
        {PRIMARY.map(item => {
          const active = isActive(item, location.pathname);
          return (
            <button
              key={item.to}
              className={`abn-item${active ? ' abn-active' : ''}`}
              onClick={() => go(item.to)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="abn-icon">
                <NavIcon d={item.d} d2={item.d2} />
              </span>
              <span className="abn-label">{item.label}</span>
              {active && <span className="abn-dot" />}
            </button>
          );
        })}

        {/* More button */}
        <button
          className={`abn-item${moreIsActive || moreOpen ? ' abn-active' : ''}`}
          onClick={() => setMoreOpen(v => !v)}
          aria-label="More"
          aria-expanded={moreOpen}
        >
          <span className="abn-icon"><MoreIcon /></span>
          <span className="abn-label">More</span>
        </button>
      </nav>

      {/* ── Overlay ── */}
      {moreOpen && <div className="abn-overlay" onClick={() => setMoreOpen(false)} />}

      {/* ── More sheet ── */}
      <div className={`abn-sheet${moreOpen ? ' abn-sheet-open' : ''}`} ref={sheetRef}>
        <div className="abn-sheet-handle" />
        <div className="abn-sheet-title">More</div>
        <div className="abn-sheet-grid">
          {MORE.map(item => {
            const active = isActive(item, location.pathname);
            return (
              <button
                key={item.to}
                className={`abn-sheet-item${active ? ' abn-sheet-active' : ''}`}
                onClick={() => go(item.to)}
              >
                <span className="abn-sheet-icon">
                  <NavIcon d={item.d} size={24} />
                </span>
                <span className="abn-sheet-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
