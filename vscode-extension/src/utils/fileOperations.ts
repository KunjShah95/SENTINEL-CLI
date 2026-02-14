import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

export class FileOperations {
    async readFile(filePath: string): Promise<string> {
        try {
            const content = await readFileAsync(filePath, 'utf8');
            return content;
        } catch (error: any) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            await writeFileAsync(filePath, content, 'utf8');
        } catch (error: any) {
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            await statAsync(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async searchFiles(pattern: string, rootPath?: string): Promise<string[]> {
        const searchPath = rootPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!searchPath) {
            throw new Error('No workspace folder open');
        }

        const results: string[] = [];
        const regex = new RegExp(pattern, 'i');

        async function searchDir(dir: string): Promise<void> {
            const entries = await readdirAsync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await searchDir(fullPath);
                } else if (entry.isFile() && regex.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        }

        await searchDir(searchPath);
        return results;
    }

    async getFileInfo(filePath: string): Promise<{
        size: number;
        modified: Date;
        isDirectory: boolean;
    }> {
        const stats = await statAsync(filePath);
        return {
            size: stats.size,
            modified: stats.mtime,
            isDirectory: stats.isDirectory()
        };
    }

    async listDirectory(dirPath: string): Promise<string[]> {
        const entries = await readdirAsync(dirPath, { withFileTypes: true });
        return entries.map(e => e.name);
    }

    getRelativePath(filePath: string): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return filePath;
        return path.relative(workspaceRoot, filePath);
    }

    getAbsolutePath(relativePath: string): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return relativePath;
        return path.join(workspaceRoot, relativePath);
    }
}
