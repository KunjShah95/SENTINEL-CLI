import { jsx as _jsx } from 'react/jsx-runtime';
import { ThemeProvider } from '../providers/theme/index.js';
import { ToastProvider } from '../providers/toast/index.js';
import { KeyboardLayerProvider } from '../providers/keyboard-layer/index.js';
import { DialogProvider } from '../providers/dialog/index.js';
import { PromptConfigProvider } from '../providers/prompt-config/index.js';
import { ThemedRoot } from './themed-root.js';
import { Outlet } from 'react-router';
import { ErrorBoundary } from '../components/error-boundary.js';
export function RootLayout() {
  return (_jsx(ThemeProvider, { children: _jsx(ToastProvider, { children: _jsx(KeyboardLayerProvider, { children: _jsx(DialogProvider, { children: _jsx(PromptConfigProvider, { children: _jsx(ThemedRoot, { children: _jsx(ErrorBoundary, { children: _jsx(Outlet, {}) }) }) }) }) }) }) }));
}
