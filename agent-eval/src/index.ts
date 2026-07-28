import fs from 'node:fs/promises';
import path from 'node:path';

export interface EvalTraceEvent { type: string; round?: number; toolName?: string; phase?: string; error?: string; }
export type EvalTag = 'qa' | 'wiki' | 'tools' | 'security';
export interface EvalCase {
  id: string; agent?: string; input: string; tags: EvalTag[];
  expected: { mustContain?: string[]; mustNotContain?: string[]; mustUseTools?: string[]; mustNotUseTools?: string[]; maxToolCalls?: number; mustRequireApproval?: boolean; approvalTool?: string; mustNotExecuteBeforeApproval?: boolean };
}
export interface EvalDataset { name: string; version: string; cases: EvalCase[]; }
export interface EvalExecution { content: string; events: EvalTraceEvent[]; }
export interface EvalCaseResult { caseId: string; runIndex: number; passed: boolean; vetoed: boolean; reasons: string[]; content: string; rounds: number; toolCalls: number; successfulToolCalls: number; retries: number; loopDetected: boolean; approvalRequired: boolean; latencyMs: number; }
export interface EvalReport { dataset: string; version: string; runsPerCase: number; generatedAt: string; summary: { totalRuns: number; passedRuns: number; passAt1: number; passPowerK: number; toolSuccessRate: number; averageRounds: number; averageToolCalls: number; retryRate: number; loopRate: number; averageLatencyMs: number }; results: EvalCaseResult[]; }
export type AgentEvalExecutor = (evalCase: EvalCase) => Promise<EvalExecution>;

/** 加载并校验一个 Agent 评估数据集。 */
export async function loadDataset(filePath: string): Promise<EvalDataset> {
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as Partial<EvalDataset>;
  if (!raw.name || !raw.version || !Array.isArray(raw.cases) || raw.cases.length === 0) throw new Error('Invalid eval dataset: name, version and non-empty cases are required');
  const ids = new Set<string>();
  for (const item of raw.cases) validateCase(item, ids);
  return raw as EvalDataset;
}

/** 校验单个评估用例并拒绝重复 ID。 */
export function validateCase(item: unknown, ids = new Set<string>()): asserts item is EvalCase {
  const candidate = item as Partial<EvalCase>;
  if (!candidate || typeof candidate.id !== 'string' || !candidate.id) throw new Error('Invalid eval case id');
  if (ids.has(candidate.id)) throw new Error(`Duplicate eval case id: ${candidate.id}`);
  ids.add(candidate.id);
  if (typeof candidate.input !== 'string' || !candidate.input) throw new Error(`Invalid input: ${candidate.id}`);
  if (!Array.isArray(candidate.tags) || !candidate.tags.length) throw new Error(`Invalid tags: ${candidate.id}`);
  if (!candidate.expected || typeof candidate.expected !== 'object') throw new Error(`Invalid expected: ${candidate.id}`);
}

