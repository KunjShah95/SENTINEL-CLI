import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { TextAttributes } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { Sessions } from '../lib/api-client';
import { useTheme } from '../providers/theme';
import { useKeyboardLayer } from '../providers/keyboard-layer';
const PANEL_LAYER_ID = 'session-panel';
function relativeDate(dateStr) {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
        return 'just now';
    if (mins < 60)
        return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}h ago`;
    if (hours < 48)
        return 'yesterday';
    const days = Math.floor(hours / 24);
    if (days < 30)
        return `${days}d ago`;
    return date.toLocaleDateString();
}
function truncate(str, max) {
    if (str.length <= max)
        return str;
    return str.slice(0, max - 1) + '\u2026';
}
function getModeColor(mode, colors) {
    switch (mode) {
        case 'BUILD': return colors.success;
        case 'PLAN': return colors.planMode;
        case 'SCAN': return colors.info;
        case 'FIX': return colors.error;
        default: return colors.dimSeparator;
    }
}
const EmptyBorder = {
    topLeft: '',
    bottomLeft: '',
    vertical: '',
    topRight: '',
    bottomRight: '',
    horizontal: ' ',
    bottomT: '',
    topT: '',
    cross: '',
    leftT: '',
    rightT: '',
};
export function SessionPanel({ currentSessionId, onSelect, onFork, onDelete, onClose, }) {
    const { colors } = useTheme();
    const { push, pop, isTopLayer } = useKeyboardLayer();
    const [sessions, setSessions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const layerPushed = useRef(false);
    const loadSessions = useCallback(async () => {
        setLoading(true);
        try {
            const list = await Sessions.list();
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setSessions(list);
            setSelectedIndex((prev) => Math.min(prev, Math.max(0, list.length - 1)));
        }
        catch {
            setSessions([]);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        loadSessions();
    }, [loadSessions]);
    useEffect(() => {
        push(PANEL_LAYER_ID);
        layerPushed.current = true;
        return () => {
            if (layerPushed.current) {
                pop(PANEL_LAYER_ID);
                layerPushed.current = false;
            }
        };
    }, [push, pop]);
    const handleDelete = useCallback(async (id) => {
        try {
            await Sessions.delete(id);
            onDelete(id);
            await loadSessions();
        }
        catch {
            // silent
        }
    }, [loadSessions, onDelete]);
    useKeyboard((key) => {
        if (!isTopLayer(PANEL_LAYER_ID))
            return;
        if (key.name === 'escape') {
            pop(PANEL_LAYER_ID);
            layerPushed.current = false;
            onClose();
            return;
        }
        if (key.name === 'up') {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.name === 'down') {
            setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
            return;
        }
        if (key.name === 'return' || key.name === 'enter') {
            const session = sessions[selectedIndex];
            if (session) {
                pop(PANEL_LAYER_ID);
                layerPushed.current = false;
                onSelect(session.id);
            }
            return;
        }
        if (key.name === 'd') {
            const session = sessions[selectedIndex];
            if (session)
                handleDelete(session.id);
            return;
        }
        if (key.name === 'f') {
            const session = sessions[selectedIndex];
            if (session) {
                pop(PANEL_LAYER_ID);
                layerPushed.current = false;
                onFork(session.id);
            }
            return;
        }
        if (key.name === 'n') {
            pop(PANEL_LAYER_ID);
            layerPushed.current = false;
            onClose();
            return;
        }
    });
    return (_jsxs("box", { flexDirection: "column", width: 28, height: "100%", border: ['left'], borderColor: colors.dimSeparator, customBorderChars: { ...EmptyBorder, vertical: '\u2503', bottomLeft: '\u2579', topLeft: '\u257A' }, children: [_jsx("box", { paddingX: 1, paddingY: 1, backgroundColor: colors.surface, children: _jsx("text", { fg: colors.primary, attributes: TextAttributes.BOLD, children: "Sessions" }) }), _jsx("scrollbox", { flexGrow: 1, width: "100%", children: loading ? (_jsx("box", { paddingX: 1, paddingY: 1, children: _jsx("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: "Loading..." }) })) : sessions.length === 0 ? (_jsx("box", { paddingX: 1, paddingY: 1, children: _jsx("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: "No sessions yet" }) })) : (sessions.map((session, i) => {
                    const isSelected = i === selectedIndex;
                    const isActive = session.id === currentSessionId;
                    return (_jsxs("box", { flexDirection: "column", paddingX: 1, paddingY: 0, children: [_jsx("box", { flexDirection: "row", gap: 1, children: _jsxs("text", { fg: isActive ? colors.primary : (isSelected ? colors.selection : undefined), attributes: isActive ? TextAttributes.BOLD : (isSelected ? TextAttributes.BOLD : undefined), children: [isSelected ? '> ' : '  ', truncate(session.title, 24)] }) }), _jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: getModeColor(session.mode, colors), attributes: TextAttributes.DIM, children: session.mode }), _jsx("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: relativeDate(session.createdAt) })] })] }, session.id));
                })) }), _jsx("box", { paddingX: 1, paddingY: 1, children: _jsx("text", { fg: colors.primary, children: "+ New Session" }) }), _jsx("box", { paddingX: 1, paddingBottom: 1, children: _jsxs("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: ['\u2191\u2193', " navigate | Enter select | f fork | d del | n new"] }) })] }));
}
