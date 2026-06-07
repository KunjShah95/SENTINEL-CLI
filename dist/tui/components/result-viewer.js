import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { TextAttributes } from '@opentui/core';
import { useTheme } from '../providers/theme';
const SEVERITY_COLORS = {
    critical: '#DC2626',
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#60A5FA',
    info: '#88C0D0',
};
const SEVERITY_ICONS = {
    critical: '\u2622',
    high: '\u26A0',
    medium: '\u25CF',
    low: '\u2193',
    info: '\u2139',
};
function IssueCard({ issue, icon, fg }) {
    const { colors } = useTheme();
    return (_jsxs("box", { flexDirection: "column", paddingY: 0.5, width: "100%", children: [_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: fg, children: icon }), _jsx("text", { attributes: 1, fg: fg, children: issue.title || 'Issue' }), issue.line ? (_jsxs("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: [":", issue.line] })) : null, issue.confidence ? (_jsxs("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: [Math.round(issue.confidence * 100), "%"] })) : null] }), _jsx("box", { paddingLeft: 2, children: _jsx("text", { attributes: TextAttributes.DIM, children: issue.message }) }), issue.file ? (_jsx("box", { paddingLeft: 2, children: _jsxs("text", { attributes: TextAttributes.DIM, fg: colors.info, children: ['\u2192', " ", issue.file] }) })) : null, issue.suggestion ? (_jsx("box", { paddingLeft: 2, children: _jsxs("text", { attributes: TextAttributes.DIM, fg: colors.success, children: ['\u2713', " ", issue.suggestion] }) })) : null, issue.tags && issue.tags.length > 0 ? (_jsx("box", { paddingLeft: 2, flexDirection: "row", gap: 1, children: issue.tags.slice(0, 4).map(t => (_jsxs("text", { attributes: TextAttributes.DIM, fg: colors.dimSeparator, children: ["#", t] }, t))) })) : null] }));
}
export function ResultViewer({ issues, title }) {
    const { colors } = useTheme();
    if (!issues || issues.length === 0) {
        return (_jsx("box", { padding: 2, children: _jsxs("text", { fg: colors.success, children: ['\u2713', " No issues found."] }) }));
    }
    const grouped = {};
    for (const issue of issues) {
        const sev = issue.severity || 'info';
        if (!grouped[sev])
            grouped[sev] = [];
        grouped[sev].push(issue);
    }
    const sevOrder = ['critical', 'high', 'medium', 'low', 'info'];
    const sorted = sevOrder.filter(s => grouped[s]);
    return (_jsxs("box", { flexDirection: "column", width: "100%", paddingY: 1, gap: 1, children: [title ? (_jsx("text", { attributes: 1, fg: colors.primary, children: title })) : null, _jsxs("text", { attributes: TextAttributes.DIM, children: [issues.length, " issue", issues.length !== 1 ? 's' : '', " found"] }), sorted.map(sev => {
                const items = grouped[sev];
                const color = SEVERITY_COLORS[sev] || colors.info;
                const icon = SEVERITY_ICONS[sev] || '\u25CF';
                return (_jsxs("box", { flexDirection: "column", width: "100%", children: [_jsxs("box", { border: ['bottom'], borderColor: colors.dimSeparator, paddingY: 0.5, flexDirection: "row", gap: 1, children: [_jsxs("text", { attributes: 1, fg: color, children: [icon, " ", sev.toUpperCase()] }), _jsx("text", { attributes: TextAttributes.DIM, children: items.length })] }), items.map((issue, i) => (_jsx(IssueCard, { issue: issue, icon: icon, fg: color }, i)))] }, sev));
            })] }));
}
