#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const requiredVersion = process.env.MINT_REQUIRED_NODE_VERSION || '20.18.3';
const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: with-node-version.cjs <command> [...args]');
  process.exit(2);
}

function resolveNodeBin() {
  const candidates = [
    process.env.MINT_NODE_HOME
      ? path.join(process.env.MINT_NODE_HOME, 'bin')
      : null,
    path.join(os.homedir(), '.nvm', 'versions', 'node', `v${requiredVersion}`, 'bin'),
  ].filter(Boolean);

  for (const binDir of candidates) {
    const nodeBin = path.join(binDir, 'node');
    if (!fs.existsSync(nodeBin)) continue;

    const versionCheck = spawnSync(nodeBin, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
    });
    if (versionCheck.status === 0 && versionCheck.stdout.trim() === requiredVersion) {
      return binDir;
    }
  }

  throw new Error(
    `Node.js ${requiredVersion} is required but was not found. ` +
      `Run "nvm install ${requiredVersion}" or set MINT_NODE_HOME.`,
  );
}

let nodeBinDir;
try {
  nodeBinDir = resolveNodeBin();
} catch (error) {
  const sysVer = spawnSync('node', ['-p', 'process.versions.node'], { encoding: 'utf8' });
  if (sysVer.status !== 0) { console.error(`[node-version] ${error.message}`); process.exit(1); }
  const sysMajorMinor = sysVer.stdout.trim().split('.').slice(0, 2).join('.');
  const reqMajorMinor = requiredVersion.split('.').slice(0, 2).join('.');
  if (sysMajorMinor !== reqMajorMinor) { console.error(`[node-version] ${error.message}`); process.exit(1); }
  nodeBinDir = ''; // 使用系统 PATH
}

const env = {
  ...process.env,
  ...(nodeBinDir ? { PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH || ''}` } : {}),
};

const result = spawnSync(command, args, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[node-version] Failed to run ${command}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
