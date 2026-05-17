import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Returns `{ needsUpdate, updateSW }`.
 * Render <PWAUpdateBanner /> wherever you want the toast to appear,
 * or use the returned values directly.
 */
export function usePWAUpdate() {
  const {
    needRefresh: [needsUpdate],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Poll for updates every 60 minutes while the app is open
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(err) {
      console.warn('[PWA] SW registration failed:', err);
    },
  });

  return { needsUpdate, updateSW: () => updateServiceWorker(true) };
}
