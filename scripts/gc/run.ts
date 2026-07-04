#!/usr/bin/env tsx
/**
 * Garbage Collection Runner
 * Scans for architecture violations, doc drift, and entropy.
 * Read-only: reports issues, never auto-fixes.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
let exitCode = 0;

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
  const prefix = { INFO: '✓', WARN: '⚠', ERROR: '✗' }[level];
  console.log(`${prefix} ${msg}`);
  if (level === 'ERROR') exitCode = 1;
}

// 1. Architecture violation scan
function scanArchitecture() {
  log('INFO', 'Scanning architecture boundaries...');
  // Reuse the boundary test logic
  const { execSync } = require('child_process');
  try {
    execSync('cd server && npx vitest run __tests__/architecture/boundary.test.ts', {
      stdio: 'pipe',
      cwd: ROOT,
    });
    log('INFO', 'No architecture violations');
  } catch (e: any) {
    log('ERROR', 'Architecture violations found');
    console.log(e.stdout?.toString() || e.message);
  }
}

// 2. Doc drift check
function checkDocDrift() {
  log('INFO', 'Checking doc-code drift...');
  const docsDir = join(ROOT, 'docs');
  const srcDirs = ['server', 'client/src'];

  if (!statSync(docsDir, { throwIfNoEntry: false })?.isDirectory()) {
    log('WARN', 'docs/ directory not found');
    return;
  }

  const docFiles = readdirSync(docsDir, { recursive: true })
    .filter((f: any) => typeof f === 'string' && f.endsWith('.md'))
    .map((f: any) => join(docsDir, f));

  const srcFiles: string[] = [];
  for (const dir of srcDirs) {
    const fullDir = join(ROOT, dir);
    if (!statSync(fullDir, { throwIfNoEntry: false })?.isDirectory()) continue;
    readdirSync(fullDir, { recursive: true })
      .filter((f: any) => typeof f === 'string' && (f.endsWith('.ts') || f.endsWith('.tsx')))
      .forEach((f: any) => srcFiles.push(join(fullDir, f)));
  }

  if (srcFiles.length === 0) {
    log('WARN', 'No source files found');
    return;
  }

  const latestSrc = Math.max(...srcFiles.map(f => statSync(f).mtimeMs));
  const staleDocs = docFiles.filter(f => statSync(f).mtimeMs < latestSrc);

  if (staleDocs.length > 0) {
    log('WARN', `${staleDocs.length} doc(s) older than latest source change:`);
    staleDocs.slice(0, 5).forEach(f => console.log(`  - ${relative(ROOT, f)}`));
    if (staleDocs.length > 5) console.log(`  ... and ${staleDocs.length - 5} more`);
  } else {
    log('INFO', 'All docs are up to date');
  }
}

// 3. Large file check
function checkLargeFiles() {
  log('INFO', 'Checking for large files...');
  const WARN_LINES = 500;
  const ERROR_LINES = 800;

  function scanDir(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', '__tests__'].includes(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const lines = readFileSync(fullPath, 'utf-8').split('\n').length;
        const relPath = relative(ROOT, fullPath);
        if (lines > ERROR_LINES) {
          log('ERROR', `${relPath}: ${lines} lines (>${ERROR_LINES})`);
        } else if (lines > WARN_LINES) {
          log('WARN', `${relPath}: ${lines} lines (>${WARN_LINES})`);
        }
      }
    }
  }

  scanDir(join(ROOT, 'server'));
  scanDir(join(ROOT, 'client/src'));
}

// Run all checks
console.log('=== Garbage Collection Scan ===\n');
scanArchitecture();
console.log('');
checkDocDrift();
console.log('');
checkLargeFiles();
console.log(`\n=== Scan complete (exit code: ${exitCode}) ===`);
process.exit(exitCode);
