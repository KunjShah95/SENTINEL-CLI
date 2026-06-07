import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { useTheme } from "../providers/theme";
const MAX_VISIBLE_ITEMS = 6;
export function DialogSearchList({ items, onSelect, onHighlight, filterFn, renderItem, getKey, placeholder = "Search...", emptyText = "No results", }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [searchValue, setSearchValue] = useState("");
    const inputRef = useRef(null);
    const scrollRef = useRef(null);
    const { isTopLayer } = useKeyboardLayer();
    const { colors } = useTheme();
    const filtered = items.filter((item) => filterFn(item, searchValue));
    const handleChange = useCallback((value) => {
        setSearchValue(value);
        setSelectedIndex(0);
    }, []);
    const handleSubmit = useCallback((value) => {
        if (filtered[selectedIndex]) {
            onSelect(filtered[selectedIndex]);
        }
    }, [filtered, selectedIndex, onSelect]);
    useKeyboard((key) => {
        if (!isTopLayer("dialog"))
            return;
        if (key.name === "up" || key.name === "k") {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        }
        if (key.name === "down" || key.name === "j") {
            setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
        }
        if (key.name === "escape") {
            setSearchValue("");
        }
    });
    const visibleHeight = Math.min(filtered.length, MAX_VISIBLE_ITEMS);
    return (_jsxs("box", { flexDirection: "column", gap: 1, children: [_jsx("input", { ref: inputRef, placeholder: placeholder, focused: true, onInput: handleChange, onSubmit: handleSubmit }), filtered.length === 0 ? (_jsx("text", { attributes: TextAttributes.DIM, children: emptyText })) : (_jsx("scrollbox", { ref: scrollRef, height: visibleHeight, children: filtered.map((item, i) => {
                    const isSelected = i === selectedIndex;
                    return (_jsx("box", { flexDirection: "row", children: renderItem(item, isSelected) }, getKey(item)));
                }) }))] }));
}
