import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { InputBar } from './input-bar';
import { Spinner } from './spinner';
import { StatusBar } from './status-bar';
export function SessionShell({ children, onSubmit, onCommand, onSlashCommand, inputDisabled = false, loading = false, mode = 'BUILD', onModeToggle, onCommandPalette, model, statusText, }) {
    return (_jsxs("box", { flexDirection: "column", flexGrow: 1, width: "100%", height: "100%", paddingY: 1, paddingX: 2, gap: 1, children: [_jsx("scrollbox", { flexGrow: 1, width: "100%", stickyScroll: true, stickyStart: "bottom", children: _jsx("box", { flexDirection: "column", children: (() => {
                        const c = children;
                        if (c == null)
                            return null;
                        if (typeof c === 'string' || typeof c === 'number')
                            return _jsx("text", { children: c });
                        if (Array.isArray(c))
                            return c.map((item, i) => typeof item === 'string' || typeof item === 'number' ? (_jsx("text", { children: item }, i)) : (item));
                        return c;
                    })() }) }), loading ? (_jsx("box", { flexShrink: 0, paddingLeft: 1, children: _jsx(Spinner, { mode: mode }) })) : null, _jsx("box", { flexShrink: 0, children: _jsx(InputBar, { onSubmit: onSubmit, onCommand: onCommand, onSlashCommand: onSlashCommand, disabled: inputDisabled, mode: mode, onModeToggle: onModeToggle, onCommandPalette: onCommandPalette }) }), _jsxs("box", { flexShrink: 0, flexDirection: "row", justifyContent: "space-between", width: "100%", height: 1, gap: 2, paddingLeft: 1, children: [_jsx(StatusBar, { mode: mode, model: model, statusText: statusText }), _jsx("box", { flexDirection: "row", gap: 1, children: _jsx("text", { children: "Tab: Mode | Ctrl+P: Commands" }) })] })] }));
}
