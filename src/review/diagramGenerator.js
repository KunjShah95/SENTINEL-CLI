/**
 * Diagram Generator
 *
 * Generates Mermaid sequence diagrams, state machines, and ERDs from code changes.
 */

export class DiagramGenerator {
  /**
   * Generate a sequence diagram from API route changes.
   */
  generateSequenceDiagram(changedFiles) {
    const apiFiles = changedFiles.filter(f =>
      /route|controller|handler|api|middleware/i.test(f.path || '')
    );

    if (apiFiles.length === 0) return null;

    let diagram = 'sequenceDiagram\n';
    diagram += '    participant Client\n';

    const participants = new Set();
    for (const file of apiFiles) {
      const name = this.extractServiceName(file.path);
      if (name && !participants.has(name)) {
        participants.add(name);
        diagram += `    participant ${name}\n`;
      }
    }

    diagram += '    participant Database\n\n';

    for (const name of participants) {
      diagram += `    Client->>${name}: Request\n`;
      diagram += `    ${name}->>Database: Query\n`;
      diagram += `    Database-->>${name}: Result\n`;
      diagram += `    ${name}-->>Client: Response\n\n`;
    }

    return diagram;
  }

  /**
   * Generate a state machine diagram from state-related changes.
   */
  generateStateMachine(changedFiles) {
    const stateFiles = changedFiles.filter(f =>
      /state|status|workflow|fsm/i.test(f.path || '')
    );

    if (stateFiles.length === 0) return null;

    let diagram = 'stateDiagram-v2\n';
    diagram += '    [*] --> Initial\n';
    diagram += '    Initial --> Processing\n';
    diagram += '    Processing --> Success\n';
    diagram += '    Processing --> Error\n';
    diagram += '    Success --> [*]\n';
    diagram += '    Error --> Processing: retry\n';

    return diagram;
  }

  /**
   * Generate an ER diagram from model/schema changes.
   */
  generateERDiagram(changedFiles) {
    const modelFiles = changedFiles.filter(f =>
      /model|schema|entity|migration/i.test(f.path || '')
    );

    if (modelFiles.length === 0) return null;

    let diagram = 'erDiagram\n';

    for (const file of modelFiles) {
      const name = this.extractEntityName(file.path);
      if (name) {
        diagram += `    ${name} {\n`;
        diagram += '        string id PK\n';
        diagram += '        string name\n';
        diagram += '        datetime created_at\n';
        diagram += '        datetime updated_at\n';
        diagram += '    }\n\n';
      }
    }

    return diagram;
  }

  /**
   * Generate all applicable diagrams for the PR.
   */
  generateAll(changedFiles) {
    return {
      sequence: this.generateSequenceDiagram(changedFiles),
      stateMachine: this.generateStateMachine(changedFiles),
      erDiagram: this.generateERDiagram(changedFiles),
    };
  }

  /**
   * Format diagrams as a PR comment.
   */
  formatAsComment(diagrams) {
    const parts = [];

    if (diagrams.sequence) {
      parts.push('### API Flow\n\n```mermaid\n' + diagrams.sequence + '```');
    }
    if (diagrams.stateMachine) {
      parts.push('### State Machine\n\n```mermaid\n' + diagrams.stateMachine + '```');
    }
    if (diagrams.erDiagram) {
      parts.push('### Data Model\n\n```mermaid\n' + diagrams.erDiagram + '```');
    }

    if (parts.length === 0) return '';

    return '## 📊 Architecture Diagrams\n\n' + parts.join('\n\n');
  }

  extractServiceName(filePath) {
    const match = filePath.match(/(?:routes?|controllers?|handlers?)\/(\w+)/i);
    return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : null;
  }

  extractEntityName(filePath) {
    const basename = filePath.match(/([^/]+)\.\w+$/);
    return basename ? basename[1].charAt(0).toUpperCase() + basename[1].slice(1) : null;
  }
}

export default DiagramGenerator;
