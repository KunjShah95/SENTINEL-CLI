import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Component } from 'react';
import { Box, Text } from 'ink';
/**
 * ErrorBoundary — catches rendering errors in the TUI and shows a
 * recoverable error screen instead of crashing the entire process.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (_jsxs(Box, { flexDirection: 'column', padding: 2, marginTop: 1, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: 'redBright', children: '⚠' }), _jsx(Text, { bold: true, color: 'redBright', children: 'Application Error' })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: 'Something went wrong while rendering.' }) }), this.state.error && (_jsx(Box, { marginTop: 1, borderStyle: 'single', borderColor: 'red', padding: 1, children: _jsx(Text, { color: 'red', children: this.state.error.message }) })), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: 'Type /new or /clear to recover, or restart the application.' }) })] }));
    }
    return this.props.children;
  }
}
