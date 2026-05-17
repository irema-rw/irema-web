import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useModalStore } from '../store/modalStore';
import './PWABottomNav.css';

// Detect standalone PWA mode (used only for body class, visibility is CSS-driven)
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

// Icons
const HomeIcon = (active) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={active ? 0 : 1.8}
    strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z M9 21V12h6v9"/>
  </svg>
);
const BizIcon = (active) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0}/>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <rect x="9" y="13" width="6" height="8" rx="1"
      fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.3 : 0}/>
    <rect x="9" y="13" width="6" height="8" rx="1"/>
  </svg>
);
const StarIcon = (active) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={active ? 0 : 1.8}
    strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const ReviewsIcon = (active) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={active ? 0 : 1.8}
    strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const ProfileIcon = (active) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={active ? 0 : 1.8}
    strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);

// Logged-out nav
const GUEST_LEFT  = [
  { to: '/', exact: true, label: 'Home', icon: HomeIcon },
  { to: '/businesses', label: 'Businesses', icon: BizIcon },
];
const GUEST_RIGHT = [
  { to: '/top-rated', label: 'Top Rated', icon: StarIcon },
  { to: '/reviews', label: 'All Reviews', icon: ReviewsIcon },
];

// Logged-in nav
const AUTH_LEFT  = [
  { to: '/', exact: true, label: 'Home', icon: HomeIcon },
  { to: '/top-rated', label: 'Top Rated', icon: StarIcon },
];
const AUTH_RIGHT = [
  { to: '/my-reviews', label: 'My Reviews', icon: ReviewsIcon },
  { to: '/profile', label: 'Profile', icon: ProfileIcon },
];

export default function PWABottomNav() {
  const location = useLocation();
  const user     = useAuthStore(s => s.user);
  const authLoading = useAuthStore(s => s.loading);
  const { openModal } = useModalStore();

  useEffect(() => {
    // Always mark body so CSS media queries can apply padding correctly
    document.body.classList.add('has-bottom-nav');
    if (isStandalone) document.body.classList.add('pwa-standalone');

    // Re-evaluate on resize so body padding stays correct when
    // viewport crosses the 1024px desktop breakpoint
    const mq = window.matchMedia('(max-width: 1024px)');
    const onMqChange = () => {
      if (mq.matches) {
        document.body.classList.add('has-bottom-nav');
      } else {
        // Only remove if not in standalone mode (standalone always shows bar)
        if (!isStandalone) document.body.classList.remove('has-bottom-nav');
      }
    };
    mq.addEventListener('change', onMqChange);

    return () => {
      mq.removeEventListener('change', onMqChange);
      document.body.classList.remove('has-bottom-nav');
      document.body.classList.remove('pwa-standalone');
    };
  }, []);

  if (location.pathname.startsWith('/admin')) return null;
  if (location.pathname.startsWith('/company-dashboard')) return null;

  // While Firebase is restoring the session (authLoading=true), treat user as
  // authenticated to prevent the nav from flashing to guest state on refresh.
  const isAuthed = authLoading || !!user;
  const navLeft  = isAuthed ? AUTH_LEFT  : GUEST_LEFT;
  const navRight = isAuthed ? AUTH_RIGHT : GUEST_RIGHT;

  // Full path including search for active matching
  const fullPath = location.pathname + location.search;

  function renderTab({ to, label, icon, exact, requireAuth }) {
    // Active: exact match on pathname, or for query-param routes match full path
    const toPath = to.split('?')[0];
    const toSearch = to.includes('?') ? to.slice(to.indexOf('?')) : '';
    let isActive;
    if (toSearch) {
      isActive = location.pathname === toPath && location.search === toSearch;
    } else if (exact) {
      isActive = location.pathname === toPath;
    } else {
      isActive = location.pathname.startsWith(toPath) && toPath !== '/';
    }

    if (requireAuth && !isAuthed) {
      return (
        <button
          key={to}
          className={`pwa-nav-item${isActive ? ' pwa-nav-active' : ''}`}
          aria-label={label}
          onClick={() => openModal('login')}
        >
          <span className="pwa-nav-icon">{icon(isActive)}</span>
          <span className="pwa-nav-label">{label}</span>
          {isActive && <span className="pwa-nav-dot" />}
        </button>
      );
    }

    return (
      <NavLink
        key={to}
        to={to}
        className={`pwa-nav-item${isActive ? ' pwa-nav-active' : ''}`}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="pwa-nav-icon">{icon(isActive)}</span>
        <span className="pwa-nav-label">{label}</span>
        {isActive && <span className="pwa-nav-dot" />}
      </NavLink>
    );
  }

  return (
    <nav className="pwa-bottom-nav" aria-label="Main navigation">
      {navLeft.map(tab => renderTab(tab))}

      {/* ── Centre CTA — Write Review ── */}
      <button
        className="pwa-nav-item pwa-nav-cta"
        onClick={() => openModal('writeReview')}
        aria-label="Write a Review"
      >
        <span className="pwa-cta-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="white"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            width="22" height="22">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </span>
        <span className="pwa-nav-label pwa-cta-label">Review</span>
      </button>

      {navRight.map(tab => renderTab(tab))}
    </nav>
  );
}
