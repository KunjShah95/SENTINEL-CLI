import chalk from 'chalk';
import { getSessionStore } from '../context/sessionStore.js';
import { createContextAgent } from '../context/enhancedContextAgent.js';
import { createLearningSystem } from '../context/learningSystem.js';
import { createInteractiveMode } from '../interactive/interactiveMode.js';
import { createSemanticSearch } from '../search/semanticCodeSearch.js';
import { createCrossFileAnalysis } from '../analysis/crossFileAnalysis.js';
import { createAttackSurfaceMapper } from '../analysis/attackSurfaceMapper.js';
import { createThreatModelingEngine } from '../analysis/threatModelingEngine.js';
import { createComplianceScanner } from '../compliance/complianceScanner.js';
import ora from 'ora';

/**
 * Enhanced CLI Commands for Sentinel Security CLI
 */

/**
 * Interactive Mode Command
 */
export function registerInteractiveCommand(program) {
  program
    .command('interactive')
    .alias('i')
    .description('Start interactive conversational mode')
    .option('-p, --provider <provider>', 'LLM provider (groq, openai, etc.)', 'groq')
    .option('-m, --model <model>', 'Model to use', 'mixtral')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      console.log(chalk.cyan.bold('\n🤖 Starting Sentinel Interactive Mode\n'));

      const interactive = createInteractiveMode(process.cwd(), options);
      await interactive.start();
    });
}

/**
 * Context Analysis Command
 */
export function registerContextCommand(program) {
  program
    .command('context')
    .description('Analyze and display project context')
    .option('--deep', 'Deep analysis (slower but more comprehensive)')
    .option('--save <file>', 'Save context to JSON file')
    .action(async (options) => {
      const spinner = ora('Analyzing project context...').start();

      try {
        const contextAgent = createContextAgent(process.cwd());
        const context = await contextAgent.analyzeProject({
          deep: options.deep || false,
          buildGraph: true,
          detectPatterns: true,
          analyzeRisks: true
        });

        spinner.succeed('Context analysis complete');

        console.log(chalk.cyan('\n📊 Project Context:\n'));
        console.log(chalk.white('Framework:'), JSON.stringify(context.framework, null, 2));
        console.log(chalk.white('\nTechnology Stack:'), JSON.stringify(context.technology, null, 2));
        console.log(chalk.white('\nArchitecture:'), JSON.stringify(context.architecture, null, 2));
        console.log(chalk.white('\nSecurity Controls:'), JSON.stringify(context.securityControls, null, 2));
        console.log(chalk.white('\nRisk Areas:'), context.riskAreas.length);

        if (context.riskAreas.length > 0) {
          console.log(chalk.yellow('\nHigh Risk Files:'));
          context.riskAreas
            .filter(r => r.severity === 'high')
            .slice(0, 10)
            .forEach(risk => {
              console.log(chalk.yellow(`  - ${risk.file}: ${risk.reason}`));
            });
        }

        if (options.save) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.save, JSON.stringify(context, null, 2));
          console.log(chalk.green(`\n✓ Context saved to ${options.save}`));
        }
      } catch (error) {
        spinner.fail('Context analysis failed');
        console.error(chalk.red(`Error: ${error.message}`));
        if (options.verbose) {
          console.error(chalk.gray(error.stack));
        }
      }
    });
}

/**
 * Semantic Search Command
 */
