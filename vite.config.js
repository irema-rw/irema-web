import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Precache all Vite-generated assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        runtimeCaching: [
          // Images — CacheFirst, 30 days, max 60 entries
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'irema-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts stylesheets — StaleWhileRevalidate
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'irema-google-fonts-stylesheets',
              expiration: { maxEntries: 5, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          // Google Fonts webfonts — CacheFirst (long-lived)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'irema-google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Firestore / Firebase API — NetworkFirst with 10s timeout
          {
            urlPattern: /^https:\/\/(firestore|firebase)\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'irema-firestore',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Firebase Auth / Storage — NetworkFirst
          {
            urlPattern: /^https:\/\/(identitytoolkit|securetoken|firebasestorage)\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'irema-firebase-auth-storage',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Irema — Trusted Business Reviews',
        short_name: 'Irema',
        description: "Rwanda's trusted platform for honest, transparent business reviews across East Africa",
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#1ECAB8',
        background_color: '#e6faf6',
        lang: 'en',
        categories: ['business', 'lifestyle'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        shortcuts: [
          {
            name: 'Find a business',
            short_name: 'Search',
            url: '/businesses',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Share a review',
            short_name: 'Review',
            url: '/businesses',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': '/src' } },
  server: { historyApiFallback: true },
  preview: { historyApiFallback: true },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk — React + Router
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Firebase core
          'vendor-firebase-app': ['firebase/app'],
          'vendor-firebase-auth': ['firebase/auth'],
          'vendor-firebase-firestore': ['firebase/firestore'],
          'vendor-firebase-storage': ['firebase/storage'],
          // i18n
          'vendor-i18n': ['i18next', 'react-i18next'],
          // State
          'vendor-state': ['zustand'],
          // Admin pages bundle
          'admin': [
            './src/pages/admin/AdminDashboard.jsx',
            './src/pages/admin/AdminUsers.jsx',
            './src/pages/admin/AdminBusinesses.jsx',
            './src/pages/admin/AdminReviews.jsx',
            './src/pages/admin/AdminClaims.jsx',
            './src/pages/admin/AdminAudit.jsx',
            './src/pages/admin/AdminAnalytics.jsx',
            './src/pages/admin/AdminSettings.jsx',
            './src/pages/admin/AdminRoles.jsx',
            './src/pages/admin/AdminReports.jsx',
            './src/pages/admin/AdminAdministrators.jsx',
            './src/pages/admin/AdminSubscriptions.jsx',
            './src/pages/admin/AdminIntegrations.jsx',
            './src/pages/admin/AdminTwoFactor.jsx',
          ],
        },
      },
    },
  },
})
