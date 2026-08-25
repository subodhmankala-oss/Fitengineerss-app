// Test-only stand-in for the `virtual:pwa-register` module that
// vite-plugin-pwa injects at build/dev time. That virtual module doesn't
// exist under vitest's Node-based transform, so any component that imports
// it transitively (WorkoutTracker.jsx -> pwa/registerPWA.js) failed to even
// load in tests with "must be a file URL object... virtual:pwa-register".
// Aliased in here via vite.config.js's `test.alias` — see that file.
export function registerSW() {
  return () => {};
}
