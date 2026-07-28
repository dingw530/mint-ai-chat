#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function findCompatibleNode() {
  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
  const versionsDir = path.join(nvmDir, 'versions', 'node');
  let versions = [];
  try {
    versions = fs.readdirSync(versionsDir)
      .filter(version => /^v(?:2[0-9]|[3-9][0-9])\./.test(version))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  } catch {
    return null;
  }

  for (const version of versions) {
    const nodePath = path.join(versionsDir, version, 'bin', 'node');
    if (fs.existsSync(nodePath)) return nodePath;
  }
  return null;
}

const nodePath = Number(process.versions.node.split('.')[0]) >= 20
  ? process.execPath
  : findCompatibleNode();

if (!nodePath) {
  process.stderr.write('GitNexus requires Node.js 20+. Install a Node 20+ version under NVM.\n');
  process.exit(1);
}

const nodeRoot = path.resolve(nodePath, '..', '..');
const installedCli = path.join(nodeRoot, 'lib', 'node_modules', 'gitnexus', 'dist', 'cli', 'index.js');
const runner = fs.existsSync(installedCli)
  ? installedCli
  : path.join(process.cwd(), '.gitnexus', 'run.cjs');

try {
  execFileSync(nodePath, [runner, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
} catch (error) {
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
