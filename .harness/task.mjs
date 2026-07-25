/**
 * @typedef {Object} HarnessCheck
 * @property {string} name
 * @property {string} command
 * @property {string[]} [args]
 * @property {number} [timeoutMs]
 * @property {string} [cwd]
 * @property {string[]} [artifacts]
 * @property {Record<string, string>} [env]
 */

/**
 * @typedef {Object} HarnessTask
 * @property {string} changeId
 * @property {string} changeDir
 * @property {string|null} currentTp
 * @property {string[]} acceptanceCriteria
 * @property {string[]} designDecisions
 * @property {string[]} taskPlans
 * @property {HarnessCheck[]} checks
 * @property {string[]} allowedPaths
 * @property {string[]} protectedPaths
 * @property {number} maxIterations
 */

export function defaultHarnessConfig() {
  return {
    maxIterations: 3,
    allowedPaths: [],
    protectedPaths: [
      '.harness/',
      '.claude/skills/',
      'tests/architecture/',
      'vitest.config.ts',
      'server/vitest.config.ts',
      'client/vitest.config.ts',
    ],
    checks: [
      {
        name: 'harness-test',
        command: 'npm',
        args: ['run', 'harness:test'],
        timeoutMs: 120000,
      },
      {
        name: 'browser-ac',
        command: 'node',
        args: ['.harness/browser-scenario.mjs'],
        timeoutMs: 120000,
      },
    ],
  };
}

/**
 * 创建 Harness 的运行任务协议。
 * @param {Object} input
 * @param {string} input.rootDir
 * @param {string} input.changeId
 * @param {import('./sdd-adapter.mjs').SddDocument} input.sdd
 * @param {Partial<HarnessTask>} [input.config]
 * @returns {HarnessTask}
 */
export function createHarnessTask({ rootDir, changeId, sdd, config = {} }) {
  const defaults = defaultHarnessConfig();
  const changeDir = sdd.changePath;
  return {
    changeId,
    changeDir,
    currentTp: sdd.currentTp || null,
    acceptanceCriteria: sdd.acceptanceCriteria,
    designDecisions: sdd.designDecisions,
    taskPlans: sdd.taskPlans,
    checks: config.checks || defaults.checks,
    allowedPaths: config.allowedPaths || defaults.allowedPaths,
    protectedPaths: config.protectedPaths || defaults.protectedPaths,
    maxIterations: config.maxIterations || defaults.maxIterations,
    rootDir,
  };
}

export function validateTask(task) {
  if (!task.changeId) throw new Error('Harness task requires changeId');
  if (!Array.isArray(task.checks) || task.checks.length === 0)
    throw new Error('Harness task requires at least one check');
  if (!Number.isInteger(task.maxIterations) || task.maxIterations < 1)
    throw new Error('Harness task maxIterations must be a positive integer');
  for (const check of task.checks) {
    if (!check.name || !check.command) throw new Error('Each check requires name and command');
    if (check.args && !Array.isArray(check.args)) throw new Error(`Check ${check.name} args must be an array`);
  }
  return task;
}
