/**
 * Task Planning Agent - Autonomous task decomposition and planning
 * Uses ReAct (Reasoning + Acting) pattern for complex multi-step tasks
 *
 * Inspired by:
 * - Anthropic's extended thinking
 * - OpenAI's chain-of-thought prompting
 * - DeepMind's task decomposition research
 */

import { getLLMOrchestrator } from '../llm/llmOrchestrator.js';

export class TaskPlannerAgent {
  constructor(options = {}) {
    this.orchestrator = getLLMOrchestrator();
    this.maxDepth = options.maxDepth || 5;
    this.maxTokens = options.maxTokens || 4000;
    this.reasoningThreshold = options.reasoningThreshold || 0.8;
    this.tasks = new Map();
    this.executionHistory = [];
  }

  /**
   * Decompose a complex task into subtasks
   * Uses ReAct (Reasoning + Acting) pattern
   */
  async decomposeTasks(goal, context = {}) {
    const reasoning = await this.reasonAboutTask(goal, context);

    if (!reasoning.success) {
      return {
        success: false,
        error: reasoning.error,
        tasks: []
      };
    }

    const steps = await this.extractExecutableSteps(reasoning);
    const tasks = steps.map((step, idx) => ({
      id: `task_${Date.now()}_${idx}`,
      title: step.title,
      description: step.description,
      category: step.category,
      priority: step.priority || 'medium',
      dependencies: step.dependencies || [],
      estimatedDuration: step.duration || 5,
      tools: step.tools || [],
      successCriteria: step.criteria || [],
      reasoning: step.reasoning
    }));

    return {
      success: true,
      goal,
      totalTasks: tasks.length,
      tasks,
      reasoning: reasoning.thinking
    };
  }

  /**
   * ReAct: Reason about the task
   */
  async reasonAboutTask(goal, context) {
    const prompt = `You are a task planning AI. Reason through this goal and plan the optimal execution strategy.

GOAL: ${goal}

CONTEXT: ${JSON.stringify(context, null, 2)}

Think step-by-step about:
1. What needs to be done? (Break down the goal)
2. What are the dependencies? (What must be done first?)
3. What tools/resources are needed?
4. What are potential risks or blockers?
5. What's the optimal order of execution?

Provide your reasoning:`;

    try {
      const result = await this.orchestrator.chat(prompt, {
        temperature: 0.3,
        maxTokens: this.maxTokens
      });

      if (result?.text) {
        return {
          success: true,
          thinking: result.text
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract executable steps from reasoning
   */
  async extractExecutableSteps(reasoning) {
    const prompt = `Based on this reasoning about a task:

${reasoning.thinking}

Generate a structured list of executable steps. For each step provide:
1. Title (short, clear action)
2. Description (what to do)
3. Category (analysis|implementation|testing|documentation|deployment)
4. Priority (high|medium|low)
5. Dependencies (which previous steps must complete first?)
6. Tools needed (shell|git|npm|linter|test|lint)
7. Success criteria (how to know it's done)

Format as JSON array of step objects.`;

    try {
      const result = await this.orchestrator.chat(prompt, {
        temperature: 0.2,
        maxTokens: this.maxTokens
      });

      if (result?.text) {
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } catch (error) {
      console.warn('Failed to extract steps:', error.message);
    }

    return [];
  }

  /**
   * Execute a task plan
   */
  async executePlan(plan, executor = {}) {
    const { tasks, goal } = plan;
    const execution = {
      id: `exec_${Date.now()}`,
      goal,
      startTime: Date.now(),
      results: [],
      completed: [],
      failed: [],
      skipped: []
    };

    // Build dependency graph
    const taskMap = new Map();
    tasks.forEach(task => taskMap.set(task.id, task));

    // Execute tasks respecting dependencies
    for (const task of tasks) {
      const taskExecution = await this.executeTask(task, execution, executor);

      if (taskExecution.success) {
        execution.completed.push(task.id);
      } else if (taskExecution.skip) {
        execution.skipped.push(task.id);
      } else {
        execution.failed.push({ taskId: task.id, error: taskExecution.error });

        // Stop on critical failure
        if (task.critical) {
          break;
        }
      }

      execution.results.push(taskExecution);
    }

    execution.endTime = Date.now();
    execution.duration = execution.endTime - execution.startTime;
    execution.successRate = execution.completed.length / tasks.length;

    this.executionHistory.push(execution);
    return execution;
  }

  /**
   * Execute a single task
   */
  async executeTask(task, execution = {}, executor = {}) {
    console.log(`\n📋 Executing: ${task.title}`);

    // Check dependencies
    for (const depId of task.dependencies) {
      if (!execution.completed?.includes(depId)) {
        return {
          success: false,
          skip: true,
          taskId: task.id,
          reason: `Dependency ${depId} not completed`
        };
      }
    }

    try {
      // Determine which tool to use
      const tool = task.tools?.[0];
      let result = {};

      if (executor[tool]) {
        result = await executor[tool](task);
      } else {
        // Default: use LLM to suggest implementation
        result = await this.suggestImplementation(task);
      }

      // Evaluate success
      const isSuccessful = this.evaluateSuccess(task, result);

      return {
        success: isSuccessful,
        taskId: task.id,
        title: task.title,
        result,
        metrics: {
          duration: (result.duration || 5),
          errors: result.errors || []
        }
      };
    } catch (error) {
      return {
        success: false,
        taskId: task.id,
        error: error.message
      };
    }
  }

  /**
   * Suggest implementation via LLM
   */
  async suggestImplementation(task) {
    const prompt = `Implement or explain how to accomplish this task:

Title: ${task.title}
Description: ${task.description}
Category: ${task.category}
Tools: ${task.tools?.join(', ') || 'any'}

Criteria for success: ${task.successCriteria?.join(', ') || 'completion'}

Provide a concise implementation plan or command to execute.`;

    try {
      const result = await this.orchestrator.chat(prompt, {
        temperature: 0.3,
        maxTokens: 2000
      });

      return {
        suggestion: result?.text || '',
        duration: 5
      };
    } catch (error) {
      return {
        error: error.message,
        duration: 0
      };
    }
  }

  /**
   * Evaluate if a task was completed successfully
   */
  evaluateSuccess(task, result) {
    if (result.error) return false;
    if (result.success === false) return false;

    // Check success criteria
    if (task.successCriteria && task.successCriteria.length > 0) {
      // Basic check: if criteria are mentioned in result
      const resultText = JSON.stringify(result);
      return task.successCriteria.some(criterion => resultText.includes(criterion));
    }

    return true;
  }

  /**
   * Get execution history
   */
  getHistory() {
    return this.executionHistory;
  }

  /**
   * Get execution statistics
   */
  getStats() {
    if (this.executionHistory.length === 0) {
      return { executions: 0, avgSuccessRate: 0, totalDuration: 0 };
    }

    const stats = {
      executions: this.executionHistory.length,
      avgSuccessRate: this.executionHistory.reduce((sum, e) => sum + e.successRate, 0) / this.executionHistory.length,
      totalDuration: this.executionHistory.reduce((sum, e) => sum + e.duration, 0),
      avgDuration: this.executionHistory.reduce((sum, e) => sum + e.duration, 0) / this.executionHistory.length,
      totalTasksCompleted: this.executionHistory.reduce((sum, e) => sum + e.completed.length, 0),
      totalTasksFailed: this.executionHistory.reduce((sum, e) => sum + e.failed.length, 0)
    };

    return stats;
  }
}

export default TaskPlannerAgent;
