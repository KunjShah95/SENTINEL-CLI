/**
 * Prompt-config provider — current mode (BUILD/PLAN) and selected model.
 *
 * Mirrors packages/cli/src/providers/prompt-config/index.tsx from Nightcode.
 * Defaults to BUILD mode and `claude-sonnet-4-6` (the parity default).
 *
 * Sentinel also supports SCAN and FIX modes for the security platform, but
 * the AI coding agent chat only uses BUILD and PLAN.
 */

import React, { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Mode } from "../../../shared/schemas/mode.js";
import {
  SUPPORTED_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
} from "../../../shared/models/index.js";

export type PromptConfig = {
  mode: keyof typeof Mode;
  model: string;
};

type PromptConfigContextValue = PromptConfig & {
  toggleMode: () => void;
  setMode: (mode: keyof typeof Mode) => void;
  setModel: (model: string) => void;
  availableModels: typeof SUPPORTED_CHAT_MODELS;
};

const PromptConfigContext = createContext<PromptConfigContextValue | null>(null);

export function PromptConfigProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<keyof typeof Mode>(Mode.BUILD);
  const [model, setModel] = useState<string>(DEFAULT_CHAT_MODEL_ID);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
  }, []);

  return (
    <PromptConfigContext.Provider
      value={{
        mode,
        model,
        toggleMode,
        setMode,
        setModel,
        availableModels: SUPPORTED_CHAT_MODELS,
      }}
    >
      {children}
    </PromptConfigContext.Provider>
  );
}

export function usePromptConfig(): PromptConfigContextValue {
  const ctx = useContext(PromptConfigContext);
  if (!ctx) throw new Error("usePromptConfig must be used within PromptConfigProvider");
  return ctx;
}
