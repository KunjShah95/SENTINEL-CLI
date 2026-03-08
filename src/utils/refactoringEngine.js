/**
 * Multi-File Refactoring System
 *
 * Provides AST-aware refactoring across multiple files for:
 * - Function renaming
 * - Variable renaming
 * - Import/export refactoring
 * - Component extraction
 * 
 * Uses simple regex-based patterns for MVP, with hooks for Tree-sitter integration
 */

import { EnhancedFileOperations, TextEdit } from './enhancedFileOperations.js';

/**
 * Refactoring operation that can span multiple files
 */
export class RefactoringOperation {
  constructor(name, description = '') {
    this.name = name;
    this.description = description;
    this.changes = new Map(); // file -> edits
  }

  addChange(filePath, edits) {
    this.changes.set(filePath, edits);
  }

  getChanges() {
    return Object.fromEntries(this.changes);
  }

  async apply(fileOps, preview = false) {
    const results = [];

    for (const [filePath, edits] of this.changes) {
      const result = await fileOps.editWithDiff(filePath, edits, { preview });
      results.push({
        file: filePath,
        success: result.success,
        error: result.error,
        summary: result.summary
      });
    }

    return {
      operationName: this.name,
      filesAffected: this.changes.size,
      results
    };
  }
}

/**
 * Multi-file refactoring engine
 */
