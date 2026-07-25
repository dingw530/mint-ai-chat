import { spawn } from 'node:child_process';

function runGit(rootDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `git exited ${code}`)));
  });
}

function parseStatusPaths(output) {
  return output.split('\0').filter(Boolean).map((entry) => {
    const value = entry.slice(3);
    return value.includes(' -> ') ? value.split(' -> ').at(-1) : value;
  });
}

export async function captureWorktree(rootDir) {
  return new Set(parseStatusPaths(await runGit(rootDir, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])));
}

function matchesPath(filePath, rule) {
  if (rule.endsWith('/')) return filePath === rule.slice(0, -1) || filePath.startsWith(rule);
  return filePath === rule;
}

/**
 * 只比较本轮新增变化，避免误伤运行前已有的用户改动。
 * @param {Set<string>} before
 * @param {Set<string>} after
 * @param {string[]} allowedPaths
 * @param {string[]} protectedPaths
 * @param {string[]} [ignoredPaths]
 */
export function evaluateDiff(before, after, allowedPaths, protectedPaths, ignoredPaths = []) {
  const changedPaths = [...after]
    .filter((filePath) => !before.has(filePath))
    .filter((filePath) => !ignoredPaths.some((rule) => matchesPath(filePath, rule)))
    .sort();
  const protectedChanges = changedPaths.filter((filePath) => protectedPaths.some((rule) => matchesPath(filePath, rule)));
  const outOfScope = allowedPaths.length === 0
    ? changedPaths
    : changedPaths.filter((filePath) => !allowedPaths.some((rule) => matchesPath(filePath, rule)));
  const violations = [...new Set([...protectedChanges.map((filePath) => `protected path: ${filePath}`), ...outOfScope.map((filePath) => `out of scope: ${filePath}`)])];
  return { changedPaths, protectedChanges, outOfScope, violations, allowed: violations.length === 0 };
}
