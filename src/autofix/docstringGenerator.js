/**
 * Docstring Generator
 *
 * Format-aware docstrings for 18+ languages:
 * JSDoc, Google Python, Javadoc, XML (C#), GoDoc, RustDoc, YARD (Ruby), etc.
 */

const LANGUAGE_DOC_FORMATS = {
  '.js': { type: 'jsdoc', lineComment: '//', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.jsx': { type: 'jsdoc', lineComment: '//', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.ts': { type: 'jsdoc', lineComment: '//', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.tsx': { type: 'jsdoc', lineComment: '//', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.py': { type: 'google', lineComment: '#', tripleQuote: '"""' },
  '.java': { type: 'javadoc', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.kt': { type: 'kdoc', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.cs': { type: 'xml', linePrefix: '/// ' },
  '.go': { type: 'godoc', lineComment: '// ' },
  '.rs': { type: 'rustdoc', linePrefix: '/// ' },
  '.rb': { type: 'yard', linePrefix: '# ' },
  '.php': { type: 'phpdoc', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.swift': { type: 'swift', linePrefix: '/// ' },
  '.cpp': { type: 'doxygen', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.c': { type: 'doxygen', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.h': { type: 'doxygen', blockStart: '/**', blockEnd: ' */', linePrefix: ' * ' },
  '.lua': { type: 'ldoc', linePrefix: '-- ' },
  '.r': { type: 'roxygen', linePrefix: '#\' ' },
};

export class DocstringGenerator {
  constructor(options = {}) {
    this.llmClient = options.llmClient || null;
  }

  /**
   * Generate docstrings for undocumented symbols in a file.
   */
  async generateForFile(filePath, content) {
    const ext = filePath.match(/\.\w+$/)?.[0] || '';
    const format = LANGUAGE_DOC_FORMATS[ext];
    if (!format) return [];

    const symbols = this.extractSymbols(filePath, content);
    const results = [];

    for (const symbol of symbols) {
      if (symbol.hasDocstring) continue;

      const docstring = await this.generateDocstring(symbol, format);
      if (docstring) {
        results.push({
          symbol: symbol.name,
          line: symbol.line,
          docstring,
          format: format.type,
        });
      }
    }

    return results;
  }

  /**
   * Extract function/class/method symbols from source code.
   */
  extractSymbols(filePath, content) {
    const symbols = [];
    const lines = content.split('\n');
    const ext = filePath.match(/\.\w+$/)?.[0] || '';

    const patterns = {
      '.js': [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/, /(?:export\s+)?class\s+(\w+)/, /(?:const|let)\s+(\w+)\s*=/],
      '.ts': [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/, /(?:export\s+)?class\s+(\w+)/, /(?:export\s+)?interface\s+(\w+)/, /(?:export\s+)?type\s+(\w+)/],
      '.py': [/def\s+(\w+)/, /class\s+(\w+)/],
      '.java': [/(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/, /class\s+(\w+)/],
      '.go': [/func\s+(\w+)/, /func\s+\(\w+\s+\*?\w+\)\s+(\w+)/, /type\s+(\w+)\s+struct/],
      '.rs': [/fn\s+(\w+)/, /pub\s+fn\s+(\w+)/, /struct\s+(\w+)/, /impl\s+(\w+)/],
    };

    const filePatterns = patterns[ext] || patterns['.js'] || [];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of filePatterns) {
        const match = lines[i].match(pattern);
        if (match) {
          // Check if previous lines have docstring
          const hasDocstring = this.hasDocstringBefore(lines, i, ext);
          symbols.push({
            name: match[1],
            line: i + 1,
            code: lines[i].trim(),
            hasDocstring,
          });
          break;
        }
      }
    }

    return symbols;
  }

  /**
   * Check if there's a docstring/comment before the given line.
   */
  hasDocstringBefore(lines, lineIndex, ext) {
    if (lineIndex === 0) return false;
    const prevLine = lines[lineIndex - 1].trim();

    if (ext === '.py') {
      // Check next line for triple-quote docstring
      if (lineIndex + 1 < lines.length) {
        return lines[lineIndex + 1].trim().startsWith('"""') || lines[lineIndex + 1].trim().startsWith("'''");
      }
    }

    return prevLine.endsWith('*/') || prevLine.startsWith('//') || prevLine.startsWith('#') || prevLine.startsWith('///') || prevLine.startsWith('*');
  }

  /**
   * Generate a docstring for a symbol.
   */
  async generateDocstring(symbol, format) {
    const description = `TODO: Describe ${symbol.name}`;
    const params = this.extractParams(symbol.code);

    switch (format.type) {
    case 'jsdoc':
      return this.formatJSDoc(description, params);
    case 'google':
      return this.formatGooglePython(description, params);
    case 'javadoc':
    case 'phpdoc':
    case 'kdoc':
    case 'doxygen':
      return this.formatBlockDoc(description, params, format);
    case 'godoc':
      return `// ${symbol.name} ${description.toLowerCase()}`;
    case 'rustdoc':
      return this.formatRustDoc(description, params);
    case 'yard':
      return this.formatYARD(description, params);
    case 'xml':
      return this.formatXMLDoc(description, params);
    case 'swift':
      return this.formatSwiftDoc(description, params);
    default:
      return `${format.lineComment || '//'} ${description}`;
    }
  }

  extractParams(code) {
    const paramMatch = code.match(/\(([^)]*)\)/);
    if (!paramMatch || !paramMatch[1]) return [];
    return paramMatch[1].split(',').map(p => p.trim().split(/[\s:=]/)[0]).filter(Boolean);
  }

  formatJSDoc(description, params) {
    let doc = '/**\n';
    doc += ` * ${description}\n`;
    for (const p of params) {
      doc += ` * @param {*} ${p} - \n`;
    }
    doc += ' */';
    return doc;
  }

  formatGooglePython(description, params) {
    let doc = `"""\n    ${description}\n`;
    if (params.length > 0) {
      doc += '\n    Args:\n';
      for (const p of params) {
        if (p !== 'self') doc += `        ${p}: \n`;
      }
    }
    doc += '    """';
    return doc;
  }

  formatBlockDoc(description, params, format) {
    let doc = `${format.blockStart}\n`;
    doc += `${format.linePrefix}${description}\n`;
    for (const p of params) {
      doc += `${format.linePrefix}@param ${p} - \n`;
    }
    doc += format.blockEnd;
    return doc;
  }

  formatRustDoc(description, params) {
    let doc = `/// ${description}\n`;
    if (params.length > 0) {
      doc += '///\n';
      doc += '/// # Arguments\n';
      for (const p of params) {
        doc += `/// * \`${p}\` - \n`;
      }
    }
    return doc;
  }

  formatYARD(description, params) {
    let doc = `# ${description}\n`;
    for (const p of params) {
      doc += `# @param ${p} [Object] \n`;
    }
    return doc;
  }

  formatXMLDoc(description, params) {
    let doc = `/// <summary>\n`;
    doc += `/// ${description}\n`;
    doc += `/// </summary>\n`;
    for (const p of params) {
      doc += `/// <param name="${p}"></param>\n`;
    }
    return doc;
  }

  formatSwiftDoc(description, params) {
    let doc = `/// ${description}\n`;
    for (const p of params) {
      doc += `/// - Parameter ${p}: \n`;
    }
    return doc;
  }
}

export default DocstringGenerator;