export class RefactoringEngine {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.fileOps = new EnhancedFileOperations(projectPath);
    this.astCache = new Map();
  }

  /**
   * Rename a function across the codebase
   * 
   * Limitations: Regex-based. For full accuracy, use Tree-sitter.
   */
  async renameFunction(oldName, newName, options = {}) {
    const {
      filePattern = '**/*.{js,ts,jsx,tsx}',
      preview = false
    } = options;

    const refactoring = new RefactoringOperation(
      `Rename function: ${oldName} → ${newName}`,
      `Rename all occurrences of function ${oldName} to ${newName}`
    );

    const files = await this.fileOps.glob(filePattern);

    for (const filePath of files.files) {
      const { content } = await this.fileOps.read(filePath);

      if (!content) continue;

      const edits = this.findFunctionReferences(content, oldName, newName);

      if (edits.length > 0) {
        refactoring.addChange(filePath, edits);
      }
    }

    return await refactoring.apply(this.fileOps, preview);
  }

  /**
   * Rename a variable across the codebase
   */
  async renameVariable(oldName, newName, options = {}) {
    const {
      filePattern = '**/*.{js,ts,jsx,tsx}',
      preview = false,
      scope = null // Can be restricted to a function/class
    } = options;

    const refactoring = new RefactoringOperation(
      `Rename variable: ${oldName} → ${newName}`,
      `Rename variable ${oldName} to ${newName}`
    );

    const files = await this.fileOps.glob(filePattern);

    for (const filePath of files.files) {
      const { content } = await this.fileOps.read(filePath);

      if (!content) continue;

      const edits = this.findVariableReferences(content, oldName, newName, scope);

      if (edits.length > 0) {
        refactoring.addChange(filePath, edits);
      }
    }

    return await refactoring.apply(this.fileOps, preview);
  }

  /**
   * Rename a class across the codebase
   */
  async renameClass(oldName, newName, options = {}) {
    const {
      filePattern = '**/*.{js,ts,jsx,tsx}',
      preview = false
    } = options;

    const refactoring = new RefactoringOperation(
      `Rename class: ${oldName} → ${newName}`,
      `Rename class ${oldName} to ${newName}`
    );

    const files = await this.fileOps.glob(filePattern);

    for (const filePath of files.files) {
      const { content } = await this.fileOps.read(filePath);

      if (!content) continue;

      const edits = this.findClassReferences(content, oldName, newName);

      if (edits.length > 0) {
        refactoring.addChange(filePath, edits);
      }
    }

    return await refactoring.apply(this.fileOps, preview);
  }

  /**
   * Update imports/exports when moving a file
   */
  async updateImportsForMove(oldPath, newPath, options = {}) {
    const { preview = false } = options;

    // Calculate relative path change
    const oldDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newDir = newPath.substring(0, newPath.lastIndexOf('/'));

    const refactoring = new RefactoringOperation(
      `Update imports: ${oldPath} → ${newPath}`,
      `Update all imports when moving file from ${oldPath} to ${newPath}`
    );

    // Find all files that import from oldPath
    const files = await this.fileOps.glob('**/*.{js,ts,jsx,tsx}');

    for (const filePath of files.files) {
      const { content } = await this.fileOps.read(filePath);

      if (!content) continue;

      // Find imports from oldPath
      const importRegex = /from\s+['"`]([^'"`]+oldPath[^'"`]*)['"` ]/g;
      let match;
      const edits = [];

      while ((match = importRegex.exec(content)) !== null) {
        const oldImport = match[1];
        const newImport = this.calculateNewImportPath(oldImport, oldDir, newDir);

        if (oldImport !== newImport) {
          edits.push(
            new TextEdit(null, null, oldImport, newImport)
          );
        }
      }

      if (edits.length > 0) {
        refactoring.addChange(filePath, edits);
      }
    }

    return await refactoring.apply(this.fileOps, preview);
  }

  /**
   * Extract code into a new function
   */
  async extractFunction(
    selectedCode,
    functionName,
    targetFile,
    options = {}
  ) {
    const { preview = false, parameters = [] } = options;

    const refactoring = new RefactoringOperation(
      `Extract function: ${functionName}`,
      `Extract code into a new function ${functionName}`
    );

    // Read target file
    const { content } = await this.fileOps.read(targetFile);

    if (!content) {
      return { success: false, error: 'Cannot read target file' };
    }

    // Generate function code
    const paramStr = parameters.map(p => p.name).join(', ');
    const functionCode = `function ${functionName}(${paramStr}) {\n  ${selectedCode}\n}\n\n`;

    // Find insertion point (before first export or at end)
    const insertionPoint = content.lastIndexOf('export') !== -1
      ? content.lastIndexOf('export')
      : content.length;

    const newContent = content.substring(0, insertionPoint) + 
                      functionCode + 
                      content.substring(insertionPoint);

    refactoring.addChange(targetFile, [
      new TextEdit(null, null, content, newContent)
    ]);

    return await refactoring.apply(this.fileOps, preview);
  }

  /**
   * Find function definition and all references
   */
  findFunctionReferences(content, oldName, newName) {
    const edits = [];

    // Match function definitions
    const definitionRegex = new RegExp(
      `((?:export\\s+)?(?:async\\s+)?function\\s+)${oldName}(\\s*\\()`,
      'g'
    );

    let match;
    while ((match = definitionRegex.exec(content)) !== null) {
      const searchStr = `${match[1]}${oldName}${match[2]}`;
      const replaceStr = `${match[1]}${newName}${match[2]}`;
      edits.push(new TextEdit(null, null, searchStr, replaceStr));
    }

    // Match function calls
    const callRegex = new RegExp(
      `\\b${oldName}(?!\\w)(?=\\s*\\()`,
      'g'
    );

    while ((match = callRegex.exec(content)) !== null) {
      edits.push(
        new TextEdit(null, null, oldName, newName)
      );
    }

    return edits;
  }

  /**
   * Find variable references
   */
  findVariableReferences(content, oldName, newName, _scope = null) {
    const edits = [];

    // Simple word-boundary matching (limited without scope analysis)
    const varRegex = new RegExp(`\\b${oldName}\\b`, 'g');

    while ((varRegex.exec(content)) !== null) {
      edits.push(
        new TextEdit(null, null, oldName, newName)
      );
    }

    return edits;
  }

  /**
   * Find class references
   */
  findClassReferences(content, oldName, newName) {
    const edits = [];

    // Class definition
    const definitionRegex = new RegExp(
      `(class\\s+)${oldName}\\b`,
      'g'
    );

    while ((definitionRegex.exec(content)) !== null) {
      edits.push(
        new TextEdit(null, null, oldName, newName)
      );
    }

    // Class instantiation and references
    const refRegex = new RegExp(`\\b${oldName}\\b`, 'g');
    while ((refRegex.exec(content)) !== null) {
      edits.push(
        new TextEdit(null, null, oldName, newName)
      );
    }

    return edits;
  }

  /**
   * Calculate new import path when file moves
   */
  calculateNewImportPath(importPath, oldDir, newDir) {
    // Very simplified; in production, use proper path resolution
    if (importPath === oldDir) {
      return newDir;
    }

    // Try to adjust relative path
    const pathSegments = importPath.split('/');
    const oldSegments = oldDir.split('/');
    const newSegments = newDir.split('/');

    // Find common base
    let commonBase = 0;
    for (let i = 0; i < Math.min(oldSegments.length, newSegments.length); i++) {
      if (oldSegments[i] === newSegments[i]) {
        commonBase = i + 1;
      } else {
        break;
      }
    }

    const upLevels = oldSegments.length - commonBase;
    const newImportSegments = Array(upLevels).fill('..');
    newImportSegments.push(...newSegments.slice(commonBase));
    newImportSegments.push(...pathSegments.slice(oldSegments.length - commonBase));

    return newImportSegments.join('/');
  }

  /**
   * Get refactoring preview without applying changes
   */
  async preview(operation) {
    return operation.apply(this.fileOps, true);
  }
}

export default RefactoringEngine;
