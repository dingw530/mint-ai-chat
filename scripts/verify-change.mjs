#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildVerificationChecks, createEvidence } from './verification-profiles.mjs';

/** Parse the explicit profile and optional evidence-output flags. */
function parseArgs(args) {
  const options = { dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--profile') options.profile = args[++index];
    else if (arg === '--change') options.change = args[++index];
    else if (arg === '--evidence-file') options.evidenceFile = args[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.profile) throw new Error('Usage: verify-change.mjs --profile <name> [--change <id>] [--dry-run] [--evidence-file <path>]');
  return options;
}

/** Run one profile check synchronously, or return a dry-run plan. */
function runCheck(check, dryRun) {
  const command = [check.command, ...check.args].join(' ');
  if (dryRun) return { ...check, command, status: 'planned' };

  const result = spawnSync(check.command, check.args, { stdio: 'inherit' });
  if (result.error) return { ...check, command, status: 'failed', error: result.error.message };
  return { ...check, command, status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status ?? 1 };
}

/** Persist evidence only when a caller explicitly selected an output file. */
async function writeEvidence(file, evidence) {
  if (!file) return;
  const target = resolve(file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`);
}

/** Execute the selected validation profile and report structured evidence. */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const plannedChecks = buildVerificationChecks(options.profile, options.change);
  const completedChecks = [];

  for (const check of plannedChecks) {
    const result = runCheck(check, options.dryRun);
    completedChecks.push(result);
    if (result.status === 'failed') break;
  }

  const evidence = createEvidence(options.profile, completedChecks, startedAt, new Date().toISOString());
  await writeEvidence(options.evidenceFile, evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[verify-change] ${error.message}`);
  process.exitCode = 2;
});
