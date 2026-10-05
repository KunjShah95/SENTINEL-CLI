import React, { type ReactNode } from 'react';
import { Box } from 'ink';
import { Session } from './screens/session.js';
import { ErrorBoundary } from './components/error-boundary.js';
import { ThemeProvider } from './providers/theme/index.js';
import { ToastProvider } from './providers/toast/index.js';
import { DialogProvider } from './providers/dialog/index.js';
import { useViewport } from './components/oc/overlay.js';

/**
 * Ink sizes the root to its content, so `flexGrow` had nothing to grow into:
 * the transcript, prompt and footer just stacked, and a long session pushed
 * the footer off the bottom of the terminal. Pinning the root to the terminal
 * size keeps the chrome where opencode keeps it and gives the absolutely
 * positioned overlays a real viewport to cover.
 */
export function Viewport({ children }: { children: ReactNode }) {
  const { rows, columns } = useViewport();
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {children}
    </Box>
  );
}

/** The whole TUI, minus process-level side effects (kept in index.tsx). */
export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <DialogProvider>
            <Viewport>
              <Session />
            </Viewport>
          </DialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}