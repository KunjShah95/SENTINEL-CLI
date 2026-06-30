import { jsx as _jsx } from 'react/jsx-runtime';
import { render } from 'ink';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootLayout } from './layouts/root-layout.js';
import { Home } from './screens/home.js';
import { Session } from './screens/session.js';
import { Dashboard } from './screens/dashboard.js';
import { Review } from './screens/review.js';
import { Loop } from './screens/loop.js';
// Kick off model discovery in background — replaces the hardcoded model list
// with live data from provider APIs. Falls back gracefully if APIs are down.
import('../shared/models/index.js').then(m => m.refreshModels()).catch(() => { });
const router = createMemoryRouter([
  {
    path: '/',
    element: _jsx(RootLayout, {}),
    children: [
      { index: true, element: _jsx(Home, {}) },
      { path: 'session', element: _jsx(Session, {}) },
      { path: 'dashboard', element: _jsx(Dashboard, {}) },
      { path: 'review', element: _jsx(Review, {}) },
      { path: 'loop', element: _jsx(Loop, {}) },
    ],
  },
]);
function App() {
  return _jsx(RouterProvider, { router: router });
}
render(_jsx(App, {}));
