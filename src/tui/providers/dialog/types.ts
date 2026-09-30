import type { ReactNode } from "react";

export type DialogConfig = {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  width?: number;
  height?: number;
  /** Default true. Dialogs that must resolve a result on Esc (permission) handle it themselves. */
  closeOnEscape?: boolean;
};
