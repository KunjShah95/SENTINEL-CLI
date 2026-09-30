import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
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
  const { colors } = useTheme();

  const close = useCallback(() => {
    setDialog((d) => {
      d?.onClose?.();
      return null;
    });
  }, []);

  useInput((_input, key) => {
    if (key.escape && dialog && dialog.closeOnEscape !== false) close();
  }, { isActive: !!dialog });

  const open = useCallback(
    (config: DialogConfig) => {
      setDialog(config);
    },
    []
  );

  return (
    <DialogContext.Provider value={{ open, close, isOpen: !!dialog }}>
      {children}
      {dialog ? (
        // opencode ui/dialog: a panel-colored sheet, bold title left, "esc" right.
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Box
            flexDirection="column"
            width={dialog.width ?? 60}
            paddingX={2}
            paddingY={1}
            backgroundColor={colors.backgroundPanel}
          >
            <Box paddingBottom={1} flexDirection="row" justifyContent="space-between" width="100%">
              <Text bold color={colors.text}>{dialog.title}</Text>
              <Text color={colors.textMuted}>esc</Text>
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
