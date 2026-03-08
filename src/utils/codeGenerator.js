/**
 * Code Generator - Comprehensive code generation templates
 * Supports multiple frameworks and patterns
 */

export class CodeGenerator {
  constructor(options = {}) {
    this.templateDir = options.templateDir || '';
  }

  /**
   * Generate code from specification
   */
  generate(spec) {
    const { type, name, options = {} } = spec;

    switch (type) {
      case 'react-component':
        return this.generateReactComponent(name, options);
      case 'vue-component':
        return this.generateVueComponent(name, options);
      case 'nextjs-page':
        return this.generateNextJSPage(name, options);
      case 'nextjs-api':
        return this.generateNextJSAPI(name, options);
      case 'express-route':
        return this.generateExpressRoute(name, options);
      case 'express-middleware':
        return this.generateExpressMiddleware(name, options);
      case 'graphql-resolver':
        return this.generateGraphQLResolver(name, options);
      case 'graphql-type':
        return this.generateGraphQLType(name, options);
      case 'django-view':
        return this.generateDjangoView(name, options);
      case 'django-model':
        return this.generateDjangoModel(name, options);
      case 'fastapi-endpoint':
        return this.generateFastAPIEndpoint(name, options);
      case 'rust-function':
        return this.generateRustFunction(name, options);
      case 'go-function':
        return this.generateGoFunction(name, options);
      case 'python-class':
        return this.generatePythonClass(name, options);
      case 'test-file':
        return this.generateTestFile(name, options);
      case 'hook':
        return this.generateHook(name, options);
      case 'context':
        return this.generateContext(name, options);
      case 'service':
        return this.generateService(name, options);
      case 'controller':
        return this.generateController(name, options);
      case 'repository':
        return this.generateRepository(name, options);
      default:
        return this.generateGeneric(name, options);
    }
  }

  // ==================== React ====================
  
