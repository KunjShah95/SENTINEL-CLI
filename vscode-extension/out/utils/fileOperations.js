"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOperations = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const readFileAsync = (0, util_1.promisify)(fs.readFile);
const writeFileAsync = (0, util_1.promisify)(fs.writeFile);
const readdirAsync = (0, util_1.promisify)(fs.readdir);
const statAsync = (0, util_1.promisify)(fs.stat);
class FileOperations {
    async readFile(filePath) {
        try {
            const content = await readFileAsync(filePath, 'utf8');
            return content;
        }
        catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }
    async writeFile(filePath, content) {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            await writeFileAsync(filePath, content, 'utf8');
        }
        catch (error) {
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }
    async fileExists(filePath) {
        try {
            await statAsync(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async searchFiles(pattern, rootPath) {
        const searchPath = rootPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!searchPath) {
            throw new Error('No workspace folder open');
        }
        const results = [];
        const regex = new RegExp(pattern, 'i');
        async function searchDir(dir) {
            const entries = await readdirAsync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await searchDir(fullPath);
                }
                else if (entry.isFile() && regex.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        }
        await searchDir(searchPath);
        return results;
    }
    async getFileInfo(filePath) {
        const stats = await statAsync(filePath);
        return {
            size: stats.size,
            modified: stats.mtime,
            isDirectory: stats.isDirectory()
        };
    }
    async listDirectory(dirPath) {
        const entries = await readdirAsync(dirPath, { withFileTypes: true });
        return entries.map(e => e.name);
    }
    getRelativePath(filePath) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot)
            return filePath;
        return path.relative(workspaceRoot, filePath);
    }
    getAbsolutePath(relativePath) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot)
            return relativePath;
        return path.join(workspaceRoot, relativePath);
    }
}
exports.FileOperations = FileOperations;
//# sourceMappingURL=fileOperations.js.map