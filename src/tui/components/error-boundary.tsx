import React, { Component, type ReactNode } from 'react';
import { Box, Text } from 'ink';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches rendering errors in the TUI and shows a
 * recoverable error screen instead of crashing the entire process.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={2} marginTop={1}>
          <Box flexDirection="row" gap={1}>
            <Text color="redBright">{'⚠'}</Text>
            <Text bold color="redBright">{'Application Error'}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              {'Something went wrong while rendering.'}
            </Text>
          </Box>
          {this.state.error && (
            <Box marginTop={1} borderStyle="single" borderColor="red" padding={1}>
              <Text color="red">{this.state.error.message}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>
              {'Type /new or /clear to recover, or restart the application.'}
            </Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}
