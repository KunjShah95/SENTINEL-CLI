class RuleEngine {
  constructor(options = {}) {
    this.rules = new Map();
    this.operators = this.defineOperators();
    this.functions = this.defineFunctions();
    this.maxRecursionDepth = options.maxRecursionDepth || 10;
  }

  defineOperators() {
    return {
      // Comparison operators
      '==': (a, b) => a == b,
      '!=': (a, b) => a != b,
      '===': (a, b) => a === b,
      '!==': (a, b) => a !== b,
      '>': (a, b) => a > b,
      '>=': (a, b) => a >= b,
      '<': (a, b) => a < b,
      '<=': (a, b) => a <= b,
      
      // Logical operators
      '&&': (a, b) => a && b,
      '||': (a, b) => a || b,
      '!': (a) => !a,
      
      // String operators
      'contains': (a, b) => String(a).includes(b),
      'startsWith': (a, b) => String(a).startsWith(b),
      'endsWith': (a, b) => String(a).endsWith(b),
      'matches': (a, b) => new RegExp(b).test(String(a)),
      
      // Array operators
      'in': (a, b) => Array.isArray(b) && b.includes(a),
      'includes': (a, b) => Array.isArray(a) && a.includes(b),
      
      // Type operators
      'isType': (a, b) => typeof a === b,
      'isArray': (a) => Array.isArray(a),
      'isObject': (a) => typeof a === 'object' && a !== null && !Array.isArray(a),
      'isEmpty': (a) => {
        if (a === null || a === undefined) return true;
        if (typeof a === 'string') return a.length === 0;
        if (Array.isArray(a)) return a.length === 0;
        if (typeof a === 'object') return Object.keys(a).length === 0;
        return false;
      },
    };
  }

  defineFunctions() {
    return {
      // Math functions
      'abs': (a) => Math.abs(a),
      'min': (...args) => Math.min(...args),
      'max': (...args) => Math.max(...args),
      'sum': (arr) => arr.reduce((a, b) => a + b, 0),
      'avg': (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
      'round': (a, decimals = 0) => Number(a.toFixed(decimals)),
      
      // String functions
      'length': (a) => String(a).length,
      'uppercase': (a) => String(a).toUpperCase(),
      'lowercase': (a) => String(a).toLowerCase(),
      'trim': (a) => String(a).trim(),
      'split': (a, separator) => String(a).split(separator),
      'join': (arr, separator) => arr.join(separator),
      'replace': (a, search, replace) => String(a).replace(search, replace),
      'substring': (a, start, end) => String(a).substring(start, end),
      
      // Array functions
      'count': (arr) => arr.length,
      'first': (arr) => arr[0],
      'last': (arr) => arr[arr.length - 1],
      'filter': (arr, fn) => arr.filter(fn),
      'map': (arr, fn) => arr.map(fn),
      'sort': (arr) => [...arr].sort(),
      'reverse': (arr) => [...arr].reverse(),
      'unique': (arr) => [...new Set(arr)],
      'flatten': (arr) => arr.flat(),
      
      // Object functions
      'keys': (obj) => Object.keys(obj),
      'values': (obj) => Object.values(obj),
      'entries': (obj) => Object.entries(obj),
      'hasKey': (obj, key) => key in obj,
      'get': (obj, key, defaultValue) => obj[key] ?? defaultValue,
      
      // Date functions
      'now': () => Date.now(),
      'date': () => new Date().toISOString(),
      'year': () => new Date().getFullYear(),
      'month': () => new Date().getMonth() + 1,
      'day': () => new Date().getDate(),
      
      // Utility functions
      'if': (condition, trueValue, falseValue) => condition ? trueValue : falseValue,
      'coalesce': (...args) => args.find(arg => arg !== null && arg !== undefined),
      'default': (value, defaultValue) => value ?? defaultValue,
    };
  }

  // Parse rule from JSON or string
  parseRule(rule) {
    if (typeof rule === 'string') {
      return this.parseRuleString(rule);
    }
    return rule;
  }

  parseRuleString(ruleString) {
    // Simple parser for string-based rules
    // Supports: field operator value, AND, OR, NOT
    
    // Remove extra whitespace
    const clean = ruleString.trim().replace(/\s+/g, ' ');
    
    // Try to parse as JSON first
    try {
      return JSON.parse(clean);
    } catch {
      // Parse as expression
      return this.parseExpression(clean);
    }
  }

  parseExpression(expr) {
    // Handle AND/OR
    if (expr.includes(' AND ')) {
      const parts = expr.split(' AND ');
      return {
        and: parts.map(p => this.parseExpression(p.trim())),
      };
    }
    
    if (expr.includes(' OR ')) {
      const parts = expr.split(' OR ');
      return {
        or: parts.map(p => this.parseExpression(p.trim())),
      };
    }
    
    // Handle NOT
    if (expr.startsWith('NOT ')) {
      return {
        not: this.parseExpression(expr.slice(4)),
      };
    }
    
    // Handle comparison: field operator value
    const match = expr.match(/^(.+?)\s*(==|!=|>|<|>=|<=|contains|matches|in)\s*(.+)$/);
    if (match) {
      const [, field, operator, value] = match;
      return {
        field: field.trim(),
        operator: operator.trim(),
        value: this.parseValue(value.trim()),
      };
    }
    
    // Simple field check (truthy)
    return {
      field: expr,
      operator: 'isEmpty',
      value: false,
    };
  }

  parseValue(value) {
    // Try to parse as number
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    // Try to parse as boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Try to parse as null
    if (value === 'null') return null;
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    return value;
  }

  // Evaluate a rule against data
  evaluate(rule, data, context = {}, depth = 0) {
    if (depth > this.maxRecursionDepth) {
      throw new Error('Maximum recursion depth exceeded');
    }

    const parsed = this.parseRule(rule);

    // Handle different rule types
    if (parsed.and) {
      return parsed.and.every(r => this.evaluate(r, data, context, depth + 1));
    }

    if (parsed.or) {
      return parsed.or.some(r => this.evaluate(r, data, context, depth + 1));
    }

    if (parsed.not) {
      return !this.evaluate(parsed.not, data, context, depth + 1);
    }

    if (parsed.if) {
      const condition = this.evaluate(parsed.if.condition, data, context, depth + 1);
      if (condition) {
        return this.evaluate(parsed.if.then, data, context, depth + 1);
      }
      return parsed.if.else ? this.evaluate(parsed.if.else, data, context, depth + 1) : null;
    }

    if (parsed.fn) {
      return this.evaluateFunction(parsed, data, context, depth);
    }

    if (parsed.field && parsed.operator) {
      return this.evaluateComparison(parsed, data, context);
    }

    // Direct value
    return parsed;
  }

  evaluateComparison(rule, data, context) {
    const fieldValue = this.getFieldValue(rule.field, data, context);
    const operator = this.operators[rule.operator];
    
    if (!operator) {
      throw new Error(`Unknown operator: ${rule.operator}`);
    }

    return operator(fieldValue, rule.value);
  }

  evaluateFunction(rule, data, context, depth) {
    const fn = this.functions[rule.fn];
    
    if (!fn) {
      throw new Error(`Unknown function: ${rule.fn}`);
    }

    const args = (rule.args || []).map(arg => {
      if (typeof arg === 'object' && (arg.field || arg.fn)) {
        return this.evaluate(arg, data, context, depth + 1);
      }
      return arg;
    });

    return fn(...args);
  }

  getFieldValue(fieldPath, data, context) {
    // Check context first
    if (context[fieldPath] !== undefined) {
      return context[fieldPath];
    }

    // Navigate nested fields
    const parts = fieldPath.split('.');
    let value = data;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  // Register custom operator
  registerOperator(name, fn) {
    this.operators[name] = fn;
  }

  // Register custom function
  registerFunction(name, fn) {
    this.functions[name] = fn;
  }

  // Add a rule to the engine
  addRule(name, rule, options = {}) {
    this.rules.set(name, {
      name,
      rule: this.parseRule(rule),
      options,
    });
  }

  // Evaluate a named rule
  evaluateRule(name, data, context = {}) {
    const ruleDef = this.rules.get(name);
    if (!ruleDef) {
      throw new Error(`Rule not found: ${name}`);
    }

    return this.evaluate(ruleDef.rule, data, context);
  }

  // Get all rules
  getRules() {
    return Array.from(this.rules.values()).map(r => ({
      name: r.name,
      options: r.options,
    }));
  }

  // Remove a rule
  removeRule(name) {
    return this.rules.delete(name);
  }

  // Validate a rule definition
  validateRule(rule) {
    try {
      const parsed = this.parseRule(rule);
      
      // Try to evaluate with empty data
      this.evaluate(parsed, {}, {}, 0);
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Create rule from template
  createRuleFromTemplate(templateName, params) {
    const templates = {
      'severity-check': {
        field: 'severity',
        operator: 'in',
        value: params.severities || ['critical', 'high'],
      },
      'file-pattern': {
        field: 'file',
        operator: 'matches',
        value: params.pattern || '.*\\.js$',
      },
      'age-check': {
        fn: '>',
        args: [
          { fn: '-', args: [{ fn: 'now' }, { field: 'createdAt' }] },
          params.maxAge || 86400000, // 1 day in ms
        ],
      },
      'complexity-check': {
        and: [
          { field: 'complexity', operator: '>', value: params.threshold || 10 },
          { field: 'lines', operator: '>', value: params.minLines || 50 },
        ],
      },
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }

    return template;
  }

  // Export rules
  exportRules() {
    const exported = {};
    for (const [name, ruleDef] of this.rules) {
      exported[name] = {
        rule: ruleDef.rule,
        options: ruleDef.options,
      };
    }
    return exported;
  }

  // Import rules
  importRules(rules) {
    for (const [name, def] of Object.entries(rules)) {
      this.addRule(name, def.rule, def.options);
    }
  }
}

export default RuleEngine;
