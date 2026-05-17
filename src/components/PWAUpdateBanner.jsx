import React from 'react';
import { usePWAUpdate } from '../hooks/usePWAUpdate';

/**
 * Slim update banner — appears at the bottom of the screen when a new
 * service-worker version is waiting. Respects dark mode via data-theme.
 *
 * Mount once near the root: <PWAUpdateBanner /> inside <App />.
 */
export default function PWAUpdateBanner() {
  const { needsUpdate, updateSW } = usePWAUpdate();

  if (!needsUpdate) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 20px',
        borderRadius: 12,
        background: 'var(--brand, #1ECAB8)',
        color: '#fff',
        fontSize: '0.88rem',
        fontWeight: 600,
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100vw - 32px)',
        animation: 'slideUp 0.3s ease',
      }}
    >
      <span>🆕 New version available</span>
      <button
        onClick={updateSW}
        style={{
          background: 'rgba(255,255,255,0.22)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff',
          padding: '5px 14px',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
      >
        Refresh
      </button>
    </div>
  );
}
