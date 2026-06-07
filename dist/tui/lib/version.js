import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
let _version = null;
function findPackageJson() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(__dirname, '..', '..', '..', 'package.json'),
        join(__dirname, '..', '..', '..', '..', 'package.json'),
        join(process.cwd(), 'package.json'),
    ];
    for (const p of candidates) {
        try {
            return JSON.parse(readFileSync(p, 'utf-8')).version;
        }
        catch { }
    }
    return null;
}
export function getVersion() {
    if (_version)
        return _version;
    _version = findPackageJson() || '2.0.0';
    return _version;
}
export function getDisplayVersion() {
    return `v${getVersion()}`;
}
