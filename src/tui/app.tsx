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
 *
 * The height is `frameSize().rows` — the terminal minus its bottom row, see
 * `frameSize` for why. Every overlay reads the same number, so a dialog still
 * covers the app exactly.
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

/**
 * Options for the one `render()` call that mounts the TUI.
 *
 * `incrementalRendering` is the flicker fix. The frame is a fixed-height
 * screen, so a keystroke changes one or two composer rows out of ~30. Ink's
 * default repaints by erasing the frame and rewriting all of it — ~8KB per
 * character on a real session, which flickers visibly — while the diffing
 * writer rewrites only the lines that changed.
 *
 * Exported so the regression test can mount the app exactly as the app mounts
 * it, instead of testing a configuration nothing ships with.
 */
export const RENDER_OPTIONS = { incrementalRendering: true } as const;
