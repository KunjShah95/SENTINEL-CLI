import React from 'react';
import { render } from 'ink';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootLayout } from './layouts/root-layout.js';
import { Home } from './screens/home.js';
import { Session } from './screens/session.js';
import { Dashboard } from './screens/dashboard.js';
import { Review } from './screens/review.js';
import { Loop } from './screens/loop.js';

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
  return <RouterProvider router={router} />;
}

render(<App />);
