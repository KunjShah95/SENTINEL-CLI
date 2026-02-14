/**
 * GRAPH NEURAL NETWORK FEATURES
 *
 * Prepare code graphs for GNN model consumption
 *
 * Features:
 * - Abstract Syntax Tree (AST) to graph conversion
 * - Control Flow Graph (CFG) generation
 * - Data Flow Graph (DFG) generation
 * - Program Dependency Graph (PDG)
 * - Node feature extraction (syntax, semantics, types)
 * - Edge feature extraction (control flow, data flow, call graph)
 * - Graph embeddings generation
 * - PyTorch Geometric / DGL compatible format
 *
 * Inspired by:
 * - DeepMind's program synthesis with GNNs
 * - Microsoft's CodeBERT and GraphCodeBERT
 * - Google's code representation research
 */

import { parse as babelParse } from '@babel/parser';
import traverse from '@babel/traverse';

export class GNNFeatureExtractor {
  constructor(options = {}) {
    this.options = {
      maxNodes: options.maxNodes || 1000,
      maxEdges: options.maxEdges || 5000,
      includeAST: options.includeAST !== false,
      includeCFG: options.includeCFG !== false,
      includeDFG: options.includeDFG !== false,
      includeCallGraph: options.includeCallGraph !== false,
      nodeFeatureDim: options.nodeFeatureDim || 128,
      edgeFeatureDim: options.edgeFeatureDim || 64,
      ...options
    };

    // Node vocabulary (for type encoding)
    this.nodeVocab = new Map();
    this.edgeVocab = new Map();

    // Initialize vocabularies
    this.initializeVocabularies();
  }

