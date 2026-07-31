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

function locatorExpression(target) {
  if (!target) return 'page.locator("body")';
  if (typeof target === 'string') return `page.locator(${JSON.stringify(target)})`;
  if (target.testId) return `page.getByTestId(${JSON.stringify(target.testId)})`;
  if (target.role) {
    const options = target.name === undefined ? '' : `, { name: ${JSON.stringify(target.name)}, exact: ${target.exact !== false} }`;
    return `page.getByRole(${JSON.stringify(target.role)}${options})`;
  }
  if (target.placeholder) return `page.getByPlaceholder(${JSON.stringify(target.placeholder)})`;
  if (target.label) return `page.getByLabel(${JSON.stringify(target.label)})`;
  if (target.text) {
    const locator = `page.getByText(${JSON.stringify(target.text)}, { exact: ${target.exact === true} })`;
    return target.index === undefined ? locator : `${locator}.nth(${target.index})`;
  }
  if (target.css) {
    const locator = `page.locator(${JSON.stringify(target.css)})`;
    return target.index === undefined ? locator : `${locator}.nth(${target.index})`;
  }
  throw new Error(`不支持的 locator：${JSON.stringify(target)}`);
}

function runPageCode(body) {
  const output = run(['run-code', `async page => { ${body} }`]);
  if (/^### Error\b/m.test(output)) {
    throw new Error(`Playwright page assertion failed:\n${output}`);
  }
  return output;
}

function routeBody(route) {
  return typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
}

function setupRoutes(scenario) {
  for (const route of scenario.setup?.routes || []) {
    const responseBodies = route.responses
      ? JSON.stringify(route.responses.map((value) => routeBody({ body: value })))
      : null;
    const body = routeBody(route);
    const controlBodies = route.controlBodies
      ? JSON.stringify(Object.fromEntries(Object.entries(route.controlBodies).map(([action, value]) => [action, routeBody({ body: value })])))
      : null;
    const bodyExpression = controlBodies
      ? `((${controlBodies})[request.postDataJSON()?.control?.action] || ${JSON.stringify(body)})`
      : JSON.stringify(body);
    const methodGuard = route.method ? `if (request.method() !== ${JSON.stringify(route.method)}) return route.fallback();` : '';
    const responseExpression = responseBodies
      ? `(${responseBodies})[Math.min(responseIndex++, ${route.responses.length - 1})]`
      : bodyExpression;
    runPageCode(`let responseIndex = 0; await page.route(${JSON.stringify(route.pattern)}, async route => { const request = route.request(); ${methodGuard} await route.fulfill({ status: ${route.status || 200}, contentType: ${JSON.stringify(route.contentType || (route.method === 'POST' && route.pattern.includes('/messages') ? 'text/event-stream' : 'application/json'))}, body: ${responseExpression} }); });`);
  }
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
}

function assertConsole(scenario, output) {
  const ignored = scenario.ignoreConsoleErrors || [];
  const errors = output.split('\n').filter((line) => line.startsWith('[ERROR]'));
  const unexpected = errors.filter((line) => !ignored.some((pattern) => line.includes(pattern)));
  if (unexpected.length > 0) {
    throw new Error(`${scenario.id} 存在未忽略的 Console error：\n${unexpected.join('\n')}`);
  }
}

function assertRequests(scenario, requests) {
  for (const assertion of scenario.assertRequests || []) {
    const haystack = requests;
    if (assertion.contains && !haystack.includes(assertion.contains)) {
      throw new Error(`${scenario.id} 未找到网络请求片段：${assertion.contains}`);
    }
    if (assertion.method && !haystack.includes(assertion.method)) {
      throw new Error(`${scenario.id} 未找到请求方法：${assertion.method}`);
    }
    if (assertion.status && !haystack.includes(`[${assertion.status}]`)) {
      throw new Error(`${scenario.id} 未找到响应状态：${assertion.status}`);
    }
    if (assertion.countAtLeast !== undefined) {
      const count = assertion.contains
        ? haystack.split(assertion.contains).length - 1
        : 0;
      if (count < assertion.countAtLeast) {
        throw new Error(`${scenario.id} 请求片段出现 ${count} 次，少于预期 ${assertion.countAtLeast} 次：${assertion.contains}`);
      }
    }
    if (assertion.countExactly !== undefined) {
      const count = assertion.contains
        ? haystack.split(assertion.contains).length - 1
        : 0;
      if (count !== assertion.countExactly) {
        throw new Error(`${scenario.id} 请求片段出现 ${count} 次，预期 ${assertion.countExactly} 次：${assertion.contains}`);
      }
    }
  }
  if (/=>\s+\[(?:4|5)\d\d\]/.test(requests)) throw new Error(`${scenario.id} 存在 4xx/5xx 请求`);
}

