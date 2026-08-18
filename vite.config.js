import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate' documents the actual policy (see registerPWA.js's
      // onNeedRefresh 2026-08-18 change: updates now apply themselves the
      // instant they're found, not on a user tap) — but note the real
      // trigger for that is hand-rolled in registerPWA.js, not this option,
      // since injectRegister is false below and we own registration
      // ourselves. Kept in sync here so the config doesn't read as 'prompt'
      // (the default) when the app no longer behaves that way.
      registerType: 'autoUpdate',
      // We hand-write the service worker (src/sw.js) so it can keep the
      // existing push-notification handlers; injectManifest just splices in
      // the precache list at build time instead of generating a SW from
      // scratch.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // App shell only: precache the hashed JS/CSS bundle, index.html, the
        // offline fallback, and small brand icons. Deliberately excludes
        // public/videos, background/slide art, and the iOS splash set —
        // those are large and non-critical, so they load on demand instead
        // of bloating the precache / install size.
        globPatterns: ['**/*.{js,css,html}', 'logo.png', 'favicon.svg', 'icons.svg', 'manifest.webmanifest', 'icons/icon-*.png'],
        globIgnores: ['**/videos/**', '**/splash/**', '**/screenshots/**', '**/background-*.png', '**/slide-*.png', '**/gym_bg.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      // We already ship a hand-authored public/manifest.webmanifest linked
      // directly from index.html; don't let the plugin generate its own.
      manifest: false,
      injectRegister: false, // we register the SW ourselves in main.jsx for full control over the update flow
      devOptions: {
        enabled: false, // avoid SW caching confusion during local dev / HMR
      },
    }),
  ],
})
