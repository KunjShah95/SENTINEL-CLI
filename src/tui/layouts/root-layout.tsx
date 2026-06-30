import React from 'react';
import { ThemeProvider } from '../providers/theme/index.js';
import { ToastProvider } from '../providers/toast/index.js';
import { KeyboardLayerProvider } from '../providers/keyboard-layer/index.js';
import { DialogProvider } from '../providers/dialog/index.js';
import { PromptConfigProvider } from '../providers/prompt-config/index.js';
import { ThemedRoot } from './themed-root.js';
import { Outlet } from 'react-router';
import { ErrorBoundary } from '../components/error-boundary.js';

export function RootLayout() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <KeyboardLayerProvider>
          <DialogProvider>
            <PromptConfigProvider>
              <ThemedRoot>
                <ErrorBoundary>
                  <Outlet />
                </ErrorBoundary>
              </ThemedRoot>
            </PromptConfigProvider>
          </DialogProvider>
        </KeyboardLayerProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