async function executeStep(scenario, step, index) {
  const label = `${scenario.id} step ${index + 1}`;
  switch (step.action) {
    case 'click': {
      const locator = locatorExpression(step.target);
      runPageCode(`const locator = ${locator}; await locator.waitFor({ state: 'visible', timeout: ${step.timeoutMs || 10000} }); await locator.click();`);
      return;
    }
    case 'fill': {
      const locator = locatorExpression(step.target);
      runPageCode(`const locator = ${locator}; await locator.waitFor({ state: 'visible', timeout: ${step.timeoutMs || 10000} }); await locator.fill(${JSON.stringify(step.value || '')});`);
      return;
    }
    case 'press': {
      const locator = locatorExpression(step.target);
      runPageCode(`const locator = ${locator}; await locator.press(${JSON.stringify(step.key)});`);
      return;
    }
    case 'waitFor': {
      const locator = step.target ? locatorExpression(step.target) : `page.getByText(${JSON.stringify(step.text)}, { exact: ${step.exact === true} })`;
      runPageCode(`const locator = ${locator}; await locator.waitFor({ state: '${step.state || 'visible'}', timeout: ${step.timeoutMs || 10000} });`);
      return;
    }
    case 'assertText': {
      const locator = step.target ? locatorExpression(step.target) : 'page.locator("body")';
      runPageCode(`const locator = ${locator}; await locator.waitFor({ state: 'visible', timeout: ${step.timeoutMs || 10000} }); const text = await locator.innerText(); if (!text.includes(${JSON.stringify(step.text)})) throw new Error(${JSON.stringify(`${label} 缺少文本：${step.text}`)});`);
      return;
    }
    case 'assertNotText': {
      const output = run(['snapshot']);
      if (output.includes(step.text)) throw new Error(`${label} 不应包含文本：${step.text}`);
      return;
    }
    case 'snapshot':
      run(['snapshot', ...(step.filename ? [`--filename=${step.filename}`] : [])]);
      return;
    case 'screenshot':
      run(['screenshot', ...(step.filename ? [`--filename=${step.filename}`] : [])]);
      return;
    case 'assertRequests':
      assertRequests(scenario, run(['requests']));
      return;
    case 'reload':
      run(['reload']);
      return;
    default:
      throw new Error(`${label} 不支持的 action：${step.action}`);
  }
}

const document = await readScenarios();
if (!Array.isArray(document.scenarios)) throw new Error('browser-scenarios.json 的 scenarios 必须是数组');
for (const scenario of document.scenarios) {
  if (!scenario.id || !Array.isArray(scenario.acceptanceCriteria) || !scenario.route) {
    throw new Error('每个 browser scenario 必须包含 id、acceptanceCriteria 和 route');
  }
  const unknownAcs = scenario.acceptanceCriteria.filter((ac) => !declaredAcs.has(ac));
  if (unknownAcs.length > 0) throw new Error(`${scenario.id} 引用了当前 Spec 未声明的 AC：${unknownAcs.join(', ')}`);
}
const scenarios = document.scenarios.filter((scenario) =>
  scenario.acceptanceCriteria.some((ac) => declaredAcs.has(ac)));
if (scenarios.length === 0) {
  process.stdout.write(`no browser scenarios matched current AC: ${[...declaredAcs].join(', ')}\n`);
  process.exit(0);
}

let opened = false;
try {
  run(['open']);
  opened = true;
  for (const scenario of scenarios) {
    setupRoutes(scenario);
    run(['goto', new URL(scenario.route, baseUrl).toString()]);
    assertScenario(scenario, run(['snapshot']));
    assertConsole(scenario, run(['console']));
    run(['tracing-start']);
    for (let index = 0; index < (scenario.steps || []).length; index += 1) {
      await executeStep(scenario, scenario.steps[index], index);
    }
    assertRequests(scenario, run(['requests']));
    assertConsole(scenario, run(['console']));
    run(['tracing-stop']);
    process.stdout.write(`scenario passed: ${scenario.id} (${scenario.acceptanceCriteria.join(', ')})\n`);
    run(['unroute']);
  }
} catch (error) {
  if (opened) {
    try { run(['snapshot', '--filename=harness-failure.yaml']); } catch {}
    try { run(['screenshot', '--filename=harness-failure.png']); } catch {}
    try { run(['console']); } catch {}
    try { run(['requests']); } catch {}
  }
  throw error;
} finally {
  if (opened) {
    try { run(['close']); } catch (error) {
      process.stderr.write(`关闭浏览器 session 失败：${error.message}\n`);
    }
  }
}