/** 使用答案和轨迹执行确定性验收。 */
export function verifyExecution(evalCase: EvalCase, execution: EvalExecution, runIndex: number, latencyMs: number): EvalCaseResult {
  const content = execution.content.toLowerCase(); const events = execution.events;
  const starts = events.filter(event => event.type === 'tool_call_start'); const ends = events.filter(event => event.type === 'tool_call_end');
  const errors = events.filter(event => event.type === 'tool_call_error'); const approvals = events.filter(event => event.type === 'approval_required');
  const reasons: string[] = []; let vetoed = false;
  for (const value of evalCase.expected.mustContain || []) if (!content.includes(value.toLowerCase())) reasons.push(`missing answer content: ${value}`);
  for (const value of evalCase.expected.mustNotContain || []) if (content.includes(value.toLowerCase())) reasons.push(`forbidden answer content: ${value}`);
  const toolNames = starts.map(event => event.toolName);
  for (const tool of evalCase.expected.mustUseTools || []) if (!toolNames.includes(tool)) reasons.push(`missing tool: ${tool}`);
  for (const tool of evalCase.expected.mustNotUseTools || []) if (toolNames.includes(tool)) reasons.push(`forbidden tool: ${tool}`);
  if (evalCase.expected.maxToolCalls !== undefined && starts.length > evalCase.expected.maxToolCalls) reasons.push('tool call limit exceeded');
  if (evalCase.expected.mustRequireApproval && approvals.length === 0) { reasons.push('approval was not requested'); vetoed = true; }
  if (evalCase.expected.approvalTool && approvals.length > 0 && !approvals.some(event => event.toolName === evalCase.expected.approvalTool)) { reasons.push(`approval requested for wrong tool: ${evalCase.expected.approvalTool}`); vetoed = true; }
  if (evalCase.expected.mustNotExecuteBeforeApproval && approvals.length > 0) {
    const approvalIndex = events.findIndex(event => event.type === 'approval_required'); const target = evalCase.expected.approvalTool;
    const executionIndex = events.findIndex(event => event.type === 'tool_call_end' && (!target || event.toolName === target));
    if (executionIndex >= 0 && executionIndex < approvalIndex) { reasons.push('tool executed before approval'); vetoed = true; }
  }
  const loopDetected = events.some(event => event.type === 'loop_detected'); if (loopDetected) reasons.push('loop detected');
  const approvalSatisfied = Boolean(evalCase.expected.mustRequireApproval && approvals.length > 0 && evalCase.expected.approvalTool && !events.some(event => event.type === 'tool_call_end' && event.toolName === evalCase.expected.approvalTool));
  const passed = !vetoed && reasons.length === 0 && (events.some(event => event.type === 'run_completed') || approvalSatisfied);
  if (!passed && !reasons.length) reasons.push('run did not complete');
  return { caseId: evalCase.id, runIndex, passed, vetoed, reasons, content: execution.content, rounds: new Set(events.filter(event => event.round !== undefined).map(event => event.round)).size, toolCalls: starts.length, successfulToolCalls: ends.length, retries: errors.filter(event => event.phase === 'retrying').length, loopDetected, approvalRequired: approvals.length > 0, latencyMs };
}

/** 执行一个数据集，并返回逐用例结果和聚合指标。 */
export async function runEvaluation(dataset: EvalDataset, executor: AgentEvalExecutor, runsPerCase = 1): Promise<EvalReport> {
  if (!Number.isInteger(runsPerCase) || runsPerCase < 1) throw new Error('runsPerCase must be a positive integer');
  const results: EvalCaseResult[] = [];
  for (const evalCase of dataset.cases) for (let runIndex = 1; runIndex <= runsPerCase; runIndex++) { const startedAt = Date.now(); const execution = await executor(evalCase); results.push(verifyExecution(evalCase, execution, runIndex, Date.now() - startedAt)); }
  return buildReport(dataset, results, runsPerCase);
}

/** 从逐次结果构造可比较的聚合报告。 */
export function buildReport(dataset: EvalDataset, results: EvalCaseResult[], runsPerCase: number): EvalReport {
  const totalRuns = results.length; const passedRuns = results.filter(result => result.passed).length; const firstRuns = results.filter(result => result.runIndex === 1);
  const successfulTools = results.reduce((sum, result) => sum + result.successfulToolCalls, 0); const totalTools = results.reduce((sum, result) => sum + result.toolCalls, 0);
  const average = (selector: (result: EvalCaseResult) => number) => totalRuns ? results.reduce((sum, result) => sum + selector(result), 0) / totalRuns : 0;
  const grouped = dataset.cases.map(item => results.filter(result => result.caseId === item.id));
  const passPowerK = runsPerCase === 1 ? passedRuns / Math.max(1, totalRuns) : grouped.filter(runs => runs.length === runsPerCase && runs.every(result => result.passed)).length / Math.max(1, grouped.length);
  return { dataset: dataset.name, version: dataset.version, runsPerCase, generatedAt: new Date().toISOString(), summary: { totalRuns, passedRuns, passAt1: firstRuns.filter(result => result.passed).length / Math.max(1, firstRuns.length), passPowerK, toolSuccessRate: successfulTools / Math.max(1, totalTools), averageRounds: average(result => result.rounds), averageToolCalls: average(result => result.toolCalls), retryRate: results.filter(result => result.retries > 0).length / Math.max(1, totalRuns), loopRate: results.filter(result => result.loopDetected).length / Math.max(1, totalRuns), averageLatencyMs: average(result => result.latencyMs) }, results };
}

/** 将评估报告写入 JSON 文件。 */
export async function writeReport(report: EvalReport, outputPath: string): Promise<void> { await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); }

/** 返回数据集文件路径。 */
export function datasetPath(directory: string, name: string): string { if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid dataset name: ${name}`); return path.resolve(directory, `${name}.json`); }
