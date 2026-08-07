import fs from 'node:fs/promises';
import path from 'node:path';

export interface EvalTraceEvent { type: string; round?: number; toolName?: string; phase?: string; error?: string; }
export type EvalTag = 'qa' | 'wiki' | 'tools' | 'security' | 'retrieval' | 'citation' | 'abstention';
export interface EvalCitation { file: string; title?: string; heading?: string; sourceFile?: string; chunkId?: string; refId?: string; }
export interface EvalCase {
  id: string; agent?: string; input: string; tags: EvalTag[];
  expected: {
    mustContain?: string[];
    mustContainAny?: string[][];
    mustNotContain?: string[];
    mustUseTools?: string[];
    mustNotUseTools?: string[];
    maxToolCalls?: number;
    mustRequireApproval?: boolean;
    approvalTool?: string;
    mustNotExecuteBeforeApproval?: boolean;
    requiredSourceFiles?: string[];
    requiredSourceChunks?: string[];
    minCitations?: number;
    mustAbstain?: boolean;
    abstainMarkers?: string[];
  };
}
export interface EvalDataset { name: string; version: string; cases: EvalCase[]; }
export interface EvalExecution { content: string; events: EvalTraceEvent[]; citations?: EvalCitation[]; }
export interface EvalCaseResult { caseId: string; runIndex: number; passed: boolean; vetoed: boolean; reasons: string[]; content: string; citations: EvalCitation[]; citationCount: number; citationCoverage: number; abstained: boolean; rounds: number; toolCalls: number; successfulToolCalls: number; retries: number; loopDetected: boolean; approvalRequired: boolean; latencyMs: number; }
export interface EvalReport { dataset: string; version: string; runsPerCase: number; generatedAt: string; summary: { totalRuns: number; passedRuns: number; passAt1: number; passPowerK: number; toolSuccessRate: number; averageRounds: number; averageToolCalls: number; retryRate: number; loopRate: number; averageLatencyMs: number; citationCoverageRate: number; citationAccuracyRate: number; abstentionAccuracy: number }; results: EvalCaseResult[]; }
export type AgentEvalExecutor = (evalCase: EvalCase) => Promise<EvalExecution>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

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
  if (!isStringArray(candidate.tags) || !candidate.tags.length) throw new Error(`Invalid tags: ${candidate.id}`);
  if (!candidate.expected || typeof candidate.expected !== 'object') throw new Error(`Invalid expected: ${candidate.id}`);
  const expected = candidate.expected as EvalCase['expected'];
  for (const field of ['mustContain', 'mustNotContain', 'mustUseTools', 'mustNotUseTools', 'abstainMarkers'] as const) {
    if (expected[field] !== undefined && !isStringArray(expected[field])) throw new Error(`Invalid ${field}: ${candidate.id}`);
  }
  if (expected.mustContainAny && (!Array.isArray(expected.mustContainAny) || expected.mustContainAny.some(group => !Array.isArray(group) || group.length === 0))) {
    throw new Error(`Invalid mustContainAny: ${candidate.id}`);
  }
  if (expected.mustContainAny && expected.mustContainAny.some(group => !isStringArray(group))) throw new Error(`Invalid mustContainAny: ${candidate.id}`);
  if (expected.requiredSourceFiles && (!Array.isArray(expected.requiredSourceFiles) || expected.requiredSourceFiles.some(value => typeof value !== 'string' || !value))) {
    throw new Error(`Invalid requiredSourceFiles: ${candidate.id}`);
  }
  if (expected.requiredSourceChunks && (!Array.isArray(expected.requiredSourceChunks) || expected.requiredSourceChunks.some(value => typeof value !== 'string' || !value))) {
    throw new Error(`Invalid requiredSourceChunks: ${candidate.id}`);
  }
  if (expected.minCitations !== undefined && (!Number.isInteger(expected.minCitations) || expected.minCitations < 0)) {
    throw new Error(`Invalid minCitations: ${candidate.id}`);
  }
  if (expected.mustAbstain !== undefined && typeof expected.mustAbstain !== 'boolean') throw new Error(`Invalid mustAbstain: ${candidate.id}`);
  if (expected.mustAbstain === true && (!isStringArray(expected.abstainMarkers) || expected.abstainMarkers.length === 0)) throw new Error(`Invalid abstainMarkers: ${candidate.id}`);
}

