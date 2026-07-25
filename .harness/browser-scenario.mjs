#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const baseUrl = process.env.HARNESS_BROWSER_URL || 'http://localhost:5800';
const session = process.env.HARNESS_BROWSER_SESSION || `mint-harness-${process.pid}`;
const changeArgIndex = process.argv.indexOf('--change');
const changeId = process.env.HARNESS_CHANGE_ID || (changeArgIndex >= 0 ? process.argv[changeArgIndex + 1] : null);
const changeDir = process.env.HARNESS_CHANGE_DIR
  || (changeId ? path.join(process.cwd(), 'docs', 'changes', changeId) : null);
let declaredAcs = new Set((process.env.HARNESS_ACCEPTANCE_CRITERIA || '').split(',').filter(Boolean));

async function readScenarios() {
  if (!changeDir) throw new Error('缺少 HARNESS_CHANGE_DIR，无法定位当前 Spec 变更');
  if (declaredAcs.size === 0) {
    const sddText = await Promise.all(['product-spec.md', 'design-doc.md', 'traceability.md']
      .map((fileName) => fs.readFile(path.join(changeDir, fileName), 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      })));
    declaredAcs = new Set([...sddText.join('\n').matchAll(/\bAC-\d+\b/g)].map((match) => match[0]));
  }
  const filePath = path.join(changeDir, 'browser-scenarios.json');
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      process.stdout.write(`no browser scenarios declared for ${path.basename(changeDir)}\n`);
      return { scenarios: [] };
    }
    throw new Error(`无法读取 browser-scenarios.json：${error.message}`);
  }
}

function run(args) {
  const result = spawnSync('playwright-cli', [`-s=${session}`, ...args], {
    encoding: 'utf8',
    env: process.env,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  if (result.error) throw new Error(`无法执行 playwright-cli：${result.error.message}`);
  if (result.status !== 0) throw new Error(`playwright-cli 失败（${args.join(' ')}），退出码 ${result.status}`);
  return output;
}

function selectScenarios(document) {
  if (!Array.isArray(document.scenarios)) throw new Error('browser-scenarios.json 的 scenarios 必须是数组');
  for (const scenario of document.scenarios) {
    if (!scenario.id || !Array.isArray(scenario.acceptanceCriteria) || !scenario.route) {
      throw new Error('每个 browser scenario 必须包含 id、acceptanceCriteria 和 route');
    }
    const unknownAcs = scenario.acceptanceCriteria.filter((ac) => !declaredAcs.has(ac));
    if (unknownAcs.length > 0) {
      throw new Error(`${scenario.id} 引用了当前 Spec 未声明的 AC：${unknownAcs.join(', ')}`);
    }
  }
  return document.scenarios.filter((scenario) =>
    scenario.acceptanceCriteria.some((ac) => declaredAcs.has(ac)));
}

function assertScenario(scenario, snapshot) {
  const expectedUrl = new URL(scenario.route, baseUrl).toString();
  if (!snapshot.includes(`Page URL: ${expectedUrl}`)) throw new Error(`${scenario.id} 未到达 ${expectedUrl}`);
  for (const marker of scenario.markers || []) {
    if (!snapshot.includes(marker)) throw new Error(`${scenario.id} 缺少页面标记：${marker}`);
  }
  if (scenario.markersAny && !scenario.markersAny.some((marker) => snapshot.includes(marker))) {
    throw new Error(`${scenario.id} 缺少预期运行态标记：${scenario.markersAny.join(' / ')}`);
  }
  if (/Console:\s+[1-9]\d* errors?/.test(snapshot)) throw new Error(`${scenario.id} 存在 Console error`);
}

const document = await readScenarios();
const scenarios = selectScenarios(document);
if (scenarios.length === 0) {
  process.stdout.write(`no browser scenarios matched current AC: ${[...declaredAcs].join(', ')}\n`);
  process.exit(0);
}

let opened = false;
try {
  run(['open', new URL(scenarios[0].route, baseUrl).toString()]);
  opened = true;
  for (const scenario of scenarios) {
    run(['goto', new URL(scenario.route, baseUrl).toString()]);
    const snapshot = run(['snapshot']);
    assertScenario(scenario, snapshot);
    run(['console']);
    const requests = run(['requests']);
    if (/=>\s+\[(?:4|5)\d\d\]/.test(requests)) throw new Error(`${scenario.id} 存在 4xx/5xx 请求`);
    process.stdout.write(`scenario passed: ${scenario.id} (${scenario.acceptanceCriteria.join(', ')})\n`);
  }
} finally {
  if (opened) {
    try { run(['close']); } catch (error) {
      process.stderr.write(`关闭浏览器 session 失败：${error.message}\n`);
    }
  }
}
