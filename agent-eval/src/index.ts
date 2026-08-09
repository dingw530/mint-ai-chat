import fs from 'node:fs/promises';
import path from 'node:path';

export interface EvalTraceEvent { type: string; round?: number; toolName?: string; phase?: string; error?: string; result?: string; }
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
    maxWikiSearchCalls?: number;
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
export interface EvalExecution { content: string; events: EvalTraceEvent[]; citations?: EvalCitation[]; retrievedCitations?: EvalCitation[]; }
export interface EvalCaseResult { caseId: string; runIndex: number; passed: boolean; queryPassed: boolean; answerPassed: boolean; retrievalPassed: boolean; toolBudgetPassed: boolean; abstentionPassed: boolean; vetoed: boolean; reasons: string[]; content: string; citations: EvalCitation[]; citationCount: number; retrievedCitationCount: number; citationCoverage: number; retrievalCoverage: number; abstained: boolean; rounds: number; toolCalls: number; wikiSearchCalls: number; unrelatedToolCalls: number; successfulToolCalls: number; retries: number; loopDetected: boolean; approvalRequired: boolean; latencyMs: number; }
export interface EvalReport { dataset: string; version: string; runsPerCase: number; generatedAt: string; summary: { totalRuns: number; passedRuns: number; queryPassedRuns: number; answerPassedRuns: number; passAt1: number; queryPassAt1: number; answerPassAt1: number; passPowerK: number; toolSuccessRate: number; toolBudgetPassRate: number; wikiSearchBudgetPassRate: number; averageRounds: number; averageToolCalls: number; averageWikiSearchCalls: number; unrelatedToolRate: number; retryRate: number; loopRate: number; averageLatencyMs: number; citationCoverageRate: number; citationAccuracyRate: number; retrievalCoverageRate: number; abstentionAccuracy: number }; results: EvalCaseResult[]; }
export type AgentEvalExecutor = (evalCase: EvalCase) => Promise<EvalExecution>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

function detectAbstention(content: string, markers: string[], mustAbstain: boolean): boolean {
  if (markers.some(marker => content.includes(marker.toLowerCase()))) return true;
  if (!mustAbstain) return false;
  return /(?:没有|未找到|不存在|未包含|无法(?:回答|确认|提供)|不足以).{0,40}(?:相关|资料|信息|定义|内容|数据|回答|证据|统计)/.test(content);
}

function buildEvidenceChecks(evalCase: EvalCase, citations: EvalCitation[]): boolean[] {
  const files = citations.map(citation => `${citation.file} ${citation.title || ''} ${citation.sourceFile || ''}`.toLocaleLowerCase());
  const chunks = citations.map(citation => citation.chunkId || '').filter(Boolean);
  return [
    ...(evalCase.expected.requiredSourceFiles || []).map(source => files.some(file => file.includes(source.toLocaleLowerCase()))),
    ...(evalCase.expected.requiredSourceChunks || []).map(chunk => chunks.includes(chunk)),
    ...(evalCase.expected.minCitations !== undefined ? [citations.length >= evalCase.expected.minCitations] : []),
  ];
}

