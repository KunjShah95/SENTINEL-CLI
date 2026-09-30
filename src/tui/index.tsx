import './enter-workdir.js';
import React from 'react';
import { render } from 'ink';
import { Session } from './screens/session.js';
import { ErrorBoundary } from './components/error-boundary.js';
import { ThemeProvider } from './providers/theme/index.js';
import { ToastProvider } from './providers/toast/index.js';
import { DialogProvider } from './providers/dialog/index.js';

// Kick off model discovery in background — replaces the hardcoded model list
// with live data from provider APIs. Falls back gracefully if APIs are down.
import('../shared/models/index.js').then(m => m.refreshModels()).catch(() => {});

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <DialogProvider>
            <Session />
          </DialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

try {
  render(<App />);
} catch (e) {
  console.error('Failed to start Sentinel TUI:', e instanceof Error ? e.message : e);
  process.exit(1);
}
