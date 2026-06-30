/**
 * Change Stack
 *
 * Organizes large PRs into ordered cohorts for sequential review.
 * Foundation → API → UI → Tests ordering.
 */

export class ChangeStack {
  /**
   * Build an ordered change stack from files.
   */
  build(files) {
    const layers = this.classifyFiles(files);
    return {
      layers,
      totalFiles: files.length,
      recommendedOrder: this.getRecommendedOrder(layers),
    };
  }

  classifyFiles(files) {
    const layers = [
      { order: 1, name: 'Database/Models', pattern: /model|schema|entity|migration|db|database/i, files: [] },
      { order: 2, name: 'Core Logic', pattern: /service|util|helper|lib|core|engine/i, files: [] },
      { order: 3, name: 'API/Routes', pattern: /route|controller|handler|api|middleware|server/i, files: [] },
      { order: 4, name: 'Frontend/UI', pattern: /component|view|page|screen|template|style|css|\.tsx|\.jsx/i, files: [] },
      { order: 5, name: 'Configuration', pattern: /config|\.env|\.yaml|\.yml|docker|ci|dockerfile/i, files: [] },
      { order: 6, name: 'Tests', pattern: /test|spec|__tests__|fixture|mock/i, files: [] },
      { order: 7, name: 'Documentation', pattern: /\.md|docs|README|CHANGELOG/i, files: [] },
    ];

    for (const file of files) {
      const path = file.path || '';
      let classified = false;
      for (const layer of layers) {
        if (layer.pattern.test(path)) {
          layer.files.push(file);
          classified = true;
          break;
        }
      }
      if (!classified) {
        layers.find(l => l.order === 2).files.push(file); // Default to Core Logic
      }
    }

    return layers.filter(l => l.files.length > 0).sort((a, b) => a.order - b.order);
  }

  getRecommendedOrder(layers) {
    return layers.map((l, i) => ({
      step: i + 1,
      name: l.name,
      fileCount: l.files.length,
      reason: this.getStepReason(l.name),
    }));
  }

  getStepReason(layerName) {
    const reasons = {
      'Database/Models': 'Review data layer changes first — other layers depend on these',
      'Core Logic': 'Review business logic before API/frontend that uses it',
      'API/Routes': 'Review API changes that expose core logic',
      'Frontend/UI': 'Review UI changes that consume the API',
      'Configuration': 'Review config changes that affect deployment',
      'Tests': 'Review tests to verify they cover the changes above',
      'Documentation': 'Review docs last to ensure they match the implementation',
    };
    return reasons[layerName] || 'Review in order';
  }

  /**
   * Format as a review guide comment.
   */
  formatAsComment(stack) {
    let body = '## 📚 Recommended Review Order\n\n';
    body += `This PR touches ${stack.totalFiles} files across ${stack.layers.length} layers.\n\n`;

    for (const step of stack.recommendedOrder) {
      body += `**Step ${step.step}: ${step.name}** (${step.fileCount} files)\n`;
      body += `> ${step.reason}\n\n`;
    }

    return body;
  }
}

export default ChangeStack;
