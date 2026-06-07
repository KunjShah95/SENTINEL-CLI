import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback } from "react";
import { DialogSearchList } from "../dialog-search-list";
import { useTheme } from "../../providers/theme";
const ANALYZER_MODES = [
    { id: "quick", label: "Quick scan", description: "Fast analysis of recent changes" },
    { id: "full", label: "Full scan", description: "Run all available analyzers" },
    { id: "security", label: "Security audit", description: "Comprehensive security scan" },
    { id: "frontend", label: "Frontend", description: "React + TypeScript + A11y" },
    { id: "backend", label: "Backend", description: "Security + API + Performance" },
    { id: "container", label: "Container", description: "Docker + K8s security" },
    { id: "secrets", label: "Secrets", description: "Scan for secrets and sensitive data" },
    { id: "lint", label: "Lint", description: "Run ESLint and code quality checks" },
    { id: "complexity", label: "Complexity", description: "Analyze code complexity" },
    { id: "best-practices", label: "Best Practices", description: "Check against best practices" },
    { id: "multi-file", label: "Multi-File", description: "Cross-file dependency analysis" },
];
export function AnalyzeDialogContent({ onSelect }) {
    const { colors } = useTheme();
    const handleSelect = useCallback((item) => {
        onSelect(item.id);
    }, [onSelect]);
    return (_jsx(DialogSearchList, { items: ANALYZER_MODES, onSelect: handleSelect, filterFn: (item, query) => item.label.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase()), renderItem: (item, isSelected) => (_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: isSelected ? colors.selection : undefined, attributes: isSelected ? 1 : 0, children: item.label }), _jsx("text", { attributes: 2, children: item.description })] })), getKey: (item) => item.id, placeholder: "Search analyzers...", emptyText: "No matching analyzers" }));
}
