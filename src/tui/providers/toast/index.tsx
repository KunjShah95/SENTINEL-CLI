import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme/index.js';
import type { ToastOptions, ToastVariant } from './types.js';

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  show: (options: ToastOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const { colors } = useTheme();

  const show = useCallback(({ message, variant = 'info', duration = 3000 }: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const success = useCallback((message: string) => show({ message, variant: 'success' }), [show]);
  const error = useCallback((message: string) => show({ message, variant: 'error' }), [show]);
  const info = useCallback((message: string) => show({ message, variant: 'info' }), [show]);
  const warning = useCallback((message: string) => show({ message, variant: 'warning' }), [show]);

  const getBorderColor = (variant: ToastVariant) => {
    switch (variant) {
      case 'success': return colors.success;
      case 'error': return colors.error;
      case 'warning': return colors.warning;
      case 'info': return colors.info;
    }
  };

  return (
    <ToastContext.Provider value={{ show, success, error, info, warning }}>
      <Box flexGrow={1} width="100%" flexDirection="column">
        {children}
        {toasts.length > 0 ? (
          <Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
            {toasts.map((toast) => (
              <Box
                key={toast.id}
                borderStyle="single"
                borderColor={getBorderColor(toast.variant)}
                paddingX={2}
                paddingY={0}
              >
                <Text dimColor>{toast.message}</Text>
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
