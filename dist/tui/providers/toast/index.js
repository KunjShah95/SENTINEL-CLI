import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { createContext, useContext, useState, useCallback, useRef } from "react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../theme";
import { EmptyBorder } from "../../components/border";
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);
    const { colors } = useTheme();
    const show = useCallback(({ message, variant = "info", duration = 3000 }) => {
        const id = ++idRef.current;
        setToasts((prev) => [...prev, { id, message, variant }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);
    const success = useCallback((message) => show({ message, variant: "success" }), [show]);
    const error = useCallback((message) => show({ message, variant: "error" }), [show]);
    const info = useCallback((message) => show({ message, variant: "info" }), [show]);
    const warning = useCallback((message) => show({ message, variant: "warning" }), [show]);
    const getBorderColor = (variant) => {
        switch (variant) {
            case "success": return colors.success;
            case "error": return colors.error;
            case "warning": return colors.warning;
            case "info": return colors.info;
        }
    };
    return (_jsx(ToastContext.Provider, { value: { show, success, error, info, warning }, children: _jsxs("box", { flexGrow: 1, width: "100%", height: "100%", children: [(() => {
                    const c = children;
                    if (c == null)
                        return null;
                    if (typeof c === "string" || typeof c === "number")
                        return _jsx("text", { children: c });
                    if (Array.isArray(c))
                        return c.map((item, i) => (typeof item === "string" || typeof item === "number" ? _jsx("text", { children: item }, i) : item));
                    return c;
                })(), _jsx("box", { position: "absolute", top: 0, right: 0, flexDirection: "column", gap: 1, padding: 1, children: toasts.map((toast) => (_jsx("box", { border: ["left"], borderColor: getBorderColor(toast.variant), customBorderChars: { ...EmptyBorder, vertical: "\u2503", bottomLeft: "\u2579" }, backgroundColor: colors.surface, paddingX: 2, paddingY: 1, children: _jsx("text", { attributes: TextAttributes.DIM, children: toast.message }) }, toast.id))) })] }) }));
}
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx)
        throw new Error("useToast must be used within ToastProvider");
    return ctx;
}