  generateReactComponent(name, { props = [], state = [], withHooks = false, withTests = false, typescript = true } = {}) {
    const propTypes = props.map(p => `${p.name}: PropTypes.${p.type || 'string'}${p.required ? '.isRequired' : ''}`).join(',\n  ');
    const propInterface = typescript ? props.map(p => `${p.name}${p.required ? '' : '?'}: ${p.type || 'string'}`).join(',\n  ') : '';
    const stateInit = state.map(s => `const [${s.name}, set${s.name.charAt(0).toUpperCase() + s.name.slice(1)}] = useState${s.initialValue ? `(${s.initialValue})` : '(null)'};`).join('\n  ');
    const imports = withHooks ? "import { useState, useEffect } from 'react';" : "import React from 'react';";
    
    let code = `${imports}
import PropTypes from 'prop-types';

${typescript ? `interface ${name}Props {
  ${propInterface || '// props'}
}` : ''}

${typescript ? `const ${name}: React.FC<${name}Props> = ({ ${props.map(p => p.name).join(', ') || '_props'} }) => {` : `const ${name} = ({ ${props.map(p => p.name).join(', ') || '_props'} }) => {`}
  ${withHooks ? stateInit : '// State'}
  ${withHooks ? "useEffect(() => {\n    // Effect logic\n  }, []);" : '// Effects'}

  return (
    <div className="${name.toLowerCase()}">
      ${props.map(p => `{${p.name}}`).join(' ')}
    </div>
  );
};

${name}.propTypes = {
  ${propTypes || '// props'}
};

export default ${name};
`;

    if (withTests) {
      code += `

// Tests
import { render, screen } from '@testing-library/react';
import ${name} from './${name}';

describe('${name}', () => {
  it('renders without crashing', () => {
    render(<${name} />);
    expect(screen.getByText(/.../)).toBeInTheDocument();
  });
});
`;
    }

    return code;
  }

  generateHook(name, { dependencies = [], async = false } = {}) {
    return `import { useState, useEffect${async ? ', useCallback' : ''} from 'react';

export function use${name}(${async ? 'params' : ''}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  ${async ? `const fetch${name} = useCallback(async (${async ? 'params' : ''}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/${name.toLowerCase()}');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [${dependencies.join(', ')}]);

  useEffect(() => {
    fetch${name}(${async ? 'params' : ''});
  }, [fetch${name}]);` : '// Custom hook logic'}

  return { data, loading, error${async ? ', refetch' : ''} };
}
`;
  }

  generateContext(name, { withReducer = false } = {}) {
    return `import React, { createContext, useContext${withReducer ? ', useReducer' : ', useState'}, useCallback } from 'react';

const ${name}Context = createContext(null);

const initialState = {
  // Initial state
};

function ${name}Reducer(state, action) {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, data: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export function ${name}Provider({ children }) {
  ${withReducer 
    ? 'const [state, dispatch] = useReducer(${name}Reducer, initialState);'
    : "const [state, setState] = useState(initialState);"
  }

  const value = {
    state,
    ${withReducer 
      ? 'dispatch'
      : 'setState: (updates) => setState(prev => ({ ...prev, ...updates }))'
    }
  };

  return (
    <${name}Context.Provider value={value}>
      {children}
    </${name}Context.Provider>
  );
}

export function use${name}() {
  const context = useContext(${name}Context);
  if (!context) {
    throw new Error('use${name} must be used within ${name}Provider');
  }
  return context;
}
`;
  }

  // ==================== Vue ====================

  generateVueComponent(name, { props = [], emits = [], computed = [], methods = [] } = {}) {
    return `<template>
  <div class="${name.toLowerCase()}">
    <!-- Component template -->
  </div>
</template>

<script>
export default {
  name: '${name}',
  props: {
    ${props.map(p => `${p.name}: ${p.type || 'String'}${p.required ? ', required: true' : ''}`).join(',\n    ')}
  },
  emits: [
    ${emits.map(e => `'${e}'`).join(',\n    ')}
  ],
  data() {
    return {
      // Reactive data
    };
  },
  computed: {
    ${computed.map(c => `${c.name}() {\n      return ${c.expression || '// compute ' + c.name};\n    }`).join(',\n    ')}
  },
  methods: {
    ${methods.map(m => `${m.name}() {\n      // ${m.description || m.name}\n    }`).join(',\n    ')}
  },
  mounted() {
    // Lifecycle hook
  }
};
</script>

<style scoped>
.${name.toLowerCase()} {
  /* Component styles */
}
</style>
`;
  }

  // ==================== Next.js ====================

  generateNextJSPage(name, { appRouter = true, withAuth = false } = {}) {
    if (appRouter) {
      return `import { NextPage } from 'next';
${withAuth ? "import { useSession } from 'next-auth/react';" : ''}

interface PageProps {
  // Props
}

const ${name}Page: NextPage<PageProps> = ({}) => {
  ${withAuth ? "const { data: session } = useSession();" : ''}

  return (
    <div className="container mx-auto p-4">
      <h1>${name}</h1>
    </div>
  );
};

export default ${name}Page;
`;
    }
    
    return `import Head from 'next/head';
${withAuth ? "import { getSession } from 'next-auth/react';" : ''}

export async function getServerSideProps(context${withAuth ? ': any' : ''}) {
  ${withAuth ? "const session = await getSession(context);\n  if (!session) {\n    return { redirect: { destination: '/auth/signin', permanent: false } };\n  }" : '// Server-side logic'}
  
  return {
    props: {
      // Props
    }
  };
}

export default function ${name}({ props }) {
  return (
    <>
      <Head>
        <title>${name}</title>
      </Head>
      <main>
        <h1>${name}</h1>
      </main>
    </>
  );
}
`;
  }

  generateNextJSAPI(name, { method = 'GET', typescript = true } = {}) {
    const handler = typescript 
      ? `export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}`
      : `export default async function handler(req, res) {
  try {
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}`;

    return `import { NextResponse } from 'next/server';
${typescript ? "import { NextRequest } from 'next/server';" : ''}

export async function ${method}(${typescript ? 'request: NextRequest' : 'request'}) {
  ${handler.replace('NextResponse', 'NextResponse')}
}
`;
  }

  // ==================== Express ====================

  generateExpressRoute(name, { method = 'get', path = '/', controller = '', middlewares = [] } = {}) {
    const middlewareImports = middlewares.length 
      ? `const { ${middlewares.join(', ')} } = require('../middleware');`
      : '';
    const middlewareUse = middlewares.length
      ? middlewares.map(m => `  ${m}(req, res, next);`).join('\n')
      : '';

    return `const express = require('express');
const router = express.Router();
${middlewareImports}

${middlewareUse ? `router.${method}('${path}', ${middlewares.join(', ')}, ${controller || `(req, res) => {`});\n` : ''}
router.${method}('${path}'${controller ? ', ' + controller : ''}, (req, res) => {
  res.json({ 
    success: true, 
    message: '${name} endpoint',
    data: {} 
  });
});

module.exports = router;
`;
  }

  generateExpressMiddleware(name, { options = [] } = {}) {
    return `module.exports = function ${name}Middleware(options = {}) {
  return function (req, res, next) {
    // Middleware logic
    ${options.includes('auth') ? "const token = req.headers.authorization;\n    if (!token) {\n      return res.status(401).json({ error: 'Unauthorized' });\n    }" : '// Process request'}
    
    // Attach to request
    req.${name} = { /* data */ };
    
    next();
  };
};
`;
  }

  // ==================== GraphQL ====================

  generateGraphQLResolver(name, { typeName = 'Query', args = [] } = {}) {
    const argsStr = args.map(a => `${a.name}: ${a.type}`).join(', ');
    
    return `const ${name}Resolver = {
  ${typeName}: {
    ${name}: async (parent, { ${argsStr || '_args'} }, context) => {
      // Resolver logic
      try {
        const result = await context.${name}.find();
        return result;
      } catch (error) {
        throw new Error(\`Failed to fetch ${name}: \${error.message}\`);
      }
    }
  }
};

module.exports = ${name}Resolver;
`;
  }

  generateGraphQLType(name, { fields = [] } = {}) {
    const fieldDefs = fields.map(f => `  ${f.name}: ${f.type}${f.nonNull ? '!' : ''}`).join('\n');

    return `const ${name}Type = \`
  type ${name} {
${fieldDefs || '  id: ID!'}
  createdAt: String
  updatedAt: String
  }
\`;

module.exports = ${name}Type;
`;
  }

  // ==================== Django ====================

  generateDjangoView(name, { method = 'get', model = '', template = '' } = {}) {
    const modelImport = model ? `from .models import ${model}` : '';
    
    return `${modelImport}
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
import json

@require_http_methods(["${method.toUpperCase()}"])
def ${name.toLowerCase()}_view(request${model ? `, ${model.toLowerCase()}_id` : ''}):
    """
    ${name} view handler
    """
    ${model ? `obj = get_object_or_404(${model}, pk=${model.toLowerCase()}_id)` : ''}
    
    if request.method == '${method.toUpperCase()}':
        ${template ? `return render(request, '${template}', {'object': obj})` : `return JsonResponse({'data': {}})`}

    return JsonResponse({'error': 'Method not allowed'}, status=405)
`;
  }

  generateDjangoModel(name, { fields = [] } = {}) {
    const fieldDefs = fields.map(f => {
      const fieldTypes = {
        string: 'models.CharField(max_length=255)',
        text: 'models.TextField()',
        integer: 'models.IntegerField()',
        boolean: 'models.BooleanField(default=False)',
        date: 'models.DateField(auto_now_add=True)',
        datetime: 'models.DateTimeField(auto_now=True)',
        foreign: `models.ForeignKey('self', on_delete=models.CASCADE, null=True)`,
        json: 'models.JSONField(default=dict)'
      };
      return `    ${f.name} = ${fieldTypes[f.type] || fieldTypes.string}${f.null ? ', null=True' : ''}${f.unique ? ', unique=True' : ''}`;
    }).join('\n');

    return `from django.db import models

class ${name}(models.Model):
${fieldDefs || '    # Define model fields'}
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = '${name}'
        verbose_name_plural = '${name}s'
        ordering = ['-created_at']

    def __str__(self):
        return f"${name} {{self.pk}}"
`;
  }

  // ==================== FastAPI ====================

  generateFastAPIEndpoint(name, { method = 'get', path = '/', responseModel = '', tags = [] } = {}) {
    const responseImport = responseModel ? `, ${responseModel}` : '';
    const tagsStr = tags.length ? `, tags=["${tags.join('", "')}"]` : '';

    return `from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
${responseImport ? `from typing import Optional${responseImport}` : 'from typing import Optional'}

router = APIRouter(prefix="/${path.split('/')[1] || name}", tags=${tags.length ? `[${tags.map(t => `"${t}"`).join(', ')}]` : `["${name}"]`})

class ${name}Request(BaseModel):
    # Request schema
    pass

${responseModel ? `class ${name}Response(${responseModel}):
    pass` : ''}

@router.${method}("/${path.split('/').pop() || ''}"${tagsStr})
async def ${name}_endpoint(${responseModel ? `request: ${name}Request` : ''}):
    """
    ${name} endpoint handler
    """
    try:
        # Business logic
        return { "success": True, "data": {} }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
`;
  }

  // ==================== Rust ====================

  generateRustFunction(name, { args = [], returnType = 'Result<(), Box<dyn std::error::Error>>', pub = true } = {}) {
    const argStr = args.map(a => `${a.name}: ${a.type}`).join(', ');

    return `${pub ? 'pub ' : ''}fn ${name}(${argStr}) -> ${returnType} {
    // Function logic
    ${returnType.includes('Result') ? 'Ok(())' : '()'}
}
`;
  }

  // ==================== Go ====================

  generateGoFunction(name, { args = [], returnType = 'error', packageName = 'main' } = {}) {
    const argStr = args.map(a => `${a.name} ${a.type}`).join(', ');
    
    return `package ${packageName}

func ${name}(${argStr}) ${returnType.includes('(') ? returnType : '(' + returnType + ')' } {
    // Function logic
    return nil
}
`;
  }

  generatePythonClass(name, { baseClasses = [], methods = [], fields = [] } = {}) {
    const bases = baseClasses.length ? `(${baseClasses.join(', ')})` : '';
    const fieldDefs = fields.map(f => `    self.${f.name} = ${f.default || 'None'}`).join('\n');
    const methodDefs = methods.map(m => `
    def ${m.name}(self${m.args ? ', ' + m.args : ''}):
        """${m.doc || m.name} method"""
        pass`).join('');

    return `class ${name}${bases}:
    """
    ${name} class
    """
    
    def __init__(self${baseClasses.includes('object') ? '' : ', *args, **kwargs'}):
${fieldDefs || '        pass'}
${methodDefs}

    def __str__(self):
        return f"${name}()"

    def __repr__(self):
        return f"${name}()"
`;
  }

  // ==================== Test Files ====================

  generateTestFile(name, { framework = 'jest', type = 'component', language = 'typescript' }) {
    if (framework === 'jest') {
      if (type === 'component') {
        return language === 'typescript'
          ? `import { render, screen, fireEvent } from '@testing-library/react';
import ${name} from './${name}';

describe('${name}', () => {
  it('should render correctly', () => {
    render(<${name} />);
    expect(screen.getByText(/.../)).toBeInTheDocument();
  });

  it('should handle user interaction', () => {
    const mockFn = jest.fn();
    render(<${name} onClick={mockFn} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockFn).toHaveBeenCalled();
  });
});`
          : `const { render, screen, fireEvent } = require('@testing-library/react');
const ${name} = require('./${name}').default;

describe('${name}', () => {
  it('should render correctly', () => {
    render(<${name} />);
    expect(screen.getByText(/.../)).toBeInTheDocument();
  });
});`;
      }
      
      return `describe('${name}', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should work', () => {
    expect(true).toBe(true);
  });
});`;
    }
    
    // Pytest
    return `import pytest
from ${name.lowerCase().replace('test_', '')} import ${name}

def test_${name.toLowerCase()}():
    """Test for ${name}"""
    assert True

@pytest.fixture
def mock_${name.lowerCase()}():
    """Mock fixture for ${name}"""
    return {}
`;
  }

  // ==================== Generic ====================

  generateGeneric(name, options = {}) {
    return `// Generated code for ${name}
// Type: ${options.type || 'generic'}
// Options: ${JSON.stringify(options)}

export class ${name} {
  constructor() {
    // Initialize
  }
}
`;
  }

  // ==================== Service/Controller/Repository ====================

  generateService(name, { methods = [] } = {}) {
    const methodDefs = methods.map(m => `
  async ${m.name}(${m.args || ''}) {
    // ${m.name} implementation
    return {};
  }`).join('');

    return `export class ${name}Service {
  constructor(private api) {
    this.api = api;
  }${methodDefs}
}
`;
  }

  generateController(name, { methods = [] } = {}) {
    const methodDefs = methods.map(m => `
  @${m.method || 'Get'}('${m.path || '/'}${m.name}')
  async ${m.name}(ctx) {
    try {
      const result = await this.service.${m.name}(ctx.params);
      ctx.body = { success: true, data: result };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { success: false, error: error.message };
    }
  }`).join('');

    return `export class ${name}Controller {
  constructor(service) {
    this.service = service;
  }${methodDefs}
}
`;
  }

  generateRepository(name, { fields = [] } = {}) {
    const fieldDefs = fields.map(f => `    this.${f.name} = ${f.default || 'null'};`).join('\n');

    return `export class ${name}Repository {
  constructor(db) {
    this.db = db;
${fieldDefs}
  }

  async findAll() {
    return await this.db.${name.toLowerCase()}.findMany();
  }

  async findById(id) {
    return await this.db.${name.toLowerCase()}.findUnique({ where: { id } });
  }

  async create(data) {
    return await this.db.${name.toLowerCase()}.create({ data });
  }

  async update(id, data) {
    return await this.db.${name.toLowerCase()}.update({ where: { id }, data });
  }

  async delete(id) {
    return await this.db.${name.toLowerCase()}.delete({ where: { id } });
  }
}
`;
  }
}

export default CodeGenerator;
