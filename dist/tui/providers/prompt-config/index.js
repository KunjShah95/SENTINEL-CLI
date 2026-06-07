import { jsx as _jsx } from "@opentui/react/jsx-runtime";
/**
 * Prompt-config provider — current mode (BUILD/PLAN) and selected model.
 *
 * Mirrors packages/cli/src/providers/prompt-config/index.tsx from Nightcode.
 * Defaults to BUILD mode and `claude-sonnet-4-6` (the parity default).
 *
 * Sentinel also supports SCAN and FIX modes for the security platform, but
 * the AI coding agent chat only uses BUILD and PLAN.
 */
import { createContext, useCallback, useContext, useState } from "react";
import { Mode } from "../../../shared/schemas/mode.js";
import { SUPPORTED_CHAT_MODELS, DEFAULT_CHAT_MODEL_ID, } from "../../../shared/models/index.js";
const PromptConfigContext = createContext(null);
export function PromptConfigProvider({ children }) {
    const [mode, setMode] = useState(Mode.BUILD);
    const [model, setModel] = useState(DEFAULT_CHAT_MODEL_ID);
    const toggleMode = useCallback(() => {
        setMode((prev) => (prev === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
    }, []);
    return (_jsx(PromptConfigContext.Provider, { value: {
            mode,
            model,
            toggleMode,
            setMode,
            setModel,
            availableModels: SUPPORTED_CHAT_MODELS,
        }, children: children }));
}
export function usePromptConfig() {
    const ctx = useContext(PromptConfigContext);
    if (!ctx)
        throw new Error("usePromptConfig must be used within PromptConfigProvider");
    return ctx;
}
