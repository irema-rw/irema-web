import React, { useState, useEffect, useRef } from 'react';
import './BizBottomNav.css';

/* SVG helper — renders a path string (may contain multiple M segments) */
function NavIcon({ d, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={(i > 0 ? 'M' : '') + seg} />
      ))}
    </svg>
  );
}

/* Primary tab IDs always visible in the bar */
const PRIMARY_IDS = ['overview', 'reviews', 'analytics', 'notifications'];

/* More icon */
const MoreIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="5"  r="1" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>
  </svg>
);

export default function BizBottomNav({ section, setSection, unreadCount = 0, navItems = [] }) {
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

  /* Body padding */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const apply = () => {
      if (mq.matches) document.body.classList.add('biz-has-bottom-nav');
      else             document.body.classList.remove('biz-has-bottom-nav');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      document.body.classList.remove('biz-has-bottom-nav');
    };
  }, []);

  const primaryItems = navItems.filter(n => PRIMARY_IDS.includes(n.id));
  const moreItems    = navItems.filter(n => !PRIMARY_IDS.includes(n.id));
  const moreIsActive = moreItems.some(n => n.id === section);

  function go(id) {
    setSection(id);
    setMoreOpen(false);
  }

  return (
    <>
      {/* ── Bottom bar ── */}
      <nav className="biz-bottom-nav" aria-label="Business dashboard navigation">
        {primaryItems.map(item => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              className={`biz-bn-item${active ? ' biz-bn-active' : ''}`}
              onClick={() => go(item.id)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="biz-bn-icon">
                <NavIcon d={item.icon} />
                {item.id === 'notifications' && unreadCount > 0 && (
                  <span className="biz-bn-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </span>
              <span className="biz-bn-label">{item.label}</span>
              {active && <span className="biz-bn-dot" />}
            </button>
          );
        })}

        {/* ── More button ── */}
        {moreItems.length > 0 && (
          <button
            className={`biz-bn-item${moreIsActive || moreOpen ? ' biz-bn-active' : ''}`}
            onClick={() => setMoreOpen(v => !v)}
            aria-label="More"
            aria-expanded={moreOpen}
          >
            <span className="biz-bn-icon"><MoreIcon /></span>
            <span className="biz-bn-label">More</span>
          </button>
        )}
      </nav>

      {/* ── More sheet overlay ── */}
      {moreOpen && <div className="biz-bn-overlay" onClick={() => setMoreOpen(false)} />}

      {/* ── More sheet ── */}
      <div className={`biz-bn-sheet${moreOpen ? ' biz-bn-sheet-open' : ''}`} ref={sheetRef}>
        <div className="biz-bn-sheet-handle" />
        <div className="biz-bn-sheet-title">More</div>
        <div className="biz-bn-sheet-grid">
          {moreItems.map(item => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                className={`biz-bn-sheet-item${active ? ' biz-bn-sheet-active' : ''}`}
                onClick={() => go(item.id)}
              >
                <span className="biz-bn-sheet-icon">
                  <NavIcon d={item.icon} size={24} />
                </span>
                <span className="biz-bn-sheet-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
