import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback } from "react";
import { DialogSearchList } from "../dialog-search-list";
import { useTheme } from "../../providers/theme";
const SCAN_TARGETS = [
    { id: ".", label: "Current directory", description: "Scan entire project" },
    { id: "src", label: "Source code", description: "Scan src/ directory" },
    { id: "diff", label: "Staged changes", description: "Scan git diff only" },
    { id: "custom", label: "Custom path", description: "Specify a path to scan" },
];
export function ScanDialogContent({ onSelect }) {
    const { colors } = useTheme();
    const handleSelect = useCallback((item) => {
        onSelect(item.id);
    }, [onSelect]);
    return (_jsx(DialogSearchList, { items: SCAN_TARGETS, onSelect: handleSelect, filterFn: (item, query) => item.label.toLowerCase().includes(query.toLowerCase()), renderItem: (item, isSelected) => (_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: isSelected ? colors.selection : undefined, attributes: isSelected ? 1 : 0, children: item.label }), _jsx("text", { attributes: 2, children: item.description })] })), getKey: (item) => item.id, placeholder: "Select scan target...", emptyText: "No matching targets" }));
}