/** 使用答案和轨迹执行确定性验收。 */
export function verifyExecution(evalCase: EvalCase, execution: EvalExecution, runIndex: number, latencyMs: number): EvalCaseResult {
  const content = execution.content.toLowerCase(); const events = execution.events;
  const starts = events.filter(event => event.type === 'tool_call_start'); const ends = events.filter(event => event.type === 'tool_call_end');
  const errors = events.filter(event => event.type === 'tool_call_error'); const approvals = events.filter(event => event.type === 'approval_required');
  const citations = execution.citations || [];
  const citedFiles = citations.map(citation => `${citation.file} ${citation.title || ''} ${citation.sourceFile || ''}`.toLocaleLowerCase());
  const citedChunks = citations.map(citation => citation.chunkId || '').filter(Boolean);
  const sourceFileChecks = (evalCase.expected.requiredSourceFiles || []).map(source => citedFiles.some(file => file.includes(source.toLocaleLowerCase())));
  const sourceChunkChecks = (evalCase.expected.requiredSourceChunks || []).map(chunk => citedChunks.includes(chunk));
  const citationChecks = [
    ...sourceFileChecks,
    ...sourceChunkChecks,
    ...(evalCase.expected.minCitations !== undefined ? [citations.length >= evalCase.expected.minCitations] : []),
  ];
  const citationCoverage = citationChecks.length > 0
    ? citationChecks.filter(Boolean).length / citationChecks.length
    : citations.length > 0 ? 1 : 0;
  const reasons: string[] = []; let vetoed = false;
  for (const value of evalCase.expected.mustContain || []) if (!content.includes(value.toLowerCase())) reasons.push(`missing answer content: ${value}`);
  for (const group of evalCase.expected.mustContainAny || []) if (!group.some(value => content.includes(value.toLowerCase()))) reasons.push(`missing answer alternatives: ${group.join(' / ')}`);
  for (const value of evalCase.expected.mustNotContain || []) if (content.includes(value.toLowerCase())) reasons.push(`forbidden answer content: ${value}`);
  const toolNames = starts.map(event => event.toolName);
  for (const tool of evalCase.expected.mustUseTools || []) if (!toolNames.includes(tool)) reasons.push(`missing tool: ${tool}`);
  for (const tool of evalCase.expected.mustNotUseTools || []) if (toolNames.includes(tool)) reasons.push(`forbidden tool: ${tool}`);
  if (evalCase.expected.maxToolCalls !== undefined && starts.length > evalCase.expected.maxToolCalls) reasons.push('tool call limit exceeded');
  for (const source of evalCase.expected.requiredSourceFiles || []) {
    const normalized = source.toLocaleLowerCase();
    if (!citedFiles.some(file => file.includes(normalized))) reasons.push(`missing required source: ${source}`);
  }
  for (const chunk of evalCase.expected.requiredSourceChunks || []) if (!citedChunks.includes(chunk)) reasons.push(`missing required source chunk: ${chunk}`);
  if (evalCase.expected.minCitations !== undefined && citations.length < evalCase.expected.minCitations) reasons.push(`not enough citations: expected ${evalCase.expected.minCitations}, got ${citations.length}`);
  const abstainMarkers = (evalCase.expected.abstainMarkers || []).map(marker => marker.toLocaleLowerCase());
  const abstained = abstainMarkers.length > 0 && abstainMarkers.some(marker => content.includes(marker));
  if (evalCase.expected.mustAbstain && !abstained) reasons.push('answer did not abstain');
  if (!evalCase.expected.mustAbstain && abstained) reasons.push('answer abstained unexpectedly');
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
  return { caseId: evalCase.id, runIndex, passed, vetoed, reasons, content: execution.content, citations, citationCount: citations.length, citationCoverage, abstained, rounds: new Set(events.filter(event => event.round !== undefined).map(event => event.round)).size, toolCalls: starts.length, successfulToolCalls: ends.length, retries: errors.filter(event => event.phase === 'retrying').length, loopDetected, approvalRequired: approvals.length > 0, latencyMs };
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
  const citationCases = dataset.cases.filter(item => (item.expected.requiredSourceFiles?.length || item.expected.requiredSourceChunks?.length || item.expected.minCitations !== undefined));
  const citationResults = results.filter(result => citationCases.some(item => item.id === result.caseId));
  const abstentionCases = dataset.cases.filter(item => item.expected.mustAbstain !== undefined);
  const abstentionResults = results.filter(result => abstentionCases.some(item => item.id === result.caseId));
  const citationCoverageRate = citationResults.length > 0 ? citationResults.reduce((sum, result) => sum + result.citationCoverage, 0) / citationResults.length : 0;
  const citationAccuracyRate = citationResults.filter(result => result.citationCoverage === 1).length / Math.max(1, citationResults.length);
  return { dataset: dataset.name, version: dataset.version, runsPerCase, generatedAt: new Date().toISOString(), summary: { totalRuns, passedRuns, passAt1: firstRuns.filter(result => result.passed).length / Math.max(1, firstRuns.length), passPowerK, toolSuccessRate: successfulTools / Math.max(1, totalTools), averageRounds: average(result => result.rounds), averageToolCalls: average(result => result.toolCalls), retryRate: results.filter(result => result.retries > 0).length / Math.max(1, totalRuns), loopRate: results.filter(result => result.loopDetected).length / Math.max(1, totalRuns), averageLatencyMs: average(result => result.latencyMs), citationCoverageRate, citationAccuracyRate, abstentionAccuracy: abstentionResults.filter(result => result.passed).length / Math.max(1, abstentionResults.length) }, results };
}

/** 将评估报告写入 JSON 文件。 */
export async function writeReport(report: EvalReport, outputPath: string): Promise<void> { await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); }

/** 返回数据集文件路径。 */
export function datasetPath(directory: string, name: string): string { if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid dataset name: ${name}`); return path.resolve(directory, `${name}.json`); }
