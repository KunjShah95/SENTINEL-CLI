import { jsx as _jsx } from "@opentui/react/jsx-runtime";
import { isValidElement, cloneElement } from "react";
import { useTheme } from "../providers/theme";
function wrapStringNode(node, key) {
    // wrap plain strings/numbers into a <text> node to satisfy renderer requirements
    return typeof node === "string" || typeof node === "number" ? _jsx("text", { children: String(node) }, key) : node;
}
function deepNormalize(node, path = "root") {
    if (node == null)
        return null;
    if (typeof node === "string" || typeof node === "number")
        return wrapStringNode(node);
    if (Array.isArray(node))
        return node.map((child, i) => deepNormalize(child, `${path}[${i}]`));
    if (isValidElement(node)) {
        const props = node.props || {};
        if (props.children) {
            const normalizedChildren = deepNormalize(props.children, `${path}.${node.type}`);
            // only clone if children changed to avoid unnecessary re-renders
            if (normalizedChildren !== props.children) {
                return cloneElement(node, { ...props }, normalizedChildren);
            }
        }
        return node;
    }
    return node;
}
export function ThemedRoot({ children }) {
    const { colors } = useTheme();
    const normalized = deepNormalize(children, 'root');
    return (_jsx("box", { backgroundColor: colors.background, width: "100%", height: "100%", flexGrow: 1, children: normalized }));
}
