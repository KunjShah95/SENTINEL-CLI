import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { EmptyBorder } from "../border";
const SPINNER_FRAMES = ["\u25D0", "\u25D3", "\u25D1", "\u25D2"];
function PendingSpinner() {
    const [frame, setFrame] = useState(0);
    const { colors } = useTheme();
    useEffect(() => {
        const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 120);
        return () => clearInterval(id);
    }, []);
    return _jsx("text", { fg: colors.info, children: SPINNER_FRAMES[frame] });
}
function ReasoningBlock({ text }) {
    const { colors } = useTheme();
    return (_jsx("box", { width: "100%", flexDirection: "column", paddingY: 1, children: _jsx("box", { border: ["left"], borderColor: colors.thinkingBorder, width: "100%", customBorderChars: { ...EmptyBorder, vertical: "\u2503" }, children: _jsx("box", { paddingX: 2, paddingY: 1, flexDirection: "column", width: "100%", children: _jsx("text", { attributes: TextAttributes.DIM, fg: colors.thinking, children: text }) }) }) }));
}
function ToolCallBlock({ part }) {
    const { colors } = useTheme();
    if (part.toolCall) {
        return (_jsx("box", { width: "100%", paddingY: 1, children: _jsx("box", { border: ["left"], borderColor: colors.info, width: "100%", customBorderChars: { ...EmptyBorder, vertical: "\u2503" }, children: _jsxs("box", { paddingX: 2, paddingY: 1, flexDirection: "column", width: "100%", children: [_jsxs("text", { fg: colors.info, children: ["\u2699", " ", part.toolCall.name] }), part.toolCall.args ? (_jsx("text", { attributes: TextAttributes.DIM, children: JSON.stringify(part.toolCall.args, null, 2) })) : null, part.toolCall.result ? (_jsxs("text", { attributes: TextAttributes.DIM, fg: colors.success, children: ["\u2713", " Done"] })) : null] }) }) }));
    }
    const isPending = part.state === "pending";
    const isDone = part.state === "output-available";
    const isError = part.state === "output-error";
    return (_jsx("box", { width: "100%", paddingY: 1, children: _jsx("box", { border: ["left"], borderColor: isError ? colors.error : colors.info, width: "100%", customBorderChars: { ...EmptyBorder, vertical: "\u2503" }, children: _jsxs("box", { paddingX: 2, paddingY: 1, flexDirection: "column", width: "100%", children: [_jsxs("box", { flexDirection: "row", gap: 1, children: [isPending ? _jsx(PendingSpinner, {}) : _jsx("text", { fg: colors.info, children: "\u2699" }), _jsx("text", { fg: isError ? colors.error : colors.info, children: part.toolName })] }), part.input !== undefined ? (_jsx("text", { attributes: TextAttributes.DIM, children: JSON.stringify(part.input, null, 2) })) : null, isPending ? (_jsx("text", { attributes: TextAttributes.DIM, children: "(running...)" })) : null, isDone ? (_jsx("text", { attributes: TextAttributes.DIM, children: part.output !== undefined
                            ? JSON.stringify(part.output).slice(0, 500)
                            : "" })) : null, isDone ? (_jsx("text", { attributes: TextAttributes.DIM, fg: colors.success, children: "Done" })) : null, isError && part.errorText ? (_jsxs("text", { attributes: TextAttributes.DIM, fg: colors.error, children: ["Error: ", part.errorText] })) : null] }) }) }));
}
export function BotMessage({ parts, model, duration }) {
    const { colors } = useTheme();
    if (parts.length === 0)
        return null;
    const grouped = parts.reduce((acc, part) => {
        const last = acc[acc.length - 1];
        if (last && last[0].type === part.type) {
            last.push(part);
        }
        else {
            acc.push([part]);
        }
        return acc;
    }, []);
    return (_jsxs("box", { width: "100%", flexDirection: "column", paddingY: 1, children: [grouped.map((group, gi) => {
                const type = group[0].type;
                if (type === "reasoning") {
                    return _jsx(ReasoningBlock, { text: group.map((p) => p.text).join("") }, gi);
                }
                if (type === "tool-call") {
                    return (_jsx("box", { flexDirection: "column", children: group.map((p, pi) => _jsx(ToolCallBlock, { part: p }, pi)) }, gi));
                }
                return (_jsx("box", { paddingX: 1, children: _jsx("text", { children: group.map((p) => p.text).join("") }) }, gi));
            }), model || duration ? (_jsxs("box", { flexDirection: "row", gap: 1, paddingX: 1, paddingTop: 1, children: [model ? (_jsx("text", { attributes: TextAttributes.DIM, fg: colors.info, children: model })) : null, duration ? (_jsxs("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: [duration, "ms"] })) : null] })) : null] }));
}
