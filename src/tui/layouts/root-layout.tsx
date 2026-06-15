import React from 'react';
import { Box, Text } from 'ink';
import { ThemeProvider } from '../providers/theme/index.js';
import { ToastProvider } from '../providers/toast/index.js';
import { KeyboardLayerProvider } from '../providers/keyboard-layer/index.js';
import { DialogProvider } from '../providers/dialog/index.js';
import { PromptConfigProvider } from '../providers/prompt-config/index.js';
import { ThemedRoot } from './themed-root.js';
import { Outlet } from 'react-router';

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    process.stderr.write(`[SENTINEL error] ${error.message}\n${info.componentStack ?? ''}\n`);
  }

  render() {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="red">SENTINEL encountered an error</Text>
          <Text color="red">{this.state.error.message}</Text>
          <Text dimColor>Press Ctrl+C to exit, or /new to start a fresh session.</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}

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
