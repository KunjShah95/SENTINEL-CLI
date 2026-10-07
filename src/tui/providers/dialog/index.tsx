import React, { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react';
import { Box, useInput } from 'ink';
import { Overlay } from '../../components/oc/overlay.js';
import type { DialogConfig } from './types.js';

type DialogContextValue = {
  open: (config: DialogConfig) => void;
  close: () => void;
  isOpen: boolean;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogConfig | null>(null);

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

  // Memoized: a fresh object literal on every render gave every consumer a new
  // `dialog` identity, so any effect or callback keyed on it re-ran on every
  // render and drove a setState loop ("Maximum update depth exceeded").
  const value = useMemo(
    () => ({ open, close, isOpen: !!dialog }),
    [open, close, dialog]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
      {/* Rendered AFTER children so the absolute overlay paints on top of the
          session instead of being pushed below it, off-screen. */}
      {dialog ? (
        <Overlay title={dialog.title} width={dialog.width} hint={dialog.closeOnEscape === false ? '' : 'esc'}>
          <Box flexDirection="column" width="100%">{dialog.children}</Box>
        </Overlay>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
