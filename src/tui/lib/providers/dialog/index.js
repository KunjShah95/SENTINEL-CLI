import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { createContext, useContext, useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useKeyboardLayer } from '../keyboard-layer/index.js';
import { useTheme } from '../theme/index.js';
const DialogContext = createContext(null);
export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const { push, pop } = useKeyboardLayer();
  const { colors } = useTheme();
  const close = useCallback(() => {
    setDialog(null);
    pop('dialog');
  }, [pop]);
  const open = useCallback((config) => {
    setDialog(config);
    push('dialog');
  }, [push]);
  useInput((input, key) => {
    if (dialog && key.escape) {
      close();
    }
  });
  return (_jsxs(DialogContext.Provider, { value: { open, close, isOpen: !!dialog }, children: [children, dialog ? (_jsx(Box, { flexDirection: 'column', paddingX: 2, paddingY: 1, children: _jsxs(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: colors.dimSeparator, width: dialog.width ?? 60, padding: 1, children: [_jsx(Box, { paddingBottom: 1, children: _jsx(Text, { bold: true, children: dialog.title }) }), dialog.children] }) })) : null] }));
}
export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx)
    throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
