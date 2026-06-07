import { jsxs as _jsxs, jsx as _jsx } from "@opentui/react/jsx-runtime";
import { useCallback } from "react";
import { DialogSearchList } from "../dialog-search-list";
import { useTheme } from "../../providers/theme";
import { useDialog } from "../../providers/dialog";
export function ThemeDialogContent() {
    const { themes, setTheme, theme: currentTheme } = useTheme();
    const dialog = useDialog();
    const handleSelect = useCallback((t) => {
        setTheme(t.name);
        dialog.close();
    }, [setTheme, dialog]);
    return (_jsx(DialogSearchList, { items: themes, onSelect: handleSelect, filterFn: (item, query) => item.name.toLowerCase().includes(query.toLowerCase()), renderItem: (item, isSelected) => (_jsxs("text", { fg: isSelected ? currentTheme.colors.selection : undefined, children: [item.name === currentTheme.name ? " \u2022 " : "   ", item.name] })), getKey: (item) => item.name, placeholder: "Search themes...", emptyText: "No matching themes" }));
}
