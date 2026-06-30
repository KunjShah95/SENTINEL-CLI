import React from 'react';
import { render } from 'ink';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootLayout } from './layouts/root-layout.js';
import { Home } from './screens/home.js';
import { Session } from './screens/session.js';
import { Dashboard } from './screens/dashboard.js';
import { Review } from './screens/review.js';
import { Loop } from './screens/loop.js';
import { ErrorBoundary } from './components/error-boundary.js';

// Kick off model discovery in background — replaces the hardcoded model list
// with live data from provider APIs. Falls back gracefully if APIs are down.
import('../shared/models/index.js').then(m => m.refreshModels()).catch(() => {});

const router = createMemoryRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'session', element: <Session /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'review', element: <Review /> },
      { path: 'loop', element: <Loop /> },
    ],
  },
]);

function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

try {
  render(<App />);
} catch (e) {
  console.error('Failed to start Sentinel TUI:', e instanceof Error ? e.message : e);
  process.exit(1);
}