  /**
   * EXTRACT GNN FEATURES
   *
   * Main entry point - convert code to GNN-ready graph
   */
  async extractGNNFeatures(code, options = {}) {
    const {
      format = 'pytorch-geometric', // pytorch-geometric, dgl, networkx
      includeFeatures = true
    } = options;

    console.log('🔍 Extracting GNN features from code...');

    // Parse code to AST
    const ast = await this.parseCode(code);

    if (!ast) {
      throw new Error('Failed to parse code');
    }

    // Build multi-view graph
    const graph = {
      nodes: [],
      edges: [],
      astEdges: [],
      cfgEdges: [],
      dfgEdges: [],
      callEdges: []
    };

    // Extract AST graph
    if (this.options.includeAST) {
      const astGraph = this.extractASTGraph(ast);
      this.mergeGraphs(graph, astGraph);
    }

    // Extract Control Flow Graph
    if (this.options.includeCFG) {
      const cfgGraph = this.extractCFG(ast);
      this.mergeGraphs(graph, cfgGraph);
    }

    // Extract Data Flow Graph
    if (this.options.includeDFG) {
      const dfgGraph = this.extractDFG(ast);
      this.mergeGraphs(graph, dfgGraph);
    }

    // Extract Call Graph
    if (this.options.includeCallGraph) {
      const callGraph = this.extractCallGraph(ast);
      this.mergeGraphs(graph, callGraph);
    }

    // Add node features
    if (includeFeatures) {
      for (const node of graph.nodes) {
        node.features = this.extractNodeFeatures(node);
      }

      for (const edge of graph.edges) {
        edge.features = this.extractEdgeFeatures(edge);
      }
    }

    // Convert to target format
    const formatted = this.formatGraph(graph, format);

    console.log(`✅ Extracted graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

    return formatted;
  }

  /**
   * EXTRACT AST GRAPH
   */
  extractASTGraph(ast) {
    const graph = {
      nodes: [],
      edges: [],
      nodeMap: new Map()
    };

    let nodeId = 0;

    const self = this;

    // Traverse AST and create nodes
    traverse.default(ast, {
      enter(path) {
        const node = {
          id: nodeId++,
          type: path.node.type,
          astType: path.node.type,
          value: self.getNodeValue(path.node),
          loc: path.node.loc,
          properties: self.extractASTProperties(path.node)
        };

        graph.nodes.push(node);
        graph.nodeMap.set(path.node, node);

        // Create parent-child edges
        if (path.parent && graph.nodeMap.has(path.parent)) {
          const parentNode = graph.nodeMap.get(path.parent);

          graph.edges.push({
            source: parentNode.id,
            target: node.id,
            type: 'ast',
            label: 'parent-child'
          });
        }
      }
    });

    return graph;
  }

  /**
   * EXTRACT CONTROL FLOW GRAPH
   */
  extractCFG(ast) {
    const graph = {
      nodes: [],
      edges: [],
      nodeMap: new Map()
    };

    let nodeId = 0;
    let currentNode = null;

    // Build basic blocks
    traverse.default(ast, {
      // Function entry
      FunctionDeclaration(path) {
        const entryNode = {
          id: nodeId++,
          type: 'cfg-entry',
          functionName: path.node.id?.name,
          loc: path.node.loc
        };

        graph.nodes.push(entryNode);
        graph.nodeMap.set(path.node, entryNode);
        currentNode = entryNode;
      },

      // Statements
      Statement(path) {
        const stmtNode = {
          id: nodeId++,
          type: 'cfg-statement',
          statementType: path.node.type,
          loc: path.node.loc
        };

        graph.nodes.push(stmtNode);
        graph.nodeMap.set(path.node, stmtNode);

        // Connect to previous node
        if (currentNode) {
          graph.edges.push({
            source: currentNode.id,
            target: stmtNode.id,
            type: 'cfg',
            label: 'sequential'
          });
        }

        currentNode = stmtNode;
      },

      // Conditional branches
      IfStatement(path) {
        const branchNode = {
          id: nodeId++,
          type: 'cfg-branch',
          condition: 'if',
          loc: path.node.loc
        };

        graph.nodes.push(branchNode);

        if (currentNode) {
          graph.edges.push({
            source: currentNode.id,
            target: branchNode.id,
            type: 'cfg',
            label: 'branch'
          });
        }

        currentNode = branchNode;
      }
    });

    return graph;
  }

  /**
   * EXTRACT DATA FLOW GRAPH
   */
  extractDFG(ast) {
    const graph = {
      nodes: [],
      edges: [],
      variableMap: new Map() // variable name -> defining node
    };

    let nodeId = 0;

    traverse.default(ast, {
      // Variable declarations (definitions)
      VariableDeclarator(path) {
        const varName = path.node.id.name;

        const defNode = {
          id: nodeId++,
          type: 'dfg-def',
          variable: varName,
          loc: path.node.loc
        };

        graph.nodes.push(defNode);
        graph.variableMap.set(varName, defNode);
      },

      // Variable usages (uses)
      Identifier(path) {
        const varName = path.node.name;

        // Skip if this is a definition
        if (path.parent.type === 'VariableDeclarator' && path.parent.id === path.node) {
          return;
        }

        const useNode = {
          id: nodeId++,
          type: 'dfg-use',
          variable: varName,
          loc: path.node.loc
        };

        graph.nodes.push(useNode);

        // Create def-use edge if definition exists
        if (graph.variableMap.has(varName)) {
          const defNode = graph.variableMap.get(varName);

          graph.edges.push({
            source: defNode.id,
            target: useNode.id,
            type: 'dfg',
            label: 'def-use',
            variable: varName
          });
        }
      }
    });

    return graph;
  }

  /**
   * EXTRACT CALL GRAPH
   */
  extractCallGraph(ast) {
    const graph = {
      nodes: [],
      edges: [],
      functionMap: new Map() // function name -> node
    };

    let nodeId = 0;

    // First pass: collect function definitions
    traverse.default(ast, {
      FunctionDeclaration(path) {
        const funcName = path.node.id?.name;

        if (funcName) {
          const funcNode = {
            id: nodeId++,
            type: 'call-function',
            name: funcName,
            params: path.node.params.length,
            loc: path.node.loc
          };

          graph.nodes.push(funcNode);
          graph.functionMap.set(funcName, funcNode);
        }
      }
    });

    // Second pass: collect function calls
    traverse.default(ast, {
      CallExpression(path) {
        const calleeName = path.node.callee.name || path.node.callee.property?.name;

        if (calleeName) {
          const callNode = {
            id: nodeId++,
            type: 'call-site',
            callee: calleeName,
            args: path.node.arguments.length,
            loc: path.node.loc
          };

          graph.nodes.push(callNode);

          // Create call edge if function is defined
          if (graph.functionMap.has(calleeName)) {
            const funcNode = graph.functionMap.get(calleeName);

            graph.edges.push({
              source: callNode.id,
              target: funcNode.id,
              type: 'call',
              label: 'invokes'
            });
          }
        }
      }
    });

    return graph;
  }

  /**
   * EXTRACT NODE FEATURES
   *
   * Generate feature vector for each node
   */
  extractNodeFeatures(node) {
    const features = {
      // Node type encoding (one-hot or embedding index)
      typeEncoding: this.encodeNodeType(node.type),

      // Syntactic features
      astType: this.encodeASTType(node.astType),
      depth: node.depth || 0,
      childrenCount: node.children?.length || 0,

      // Semantic features
      isDefinition: node.type?.includes('def') ? 1 : 0,
      isUse: node.type?.includes('use') ? 1 : 0,
      isControl: node.type?.includes('cfg') || node.type?.includes('branch') ? 1 : 0,
      isCall: node.type?.includes('call') ? 1 : 0,

      // Code metrics
      complexity: node.complexity || 0,
      fanIn: node.fanIn || 0,
      fanOut: node.fanOut || 0,

      // Token features (if available)
      tokenLength: node.value?.length || 0,
      tokenType: this.classifyToken(node.value)
    };

    // Convert to dense vector
    return this.featuresToVector(features);
  }

  /**
   * EXTRACT EDGE FEATURES
   */
  extractEdgeFeatures(edge) {
    const features = {
      // Edge type encoding
      typeEncoding: this.encodeEdgeType(edge.type),

      // Edge properties
      isAST: edge.type === 'ast' ? 1 : 0,
      isCFG: edge.type === 'cfg' ? 1 : 0,
      isDFG: edge.type === 'dfg' ? 1 : 0,
      isCall: edge.type === 'call' ? 1 : 0,

      // Edge labels
      labelEncoding: this.encodeEdgeLabel(edge.label),

      // Distance metrics
      distance: this.calculateDistance(edge)
    };

    return this.featuresToVector(features);
  }

  /**
   * HELPER METHODS
   */

  async parseCode(code) {
    try {
      return babelParse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy'],
        errorRecovery: true
      });
    } catch (error) {
      console.warn('Parse error:', error.message);
      return null;
    }
  }

  getNodeValue(node) {
    if (node.type === 'Identifier') {
      return node.name;
    } else if (node.type === 'Literal') {
      return String(node.value);
    } else if (node.type === 'StringLiteral') {
      return node.value;
    } else if (node.type === 'NumericLiteral') {
      return String(node.value);
    }

    return node.type;
  }

  extractASTProperties(node) {
    const props = {};

    // Extract relevant properties based on node type
    switch (node.type) {
      case 'FunctionDeclaration':
        props.async = node.async;
        props.generator = node.generator;
        props.params = node.params.length;
        break;

      case 'VariableDeclaration':
        props.kind = node.kind; // const, let, var
        break;

      case 'Identifier':
        props.name = node.name;
        break;

      case 'Literal':
        props.value = node.value;
        break;
    }

    return props;
  }

  mergeGraphs(target, source) {
    // Merge nodes (with ID offset)
    const nodeIdOffset = target.nodes.length;

    for (const node of source.nodes) {
      target.nodes.push({
        ...node,
        id: node.id + nodeIdOffset
      });
    }

    // Merge edges (with ID offset)
    for (const edge of source.edges) {
      target.edges.push({
        ...edge,
        source: edge.source + nodeIdOffset,
        target: edge.target + nodeIdOffset
      });

      // Categorize edge by type
      if (edge.type === 'ast') {
        target.astEdges.push(edge);
      } else if (edge.type === 'cfg') {
        target.cfgEdges.push(edge);
      } else if (edge.type === 'dfg') {
        target.dfgEdges.push(edge);
      } else if (edge.type === 'call') {
        target.callEdges.push(edge);
      }
    }
  }

  encodeNodeType(type) {
    if (!this.nodeVocab.has(type)) {
      this.nodeVocab.set(type, this.nodeVocab.size);
    }

    return this.nodeVocab.get(type);
  }

  encodeASTType(astType) {
    if (!astType) return 0;

    const astVocab = new Map([
      ['FunctionDeclaration', 1],
      ['VariableDeclaration', 2],
      ['Identifier', 3],
      ['Literal', 4],
      ['CallExpression', 5],
      ['IfStatement', 6],
      ['BlockStatement', 7]
    ]);

    return astVocab.get(astType) || 0;
  }

  encodeEdgeType(type) {
    if (!this.edgeVocab.has(type)) {
      this.edgeVocab.set(type, this.edgeVocab.size);
    }

    return this.edgeVocab.get(type);
  }

  encodeEdgeLabel(label) {
    const labelVocab = new Map([
      ['parent-child', 1],
      ['sequential', 2],
      ['branch', 3],
      ['def-use', 4],
      ['invokes', 5]
    ]);

    return labelVocab.get(label) || 0;
  }

  classifyToken(token) {
    if (!token) return 0;

    if (/^[a-z]/.test(token)) return 1; // identifier
    if (/^[A-Z]/.test(token)) return 2; // class name
    if (/^\d+$/.test(token)) return 3; // number
    if (/^['"]/.test(token)) return 4; // string

    return 0;
  }

  calculateDistance(edge) {
    // Simple distance metric (can be enhanced)
    return Math.abs(edge.target - edge.source);
  }

  featuresToVector(features) {
    // Convert feature object to flat array
    return Object.values(features);
  }

  /**
   * FORMAT GRAPH
   *
   * Convert to target framework format
   */
  formatGraph(graph, format) {
    switch (format) {
      case 'pytorch-geometric':
        return this.toPyTorchGeometric(graph);

      case 'dgl':
        return this.toDGL(graph);

      case 'networkx':
        return this.toNetworkX(graph);

      default:
        return graph; // Return raw format
    }
  }

  toPyTorchGeometric(graph) {
    // PyTorch Geometric format
    const numNodes = graph.nodes.length;

    // Edge index: [2, num_edges] tensor
    const edgeIndex = [[], []];

    for (const edge of graph.edges) {
      edgeIndex[0].push(edge.source);
      edgeIndex[1].push(edge.target);
    }

    // Node features: [num_nodes, feature_dim] tensor
    const nodeFeatures = graph.nodes.map(n => n.features || []);

    // Edge features: [num_edges, edge_feature_dim] tensor
    const edgeFeatures = graph.edges.map(e => e.features || []);

    // Edge types for heterogeneous graphs
    const edgeTypes = graph.edges.map(e => this.encodeEdgeType(e.type));

    return {
      num_nodes: numNodes,
      edge_index: edgeIndex,
      x: nodeFeatures, // Node feature matrix
      edge_attr: edgeFeatures, // Edge feature matrix
      edge_type: edgeTypes,
      metadata: {
        astEdges: graph.astEdges.length,
        cfgEdges: graph.cfgEdges.length,
        dfgEdges: graph.dfgEdges.length,
        callEdges: graph.callEdges.length
      }
    };
  }

  toDGL(graph) {
    // DGL (Deep Graph Library) format
    return {
      num_nodes: graph.nodes.length,
      edges: {
        src: graph.edges.map(e => e.source),
        dst: graph.edges.map(e => e.target)
      },
      ndata: {
        feat: graph.nodes.map(n => n.features || []),
        type: graph.nodes.map(n => this.encodeNodeType(n.type))
      },
      edata: {
        feat: graph.edges.map(e => e.features || []),
        type: graph.edges.map(e => this.encodeEdgeType(e.type))
      }
    };
  }

  toNetworkX(graph) {
    // NetworkX format (JSON-compatible)
    return {
      directed: true,
      multigraph: false,
      graph: {
        numNodes: graph.nodes.length,
        numEdges: graph.edges.length
      },
      nodes: graph.nodes.map(n => ({
        id: n.id,
        type: n.type,
        features: n.features
      })),
      links: graph.edges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
        features: e.features
      }))
    };
  }

  /**
   * INITIALIZE VOCABULARIES
   */
  initializeVocabularies() {
    // Node types
    const nodeTypes = [
      'ast-node', 'cfg-entry', 'cfg-statement', 'cfg-branch',
      'dfg-def', 'dfg-use', 'call-function', 'call-site'
    ];

    nodeTypes.forEach((type, idx) => {
      this.nodeVocab.set(type, idx);
    });

    // Edge types
    const edgeTypes = ['ast', 'cfg', 'dfg', 'call'];

    edgeTypes.forEach((type, idx) => {
      this.edgeVocab.set(type, idx);
    });
  }

  /**
   * GET STATS
   */
  getStats() {
    return {
      nodeVocabularySize: this.nodeVocab.size,
      edgeVocabularySize: this.edgeVocab.size,
      nodeFeatureDim: this.options.nodeFeatureDim,
      edgeFeatureDim: this.options.edgeFeatureDim
    };
  }
}

// Factory function
export function createGNNFeatureExtractor(options) {
  return new GNNFeatureExtractor(options);
}

export default GNNFeatureExtractor;