function getWikiSearchBudget(evalCase: EvalCase): number | undefined {
  if (evalCase.expected.maxWikiSearchCalls !== undefined) return evalCase.expected.maxWikiSearchCalls;
  return evalCase.expected.mustUseTools?.includes('wiki_search') ? 2 : undefined;
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
  if (expected.maxWikiSearchCalls !== undefined && (!Number.isInteger(expected.maxWikiSearchCalls) || expected.maxWikiSearchCalls < 0)) {
    throw new Error(`Invalid maxWikiSearchCalls: ${candidate.id}`);
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
  const retrievedCitations = execution.retrievedCitations || citations;
  const citationChecks = buildEvidenceChecks(evalCase, citations);
  const retrievalChecks = buildEvidenceChecks(evalCase, retrievedCitations);
  const citationCoverage = citationChecks.length > 0
    ? citationChecks.filter(Boolean).length / citationChecks.length
    : citations.length > 0 ? 1 : 0;
  const reasons: string[] = []; let vetoed = false;
  for (const value of evalCase.expected.mustContain || []) if (!content.includes(value.toLowerCase())) reasons.push(`missing answer content: ${value}`);
  for (const group of evalCase.expected.mustContainAny || []) if (!group.some(value => content.includes(value.toLowerCase()))) reasons.push(`missing answer alternatives: ${group.join(' / ')}`);
  for (const value of evalCase.expected.mustNotContain || []) if (content.includes(value.toLowerCase())) reasons.push(`forbidden answer content: ${value}`);
  const toolNames = starts.map(event => event.toolName);
  const wikiSearchCalls = toolNames.filter(toolName => toolName === 'wiki_search').length;
  const unrelatedToolCalls = toolNames.filter(toolName => toolName !== 'wiki_search').length;
  const maxWikiSearchCalls = getWikiSearchBudget(evalCase);
  for (const tool of evalCase.expected.mustUseTools || []) if (!toolNames.includes(tool)) reasons.push(`missing tool: ${tool}`);
  for (const tool of evalCase.expected.mustNotUseTools || []) if (toolNames.includes(tool)) reasons.push(`forbidden tool: ${tool}`);
  if (evalCase.expected.maxToolCalls !== undefined && starts.length > evalCase.expected.maxToolCalls) reasons.push('tool call limit exceeded');
  if (maxWikiSearchCalls !== undefined && wikiSearchCalls > maxWikiSearchCalls) reasons.push('wiki search call limit exceeded');
  const citedFiles = citations.map(citation => `${citation.file} ${citation.title || ''} ${citation.sourceFile || ''}`.toLocaleLowerCase());
  const citedChunks = citations.map(citation => citation.chunkId || '').filter(Boolean);
  const retrievedFiles = retrievedCitations.map(citation => `${citation.file} ${citation.title || ''} ${citation.sourceFile || ''}`.toLocaleLowerCase());
  const retrievedChunks = retrievedCitations.map(citation => citation.chunkId || '').filter(Boolean);
  for (const source of evalCase.expected.requiredSourceFiles || []) {
    const normalized = source.toLocaleLowerCase();
    if (!citedFiles.some(file => file.includes(normalized))) reasons.push(`missing required source: ${source}`);
    if (!retrievedFiles.some(file => file.includes(normalized))) reasons.push(`retrieval missing required source: ${source}`);
  }
  for (const chunk of evalCase.expected.requiredSourceChunks || []) {
    if (!citedChunks.includes(chunk)) reasons.push(`missing required source chunk: ${chunk}`);
    if (!retrievedChunks.includes(chunk)) reasons.push(`retrieval missing required source chunk: ${chunk}`);
  }
  if (evalCase.expected.minCitations !== undefined && citations.length < evalCase.expected.minCitations) reasons.push(`not enough citations: expected ${evalCase.expected.minCitations}, got ${citations.length}`);
  if (evalCase.expected.minCitations !== undefined && retrievedCitations.length < evalCase.expected.minCitations) reasons.push(`not enough retrieved citations: expected ${evalCase.expected.minCitations}, got ${retrievedCitations.length}`);
  const abstainMarkers = (evalCase.expected.abstainMarkers || []).map(marker => marker.toLocaleLowerCase());
  const abstained = detectAbstention(content, abstainMarkers, evalCase.expected.mustAbstain === true);
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
  const completed = events.some(event => event.type === 'run_completed') || approvalSatisfied;
  const citationPassed = citationChecks.every(Boolean);
  const retrievalPassed = retrievalChecks.every(Boolean);
  const abstentionPassed = !evalCase.expected.mustAbstain || abstained;
  const toolBudgetPassed = (evalCase.expected.maxToolCalls === undefined || starts.length <= evalCase.expected.maxToolCalls)
    && (maxWikiSearchCalls === undefined || wikiSearchCalls <= maxWikiSearchCalls)
    && !loopDetected;
  const answerFailures = reasons.filter(reason => reason.startsWith('missing answer ') || reason.startsWith('forbidden answer ') || reason === 'answer did not abstain' || reason === 'answer abstained unexpectedly');
  const policyFailures = reasons.filter(reason => reason.startsWith('missing tool:') || reason.startsWith('forbidden tool:') || reason.startsWith('approval ') || reason === 'tool executed before approval');
  const answerPassed = completed && !vetoed && answerFailures.length === 0 && policyFailures.length === 0 && abstentionPassed;
  const queryPassed = answerPassed && citationPassed && retrievalPassed;
  const passed = queryPassed && toolBudgetPassed && !vetoed;
  if (!passed && !reasons.length) reasons.push('run did not complete');
  const retrievalCoverage = retrievalChecks.length > 0 ? retrievalChecks.filter(Boolean).length / retrievalChecks.length : retrievedCitations.length > 0 ? 1 : 0;
  return { caseId: evalCase.id, runIndex, passed, queryPassed, answerPassed, retrievalPassed, toolBudgetPassed, abstentionPassed, vetoed, reasons, content: execution.content, citations, citationCount: citations.length, retrievedCitationCount: retrievedCitations.length, citationCoverage, retrievalCoverage, abstained, rounds: new Set(events.filter(event => event.round !== undefined).map(event => event.round)).size, toolCalls: starts.length, wikiSearchCalls, unrelatedToolCalls, successfulToolCalls: ends.length, retries: errors.filter(event => event.phase === 'retrying').length, loopDetected, approvalRequired: approvals.length > 0, latencyMs };
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
  const totalRuns = results.length; const passedRuns = results.filter(result => result.passed).length; const queryPassedRuns = results.filter(result => result.queryPassed).length; const answerPassedRuns = results.filter(result => result.answerPassed).length; const firstRuns = results.filter(result => result.runIndex === 1);
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
  const retrievalCoverageRate = citationResults.length > 0 ? citationResults.reduce((sum, result) => sum + result.retrievalCoverage, 0) / citationResults.length : 0;
  const wikiSearchBudgetResults = results.filter(result => {
    const evalCase = dataset.cases.find(item => item.id === result.caseId);
    return evalCase ? getWikiSearchBudget(evalCase) !== undefined : false;
  });
  return { dataset: dataset.name, version: dataset.version, runsPerCase, generatedAt: new Date().toISOString(), summary: { totalRuns, passedRuns, queryPassedRuns, answerPassedRuns, passAt1: firstRuns.filter(result => result.passed).length / Math.max(1, firstRuns.length), queryPassAt1: firstRuns.filter(result => result.queryPassed).length / Math.max(1, firstRuns.length), answerPassAt1: firstRuns.filter(result => result.answerPassed).length / Math.max(1, firstRuns.length), passPowerK, toolSuccessRate: successfulTools / Math.max(1, totalTools), toolBudgetPassRate: results.filter(result => result.toolBudgetPassed).length / Math.max(1, totalRuns), wikiSearchBudgetPassRate: wikiSearchBudgetResults.length > 0 ? wikiSearchBudgetResults.filter(result => !result.reasons.includes('wiki search call limit exceeded')).length / wikiSearchBudgetResults.length : 0, averageRounds: average(result => result.rounds), averageToolCalls: average(result => result.toolCalls), averageWikiSearchCalls: average(result => result.wikiSearchCalls), unrelatedToolRate: results.reduce((sum, result) => sum + result.unrelatedToolCalls, 0) / Math.max(1, totalTools), retryRate: results.filter(result => result.retries > 0).length / Math.max(1, totalRuns), loopRate: results.filter(result => result.loopDetected).length / Math.max(1, totalRuns), averageLatencyMs: average(result => result.latencyMs), citationCoverageRate, citationAccuracyRate, retrievalCoverageRate, abstentionAccuracy: abstentionResults.filter(result => result.abstentionPassed).length / Math.max(1, abstentionResults.length) }, results };
}

/** 将评估报告写入 JSON 文件。 */
export async function writeReport(report: EvalReport, outputPath: string): Promise<void> { await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); }

/** 返回数据集文件路径。 */
export function datasetPath(directory: string, name: string): string { if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid dataset name: ${name}`); return path.resolve(directory, `${name}.json`); }
