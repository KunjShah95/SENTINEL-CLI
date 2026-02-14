export declare class FileOperations {
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<void>;
    fileExists(filePath: string): Promise<boolean>;
    searchFiles(pattern: string, rootPath?: string): Promise<string[]>;
    getFileInfo(filePath: string): Promise<{
        size: number;
        modified: Date;
        isDirectory: boolean;
    }>;
    listDirectory(dirPath: string): Promise<string[]>;
    getRelativePath(filePath: string): string;
    getAbsolutePath(relativePath: string): string;
}
//# sourceMappingURL=fileOperations.d.ts.map