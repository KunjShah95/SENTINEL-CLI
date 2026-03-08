import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import * as babel from '@babel/core';
import * as parserBabel from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

/**
 * MultiFileRefactor - Multi-file refactoring with AST-aware tools
 * Supports JavaScript/TypeScript refactoring using Babel
 */
export class MultiFileRefactor {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Get all JS/TS files in the project
   */
  async getAllFiles(patterns = ['**/*.{js,jsx,ts,tsx}'], options = {}) {
    try {
      const files = await glob(patterns, {
        cwd: this.projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**'],
        ...options
      });
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath) {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectPath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return { success: true, content, path: fullPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse JavaScript/TypeScript to AST
   */
  parseToAST(content, { isJSX = false, isTS = false } = {}) {
    try {
      const ast = parserBabel.parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'decorators-legacy',
          'exportNamespaceFrom',
          'dynamicImport',
          'optionalChaining',
          'nullishCoalescingOperator',
          ...(isJSX ? ['jsx'] : []),
          ...(isTS ? ['typescript'] : [])
        ]
      });
      return { success: true, ast };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate code from AST
   */
  generateFromAST(ast) {
    try {
      const output = babel.transformFromAstSync(ast, null, {
        comments: true,
        compact: false,
        retainLines: false
      });
      return { success: true, code: output.code };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Find and replace function names across files
   */
  async renameFunction(oldName, newName, _options = {}) {
    const files = await this.getAllFiles();
    const changes = [];

    for (const file of files) {
      const result = await this.readFile(file);
      if (!result.success) continue;

      const parseResult = this.parseToAST(result.content, {
        isJSX: result.content.includes('<'),
        isTS: result.content.includes('typescript') || file.endsWith('.ts') || file.endsWith('.tsx')
      });

      if (!parseResult.success) continue;

      let modified = false;
      const ast = parseResult.ast;

      traverse(ast, {
        Identifier(path) {
          if (path.node.name === oldName) {
            path.node.name = newName;
            modified = true;
          }
        },
        Property(path) {
          if (path.node.key.name === oldName) {
            path.node.key.name = newName;
            modified = true;
          }
        }
      });

      if (modified) {
        const generateResult = this.generateFromAST(ast);
        if (generateResult.success) {
          changes.push({
            file,
            changeType: 'rename_function',
            oldName,
            newName,
            content: generateResult.code
          });
        }
      }
    }

    return { success: true, changes };
  }

  /**
   * Extract function to a new module
   */
  async extractFunction(functionName, newModuleName, _options = {}) {
    const files = await this.getAllFiles();
    const changes = [];

    for (const file of files) {
      const result = await this.readFile(file);
      if (!result.success) continue;

      const parseResult = this.parseToAST(result.content);
      if (!parseResult.success) continue;

      const ast = parseResult.ast;
      let extracted = false;

      // Find the function definition
      traverse(ast, {
        FunctionDeclaration(path) {
          if (path.node.id?.name === functionName) {
            // Extract function to new file
            const functionCode = babel.transformFromAstSync(
              t.program([path.node]),
              null,
              { compact: false }
            ).code;

            changes.push({
              file: path.join(newModuleName, `${functionName}.js`),
              changeType: 'new_file',
              content: functionCode
            });

            // Replace with import in original file
            path.replaceWith(
              t.importDeclaration(
                [t.importDefaultSpecifier(t.identifier(functionName))],
                t.stringLiteral(`./${newModuleName}/${functionName}`)
              )
            );

            extracted = true;
          }
        }
      });

      if (extracted) {
        const generateResult = this.generateFromAST(ast);
        if (generateResult.success) {
          changes.push({
            file,
            changeType: 'extract_function',
            functionName,
            content: generateResult.code
          });
        }
      }
    }

    return { success: true, changes };
  }

  /**
   * Extract class to new module
   */
  async extractClass(className, newModuleName, _options = {}) {
    const files = await this.getAllFiles();
    const changes = [];

    for (const file of files) {
      const result = await this.readFile(file);
      if (!result.success) continue;

      const parseResult = this.parseToAST(result.content);
      if (!parseResult.success) continue;

      const ast = parseResult.ast;
      let extracted = false;

      traverse(ast, {
        ClassDeclaration(path) {
          if (path.node.id?.name === className) {
            // Extract class to new file
            const classCode = babel.transformFromAstSync(
              t.program([path.node]),
              null,
              { compact: false }
            ).code;

            changes.push({
              file: path.join(newModuleName, `${className}.js`),
              changeType: 'new_file',
              content: classCode
            });

            // Replace with import in original file
            path.replaceWith(
              t.importDeclaration(
                [t.importDefaultSpecifier(t.identifier(className))],
                t.stringLiteral(`./${newModuleName}/${className}`)
              )
            );

            extracted = true;
          }
        }
      });

      if (extracted) {
        const generateResult = this.generateFromAST(ast);
        if (generateResult.success) {
          changes.push({
            file,
            changeType: 'extract_class',
            className,
            content: generateResult.code
          });
        }
      }
    }

    return { success: true, changes };
  }

  /**
   * Create a diff preview for changes
   */
  async createDiff(changes) {
    const diffs = [];

    for (const change of changes) {
      if (change.changeType === 'new_file') {
        diffs.push({
          type: 'create',
          file: change.file,
          content: change.content
        });
      } else if (change.changeType === 'extract_function' || change.changeType === 'extract_class') {
        diffs.push({
          type: 'modify',
          file: change.file,
          oldContent: null, // Would need original content for diff
          newContent: change.content
        });
      }
    }

    return diffs;
  }

  /**
   * Apply multi-file refactoring
   */
  async applyRefactoring(changes) {
    const results = [];

    for (const change of changes) {
      if (change.changeType === 'new_file') {
        // Create new file
        const dir = path.dirname(change.file);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(this.projectPath, change.file), change.content, 'utf-8');
        results.push({ file: change.file, action: 'created', success: true });
      } else if (change.changeType === 'extract_function' || change.changeType === 'extract_class') {
        // Modify existing file
        await fs.writeFile(path.join(this.projectPath, change.file), change.content, 'utf-8');
        results.push({ file: change.file, action: 'modified', success: true });
      }
    }

    return { success: true, results };
  }

  /**
   * Bulk rename across files (safe version with preview)
   */
  async bulkRename(oldPattern, newPattern, _options = {}) {
    const files = await this.getAllFiles();
    const changes = [];

    for (const file of files) {
      const result = await this.readFile(file);
      if (!result.success) continue;

      const content = result.content;
      const matches = content.match(new RegExp(oldPattern, 'g'));

      if (matches && matches.length > 0) {
        const newContent = content.replace(new RegExp(oldPattern, 'g'), newPattern);
        changes.push({
          file,
          oldContent: content,
          newContent,
          matches: matches.length
        });
      }
    }

    return { success: true, changes };
  }

  /**
   * Generate code from specification
   */
  async generateFromSpec(spec, _options = {}) {
    const { type, name, properties = {} } = spec;

    let template = '';

    switch (type) {
      case 'component':
        template = this.generateReactComponent(name, properties);
        break;
      case 'route':
        template = this.generateExpressRoute(name, properties);
        break;
      case 'model':
        template = this.generateModel(name, properties);
        break;
      case 'function':
        template = this.generateFunction(name, properties);
        break;
      case 'test':
        template = this.generateTest(name, properties);
        break;
      default:
        template = `// Generated code for ${type}: ${name}\n`;
    }

    return { success: true, code: template, spec };
  }

  /**
   * Generate React component
   */
  generateReactComponent(name, { props = [], state = [], withTests = false } = {}) {
    const propList = props.map(p => `${p.name}${p.required ? '' : '?'}: ${p.type}`).join(', ');
    const propArgs = props.map(p => p.name).join(', ');

    let component = `import React, { useState } from 'react';

export interface ${name}Props {
${propList ? `  ${propList}` : '  // props'}
}

export const ${name}: React.FC<${name}Props> = ({ ${propArgs} }) => {
${state.map(s => `  const [${s.name}, set${s.name.charAt(0).toUpperCase() + s.name.slice(1)}] = useState<${s.type}>(${s.initialValue || 'null'});`).join('\n')
}

  return (
    <div className="${name.toLowerCase()}">
      {/* ${name} component */}
    </div>
  );
};

export default ${name};
`;

    if (withTests) {
      component += `\n\n// Tests\n// import { render, screen } from '@testing-library/react';\n// import { ${name} } from './${name}';`;
    }

    return component;
  }

  /**
   * Generate Express route
   */
  generateExpressRoute(name, { method = 'get', path, handlerName = 'handler' } = {}) {
    return `const express = require('express');
const router = express.Router();

// ${method.toUpperCase()} ${path || '/'}
router.${method}('${path || '/'}', ${handlerName});

module.exports = router;
`;
  }

  /**
   * Generate model
   */
  generateModel(name, { fields = [] } = {}) {
    const fieldDefs = fields.map(f => `  ${f.name}: ${f.type}${f.required ? '' : ' | null'}`).join(',\n');

    return `export interface ${name} {
${fieldDefs}
}
`;
  }

  /**
   * Generate function
   */
  generateFunction(name, { args = [], returnType = 'void', async = false } = {}) {
    const argList = args.map(a => `${a.name}: ${a.type}`).join(', ');

    return `export${async ? ' async' : ''} function ${name}(${argList}): ${returnType} {
  // ${name} implementation
  ${returnType === 'void' ? '' : 'return null;'}
}
`;
  }

  /**
   * Generate test
   */
  generateTest(name, { description = '', imports = [] } = {}) {
    const importList = imports.join('\n');

    return `${importList}

describe('${description || name}', () => {
  it('should work', () => {
    // Test ${name}
    expect(true).toBe(true);
  });
});
`;
  }
}

export default MultiFileRefactor;
