import { jsx as _jsx } from "@opentui/react/jsx-runtime";
import { isValidElement } from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootLayout } from './layouts/root-layout';
import { Home } from './screens/home';
import { Session } from './screens/session';
import { Dashboard } from './screens/dashboard';
const router = createMemoryRouter([
    {
        path: '/',
        element: _jsx(RootLayout, {}),
        children: [
            { index: true, element: _jsx(Home, {}) },
            { path: 'session', element: _jsx(Session, {}) },
            { path: 'dashboard', element: _jsx(Dashboard, {}) },
        ],
    },
]);
function App() {
    return _jsx(RouterProvider, { router: router });
}
// Do not initialize the renderer until we've validated the element tree
// to avoid invoking native renderer code (Bun/FFI) during preflight.
// Preflight: walk the React element tree to catch any plain string children
// being attached to non-<text> hosts which would crash the OpenTUI renderer.
function inspectForBareStrings(node, path = []) {
    const problems = [];
    function visit(n, p) {
        if (n == null)
            return;
        if (typeof n === 'string' || typeof n === 'number') {
            // parent path is where this bare string sits
            problems.push({
                path: p.join(' > ') || '<root>',
                parentType: p[p.length - 1] || null,
                child: n,
            });
            return;
        }
        if (Array.isArray(n)) {
            n.forEach((c, i) => visit(c, [...p, `[${i}]`]));
            return;
        }
        if (isValidElement(n)) {
            const type = n.type;
            const display = typeof type === 'string'
                ? type
                : (type && (type.name || type.displayName)) || String(type);
            const nextPath = [...p, display];
            const props = n.props || {};
            if (props.children)
                visit(props.children, nextPath);
            return;
        }
        // plain object (could be a fragment-like) – attempt to inspect children
        if (typeof n === 'object' && n.props && n.props.children) {
            visit(n.props.children, [...p, String(n.type || 'object')]);
        }
    }
    visit(node, path);
    return problems;
}
const appElement = _jsx(App, {});
const found = inspectForBareStrings(appElement);
if (found.length > 0) {
    console.error('OpenTUI preflight detected bare string children that will crash the renderer:');
    found.slice(0, 20).forEach((f, i) => {
        console.error(`${i + 1}. at ${f.path} -> ${JSON.stringify(f.child)}`);
    });
    if (found.length > 20)
        console.error(`...and ${found.length - 20} more`);
    console.error('Please wrap these values in <text> nodes. Aborting render to avoid crash.');
    process.exit(1);
}
const renderer = await createCliRenderer({
    targetFps: 60,
    exitOnCtrlC: false,
});
process.on('SIGINT', () => {
    renderer.destroy();
    process.exit(0);
});
createRoot(renderer).render(appElement);
