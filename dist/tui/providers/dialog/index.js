import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { createContext, useContext, useState, useCallback } from 'react';
import { useKeyboardLayer } from '../keyboard-layer';
import { useTheme } from '../theme';
import { SentinelBorderChars } from '../../components/border';
const DialogContext = createContext(null);
export function DialogProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const { push, pop, isTopLayer } = useKeyboardLayer();
    const { colors } = useTheme();
    const close = useCallback(() => {
        setDialog(null);
        pop('dialog');
    }, [pop]);
    const open = useCallback((config) => {
        setDialog(config);
        push('dialog', (key) => {
            if (key === 'escape') {
                close();
                return true;
            }
            return false;
        });
    }, [push, close]);
    return (_jsxs(DialogContext.Provider, { value: { open, close, isOpen: !!dialog }, children: [children, dialog ? (_jsx("box", { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", children: _jsx("box", { backgroundColor: "rgba(0,0,0,150)", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", children: _jsxs("box", { flexDirection: "column", backgroundColor: colors.dialogSurface, border: SentinelBorderChars, borderColor: colors.dimSeparator, width: dialog.width ?? 60, height: dialog.height ?? 30, padding: 1, children: [_jsx("box", { paddingBottom: 1, children: _jsx("text", { attributes: 1, children: dialog.title }) }), (() => {
                                const c = dialog.children;
                                if (c == null)
                                    return null;
                                if (typeof c === 'string' || typeof c === 'number')
                                    return _jsx("text", { children: c });
                                if (Array.isArray(c))
                                    return c.map((item, i) => typeof item === 'string' || typeof item === 'number' ? (_jsx("text", { children: item }, i)) : (item));
                                return c;
                            })()] }) }) })) : null] }));
}
export function useDialog() {
    const ctx = useContext(DialogContext);
    if (!ctx)
        throw new Error('useDialog must be used within DialogProvider');
    return ctx;
}