export function registerSearchCommand(program) {
  program
    .command('search <query>')
    .alias('find')
    .description('Semantic code search using natural language')
    .option('--index', 'Index codebase first')
    .option('--max-results <n>', 'Maximum results', '10')
    .option('--threshold <n>', 'Similarity threshold (0-1)', '0.7')
    .action(async (query, options) => {
      const semanticSearch = createSemanticSearch(process.cwd(), {
        maxResults: parseInt(options.maxResults),
        similarityThreshold: parseFloat(options.threshold)
      });

      if (options.index) {
        const spinner = ora('Indexing codebase...').start();
        try {
          const result = await semanticSearch.indexCodebase();
          spinner.succeed(`Indexed ${result.filesIndexed} files, ${result.chunksIndexed} chunks`);
        } catch (error) {
          spinner.fail('Indexing failed');
          console.error(chalk.red(`Error: ${error.message}`));
          return;
        }
      }

      const spinner = ora(`Searching for: ${query}`).start();

      try {
        const results = await semanticSearch.search(query);
        spinner.succeed(`Found ${results.length} results`);

        if (results.length === 0) {
          console.log(chalk.yellow('\nNo results found'));
        } else {
          console.log(chalk.cyan('\n🔍 Search Results:\n'));
          results.forEach((result, i) => {
            console.log(chalk.white(`${i + 1}. ${result.file}:${result.startLine}-${result.endLine}`));
            console.log(chalk.gray(`   Type: ${result.type}, Name: ${result.name}`));
            console.log(chalk.gray(`   Similarity: ${(result.similarity * 100).toFixed(1)}%`));
            console.log(chalk.white(`   ${result.content.substring(0, 100)}...`));
            console.log('');
          });
        }
      } catch (error) {
        spinner.fail('Search failed');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Ask Command (AI-powered question answering)
 */
export function registerAskCommand(program) {
  program
    .command('ask <question>')
    .description('Ask questions about your codebase')
    .action(async (question) => {
      const spinner = ora('Analyzing codebase...').start();

      try {
        const semanticSearch = createSemanticSearch(process.cwd());
        const result = await semanticSearch.ask(question);

        spinner.succeed('Analysis complete');

        console.log(chalk.cyan('\n💡 Answer:\n'));
        console.log(chalk.white(result.answer));

        if (result.sources && result.sources.length > 0) {
          console.log(chalk.cyan('\n📚 Sources:\n'));
          result.sources.forEach((source, i) => {
            console.log(chalk.gray(`${i + 1}. ${source.file}:${source.lines} (${source.type} ${source.name})`));
          });
        }
      } catch (error) {
        spinner.fail('Query failed');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Trace Command
 */
export function registerTraceCommand(program) {
  program
    .command('trace <identifier>')
    .description('Trace function/class usage through the codebase')
    .option('--max-depth <n>', 'Maximum trace depth', '10')
    .action(async (identifier, options) => {
      const spinner = ora(`Tracing ${identifier}...`).start();

      try {
        const crossFile = createCrossFileAnalysis(process.cwd());
        const trace = await crossFile.trace(identifier, {
          maxDepth: parseInt(options.maxDepth)
        });

        spinner.succeed('Trace complete');

        console.log(chalk.cyan(`\n🔍 Trace Results for: ${identifier}\n`));

        if (trace.definitions.length > 0) {
          console.log(chalk.white('Definitions:'));
          trace.definitions.forEach(def => {
            console.log(chalk.green(`  ✓ ${def.file}:${def.line} (${def.type})`));
          });
        }

        if (trace.usages.length > 0) {
          console.log(chalk.white(`\nUsages (${trace.usages.length}):`));
          trace.usages.slice(0, 10).forEach(usage => {
            console.log(chalk.gray(`  - ${usage.file}:${usage.line}`));
          });

          if (trace.usages.length > 10) {
            console.log(chalk.gray(`  ... and ${trace.usages.length - 10} more`));
          }
        }

        if (trace.dependencies.length > 0) {
          console.log(chalk.white(`\nDependencies (${trace.dependencies.length}):`));
          trace.dependencies.slice(0, 10).forEach(dep => {
            console.log(chalk.gray(`  ${'  '.repeat(dep.depth - 1)}- ${dep.file}`));
          });
        }
      } catch (error) {
        spinner.fail('Trace failed');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Impact Analysis Command
 */
export function registerImpactCommand(program) {
  program
    .command('impact <file>')
    .description('Analyze impact of changing a file')
    .action(async (file) => {
      const spinner = ora(`Analyzing impact of ${file}...`).start();

      try {
        const crossFile = createCrossFileAnalysis(process.cwd());
        const impact = await crossFile.impactAnalysis(file);

        spinner.succeed('Impact analysis complete');

        console.log(chalk.cyan(`\n💥 Impact Analysis for: ${file}\n`));
        console.log(chalk.white('Risk Level:'), getRiskColor(impact.riskLevel)(impact.riskLevel.toUpperCase()));
        console.log(chalk.white('Total Impact:'), impact.totalImpact, 'files affected');

        if (impact.directDependents.length > 0) {
          console.log(chalk.white(`\nDirect Dependents (${impact.directDependents.length}):`));
          impact.directDependents.slice(0, 10).forEach(dep => {
            console.log(chalk.yellow(`  - ${dep}`));
          });
        }

        if (impact.indirectDependents.length > 0) {
          console.log(chalk.white(`\nIndirect Dependents (${impact.indirectDependents.length}):`));
          impact.indirectDependents.slice(0, 5).forEach(dep => {
            console.log(chalk.gray(`  - ${dep}`));
          });

          if (impact.indirectDependents.length > 5) {
            console.log(chalk.gray(`  ... and ${impact.indirectDependents.length - 5} more`));
          }
        }
      } catch (error) {
        spinner.fail('Impact analysis failed');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Attack Surface Command
 */
export function registerAttackSurfaceCommand(program) {
  program
    .command('attack-surface')
    .description('Map attack surface and identify entry points')
    .option('--save <file>', 'Save attack surface map to JSON file')
    .action(async (options) => {
      const spinner = ora('Mapping attack surface...').start();

      try {
        const mapper = createAttackSurfaceMapper(process.cwd());
        const surface = await mapper.mapAttackSurface();

        spinner.succeed('Attack surface mapped');

        console.log(chalk.cyan('\n🎯 Attack Surface Analysis\n'));
        console.log(chalk.white('Risk Score:'), getRiskScoreColor(surface.riskScore)(`${surface.riskScore}/100`));
        console.log(chalk.white('Entry Points:'), surface.entryPoints.length);
        console.log(chalk.white('API Endpoints:'), surface.apiEndpoints.length);
        console.log(chalk.white('User Inputs:'), surface.userInputs.length);
        console.log(chalk.white('External Integrations:'), surface.externalIntegrations.length);

        if (surface.criticalAreas.length > 0) {
          console.log(chalk.red('\n⚠️  Critical Areas:\n'));
          surface.criticalAreas.forEach(area => {
            console.log(chalk.red(`  [${area.severity.toUpperCase()}] ${area.details}`));
            console.log(chalk.gray(`    File: ${area.file}${area.line ? `:${area.line}` : ''}`));
          });
        }

        // Show unauthenticated endpoints
        const unauthEndpoints = surface.apiEndpoints.filter(e => !e.authentication);
        if (unauthEndpoints.length > 0) {
          console.log(chalk.yellow('\n⚠️  Unauthenticated Endpoints:\n'));
          unauthEndpoints.slice(0, 10).forEach(endpoint => {
            console.log(chalk.yellow(`  ${endpoint.method} ${endpoint.path}`));
            console.log(chalk.gray(`    File: ${endpoint.file}`));
          });
        }

        if (options.save) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.save, JSON.stringify(surface, null, 2));
          console.log(chalk.green(`\n✓ Attack surface saved to ${options.save}`));
        }
      } catch (error) {
        spinner.fail('Attack surface mapping failed');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Threat Model Command
 */
export function registerThreatModelCommand(program) {
  program
    .command('threats')
    .description('Generate STRIDE threat model')
    .option('--save <file>', 'Save threat model to JSON file')
    .action(async (options) => {
      const spinner = ora('Generating threat model...').start();

      try {
        const engine = createThreatModelingEngine(process.cwd());
        const model = await engine.generateThreatModel();

        spinner.succeed('Threat model generated');

        console.log(chalk.cyan('\n🛡️  Threat Model (STRIDE)\n'));
        console.log(chalk.white('Total Threats:'), model.threats.length);
        console.log(chalk.white('Assets:'), model.assets.length);
        console.log(chalk.white('Trust Boundaries:'), model.trustBoundaries.length);

        // Group threats by category
        const byCategory = {};
        model.threats.forEach(threat => {
          if (!byCategory[threat.category]) {
            byCategory[threat.category] = [];
          }
          byCategory[threat.category].push(threat);
        });

        console.log(chalk.cyan('\n📊 Threats by Category:\n'));
        Object.entries(byCategory).forEach(([category, threats]) => {
          console.log(chalk.white(`${category}: ${threats.length}`));
        });

        // Show top threats
        const topThreats = model.threats.slice(0, 5);
        if (topThreats.length > 0) {
          console.log(chalk.red('\n⚠️  Top Threats:\n'));
          topThreats.forEach((threat, i) => {
            console.log(chalk.red(`${i + 1}. [${threat.severity.toUpperCase()}] ${threat.title}`));
            console.log(chalk.white(`   ${threat.description}`));
            console.log(chalk.gray(`   Asset: ${threat.asset}`));
            console.log(chalk.gray(`   CWE: ${threat.cwe || 'N/A'}`));
            if (threat.location) {
              console.log(chalk.gray(`   Location: ${threat.location.file}${threat.location.line ? `:${threat.location.line}` : ''}`));
            }
            console.log('');
          });
        }

        // Show mitigations
        if (model.mitigations.length > 0) {
          console.log(chalk.cyan('💡 Recommended Mitigations:\n'));
          model.mitigations.slice(0, 5).forEach((mitigation, i) => {
            console.log(chalk.green(`${i + 1}. ${mitigation.title}`));
            console.log(chalk.white(`   ${mitigation.description}`));
            console.log(chalk.gray(`   Priority: ${mitigation.priority}, Effort: ${mitigation.effort}`));
            console.log('');
          });
        }

        if (options.save) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.save, JSON.stringify(model, null, 2));
          console.log(chalk.green(`\n✓ Threat model saved to ${options.save}`));
        }
      } catch (error) {
        spinner.fail('Threat modeling failed');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Compliance Command
 */
export function registerComplianceCommand(program) {
  program
    .command('compliance <standard>')
    .description('Check compliance with security standards')
    .option('--save <file>', 'Save compliance report to JSON file')
    .action(async (standard, options) => {
      const spinner = ora(`Checking ${standard} compliance...`).start();

      try {
        const scanner = createComplianceScanner(process.cwd());
        const results = await scanner.scanCompliance(standard);

        spinner.succeed('Compliance scan complete');

        console.log(chalk.cyan(`\n📋 ${standard} Compliance Report\n`));
        console.log(chalk.white('Score:'), getScoreColor(results.score)(`${results.score}%`));
        console.log(chalk.white('Compliance:'), results.compliance ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));
        console.log(chalk.white('Passed:'), chalk.green(results.passed));
        console.log(chalk.white('Failed:'), chalk.red(results.failed));
        console.log(chalk.white('Warnings:'), chalk.yellow(results.warnings));

        // Show failed checks
        const failed = results.checks.filter(c => c.status === 'failed');
        if (failed.length > 0) {
          console.log(chalk.red('\n✗ Failed Checks:\n'));
          failed.forEach(check => {
            console.log(chalk.red(`  [${check.severity.toUpperCase()}] ${check.name}`));
            console.log(chalk.white(`  ${check.description}`));
            console.log(chalk.gray(`  Remediation: ${check.remediation}`));
            if (check.evidence && check.evidence.length > 0) {
              console.log(chalk.gray(`  Evidence: ${check.evidence.length} issues found`));
            }
            console.log('');
          });
        }

        // Show warnings
        const warnings = results.checks.filter(c => c.status === 'warning');
        if (warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Warnings:\n'));
          warnings.forEach(check => {
            console.log(chalk.yellow(`  ${check.name}`));
            console.log(chalk.gray(`  ${check.description}`));
            console.log('');
          });
        }

        // Generate full report
        const report = scanner.generateReport(results);

        if (options.save) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.save, JSON.stringify(report, null, 2));
          console.log(chalk.green(`\n✓ Compliance report saved to ${options.save}`));
        }
      } catch (error) {
        spinner.fail('Compliance scan failed');
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Session History Command
 */
export function registerHistoryCommand(program) {
  program
    .command('history')
    .description('Show command history')
    .option('--limit <n>', 'Number of commands to show', '20')
    .action(async (options) => {
      try {
        const store = getSessionStore();
        const commands = store.getRecentCommands(process.cwd(), parseInt(options.limit));

        if (commands.length === 0) {
          console.log(chalk.yellow('No command history found'));
          return;
        }

        console.log(chalk.cyan('\n📜 Command History\n'));
        commands.forEach((cmd, _i) => {
          const timestamp = new Date(cmd.timestamp).toLocaleString();
          const success = cmd.success ? chalk.green('✓') : chalk.red('✗');
          console.log(`${success} ${chalk.white(cmd.command)} ${chalk.gray(timestamp)}`);
          if (cmd.findings_count > 0) {
            console.log(chalk.gray(`   Findings: ${cmd.findings_count}`));
          }
        });
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

/**
 * Learning Stats Command
 */
export function registerLearningCommand(program) {
  program
    .command('learning')
    .description('Show learning statistics and suggestions')
    .option('--report', 'Generate full learning report')
    .option('--export <file>', 'Export learning data')
    .action(async (options) => {
      try {
        const learning = createLearningSystem(process.cwd());

        if (options.report) {
          const spinner = ora('Generating learning report...').start();
          const report = await learning.generateLearningReport();
          spinner.succeed('Report generated');

          console.log(chalk.cyan('\n🧠 Learning Report\n'));
          console.log(chalk.white('Project:'), report.project);
          console.log(chalk.white('Generated:'), report.timestamp);

          console.log(chalk.cyan('\n📊 Statistics:\n'));
          console.log(chalk.white('Feedback:'), JSON.stringify(report.statistics.feedback, null, 2));
          console.log(chalk.white('Fix Success Rate:'), report.statistics.fixSuccessRate);
          console.log(chalk.white('Learned Patterns:'), report.statistics.learnedPatterns);
          console.log(chalk.white('Suggested Suppressions:'), report.statistics.suggestedSuppressions);

          if (report.insights.length > 0) {
            console.log(chalk.cyan('\n💡 Insights:\n'));
            report.insights.forEach(insight => {
              console.log(chalk.white(`• ${insight.message}`));
            });
          }
        } else {
          const stats = learning.getStats();
          console.log(chalk.cyan('\n🧠 Learning Statistics\n'));
          console.log(chalk.white('Feedback:'), JSON.stringify(stats.feedbackCount, null, 2));
          console.log(chalk.white('Fix Success Rate:'), stats.fixSuccessRate);
          console.log(chalk.white('Learned Patterns:'), stats.learnedPatterns);
          console.log(chalk.white('Suggested Suppressions:'), stats.suggestedSuppressions);
          console.log(chalk.white('Corrections:'), stats.corrections);
        }

        if (options.export) {
          const data = await learning.exportLearningData();
          const fs = await import('fs/promises');
          await fs.writeFile(options.export, JSON.stringify(data, null, 2));
          console.log(chalk.green(`\n✓ Learning data exported to ${options.export}`));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
    });
}

// Helper functions
function getRiskColor(risk) {
  switch (risk.toLowerCase()) {
    case 'critical': return chalk.red.bold;
    case 'high': return chalk.red;
    case 'medium': return chalk.yellow;
    case 'low': return chalk.green;
    default: return chalk.white;
  }
}

function getRiskScoreColor(score) {
  if (score >= 80) return chalk.red.bold;
  if (score >= 60) return chalk.red;
  if (score >= 40) return chalk.yellow;
  if (score >= 20) return chalk.green;
  return chalk.green.bold;
}

function getScoreColor(score) {
  if (score >= 90) return chalk.green.bold;
  if (score >= 70) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

export function registerAllEnhancedCommands(program) {
  registerInteractiveCommand(program);
  registerContextCommand(program);
  registerSearchCommand(program);
  registerAskCommand(program);
  registerTraceCommand(program);
  registerImpactCommand(program);
  registerAttackSurfaceCommand(program);
  registerThreatModelCommand(program);
  registerComplianceCommand(program);
  registerHistoryCommand(program);
  registerLearningCommand(program);
}

export default {
  registerAllEnhancedCommands,
  registerInteractiveCommand,
  registerContextCommand,
  registerSearchCommand,
  registerAskCommand,
  registerTraceCommand,
  registerImpactCommand,
  registerAttackSurfaceCommand,
  registerThreatModelCommand,
  registerComplianceCommand,
  registerHistoryCommand,
  registerLearningCommand
};
