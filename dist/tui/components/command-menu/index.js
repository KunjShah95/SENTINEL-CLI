import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes } from '@opentui/core';
import { useKeyboardLayer } from '../../providers/keyboard-layer';
import { useTheme } from '../../providers/theme';
import { getFilteredCommands } from './commands';
import { recordCommand } from '../../lib/command-mru';
const MAX_VISIBLE = 8;
export function CommandMenu({ onClose, ctx }) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);
    const { isTopLayer, push, pop } = useKeyboardLayer();
    const { colors } = useTheme();
    useEffect(() => {
        push('command-menu');
        return () => pop('command-menu');
    }, [push, pop]);
    const filtered = getFilteredCommands(query);
    const handleChange = useCallback((value) => {
        setQuery(value);
        setSelectedIndex(0);
    }, []);
    const handleSubmit = useCallback((_value) => {
        if (filtered[selectedIndex]) {
            const cmd = filtered[selectedIndex];
            recordCommand(cmd.name);
            if (cmd.action) {
                cmd.action(ctx);
            }
            else {
                ctx.execute(cmd.value.replace(/^\//, ''));
            }
            onClose();
        }
    }, [filtered, selectedIndex, ctx, onClose]);
    useKeyboard(key => {
        if (!isTopLayer('command-menu'))
            return;
        if (key.name === 'up') {
            setSelectedIndex(prev => Math.max(0, prev - 1));
        }
        if (key.name === 'down') {
            setSelectedIndex(prev => Math.min(filtered.length - 1, prev + 1));
        }
        if (key.name === 'escape') {
            onClose();
        }
    });
    const visibleHeight = Math.min(filtered.length, MAX_VISIBLE);
    const getCategoryColor = (category) => {
        switch (category) {
            case 'general':
                return colors.info;
            case 'scan':
                return colors.warning;
            case 'git':
                return colors.primary;
            case 'actions':
                return colors.success;
            case 'settings':
                return colors.planMode;
            case 'output':
                return colors.info;
            case 'views':
                return colors.primary;
            case 'ci':
                return colors.warning;
            case 'server':
                return colors.info;
            default:
                return colors.dimSeparator;
        }
    };
    return (_jsx("box", { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", children: _jsx("box", { backgroundColor: "rgba(0,0,0,150)", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", children: _jsxs("box", { flexDirection: "column", backgroundColor: colors.dialogSurface, width: 70, padding: 1, gap: 1, children: [_jsx("input", { ref: inputRef, placeholder: "Type a command...", focused: true, onInput: handleChange, onSubmit: handleSubmit }), _jsx("scrollbox", { height: visibleHeight, children: filtered.map((cmd, i) => {
                            const isSelected = i === selectedIndex;
                            return (_jsxs("box", { flexDirection: "row", gap: 1, backgroundColor: isSelected ? colors.selection + '40' : undefined, paddingX: 1, paddingY: 0.5, children: [_jsx("text", { fg: getCategoryColor(cmd.category), width: 14, children: cmd.name }), _jsx("text", { attributes: TextAttributes.DIM, children: cmd.description })] }, cmd.value));
                        }) })] }) }) }));
}
