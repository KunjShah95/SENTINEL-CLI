import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import { useKeyboardLayer } from '../keyboard-layer/index.js';
import { useTheme } from '../theme/index.js';
import type { DialogConfig } from './types.js';

type DialogContextValue = {
  open: (config: DialogConfig) => void;
  close: () => void;
  isOpen: boolean;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const { push, pop } = useKeyboardLayer();
  const { colors } = useTheme();

  const close = useCallback(() => {
    setDialog(null);
    pop('dialog');
  }, [pop]);

  const open = useCallback(
    (config: DialogConfig) => {
      setDialog(config);
      push('dialog');
    },
    [push]
  );

  useInput((input, key) => {
    if (dialog && key.escape) {
      close();
    }
  });

  return (
    <DialogContext.Provider value={{ open, close, isOpen: !!dialog }}>
      {children}
      {dialog ? (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.dimSeparator}
            width={dialog.width ?? 60}
            padding={1}
          >
            <Box paddingBottom={1}>
              <Text bold>{dialog.title}</Text>
            </Box>
            {dialog.children}
          </Box>
        </Box>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
