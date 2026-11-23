import { Suspense, lazy } from 'react';

// Loaded only for /w/<token> links, so the app itself never carries it.
const SharedWorkoutPage = lazy(() => import('./SharedWorkoutPage.jsx'));

export default function SharedWorkoutEntry({ token }) {
  return <Suspense fallback={null}><SharedWorkoutPage token={token} /></Suspense>;
}
