import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTheme } from '../providers/theme';
const FRAMES = ['\u25D0', '\u25D3', '\u25D1', '\u25D2'];
export function Spinner({ mode = 'BUILD' }) {
    const { colors } = useTheme();
    const [frame, setFrame] = useState(0);
    const activeColor = mode === 'PLAN'
        ? colors.planMode
        : mode === 'REVIEW'
            ? colors.warning || colors.planMode
            : colors.primary;
    useEffect(() => {
        const id = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 120);
        return () => clearInterval(id);
    }, []);
    return (_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: activeColor, children: FRAMES[frame] }), _jsx("text", { fg: activeColor, children: "Processing..." })] }));
}
