import fs from 'node:fs/promises';
import path from 'node:path';

export interface EvalTraceEvent { type: string; round?: number; callId?: string; toolName?: string; phase?: string; status?: string; summary?: string; error?: string; result?: string; }
export type EvalTag = 'qa' | 'wiki' | 'tools' | 'security' | 'retrieval' | 'citation' | 'abstention';
export type EvalComplexity = 'basic' | 'multi-hop' | 'boundary' | 'adversarial' | 'long-horizon';
export interface EvalCitation { file: string; title?: string; heading?: string; sourceFile?: string; chunkId?: string; refId?: string; }
export interface EvalStateAssertion { path: string; equals?: unknown; contains?: string; exists?: boolean; }
export type EvalRubricCheck =
  | { type: 'answer_contains'; value: string }
  | { type: 'answer_contains_any'; values: string[] }
  | { type: 'answer_not_contains'; value: string }
  | { type: 'tool_used'; value: string }
  | { type: 'tool_not_used'; value: string }
  | { type: 'source_file'; value: string; scope?: 'answer' | 'retrieval' | 'both' }
  | { type: 'source_chunk'; value: string; scope?: 'answer' | 'retrieval' | 'both' }
  | { type: 'min_citations'; value: number }
  | { type: 'state_equals'; path: string; value: unknown }
  | { type: 'state_exists'; path: string; value: boolean };
export interface EvalRubric { essential?: EvalRubricCheck[]; important?: EvalRubricCheck[]; optional?: EvalRubricCheck[]; veto?: EvalRubricCheck[]; }
export interface EvalCase {
  id: string; agent?: string; input: string; tags: EvalTag[]; complexity?: EvalComplexity; capabilities?: string[];
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
    finalState?: EvalStateAssertion[];
    rubric?: EvalRubric;
  };
}
export interface EvalDataset { name: string; version: string; cases: EvalCase[]; metadata?: Record<string, unknown>; }
export interface EvalExecution { content: string; events: EvalTraceEvent[]; citations?: EvalCitation[]; retrievedCitations?: EvalCitation[]; state?: Record<string, unknown>; inputTokens?: number; outputTokens?: number; reasoningTokens?: number; ttftMs?: number; traceId?: string; }
export interface EvalCaseResult { caseId: string; runIndex: number; passed: boolean; queryPassed: boolean; answerPassed: boolean; retrievalPassed: boolean; toolBudgetPassed: boolean; abstentionPassed: boolean; vetoed: boolean; essentialPassed?: boolean; importantPassed?: boolean; optionalPassed?: boolean; rubricScore?: number; reasons: string[]; content: string; citations: EvalCitation[]; citationCount: number; retrievedCitationCount: number; citationCoverage: number; retrievalCoverage: number; abstained: boolean; rounds: number; toolCalls: number; attemptedToolCalls: number; blockedToolCalls: number; wikiSearchCalls: number; attemptedWikiSearchCalls: number; blockedWikiSearchCalls: number; unrelatedToolCalls: number; successfulToolCalls: number; retries: number; loopDetected: boolean; approvalRequired: boolean; latencyMs: number; inputTokens?: number; outputTokens?: number; reasoningTokens?: number; ttftMs?: number; traceId?: string; }
export interface EvalCaseStats { caseId: string; runs: number; passedRuns: number; passRate: number; passAtK: number; passPowerK: number; meanLatencyMs: number; latencyStdDevMs: number; p95LatencyMs: number; }
export interface EvalComparison { baselineGeneratedAt: string; baselineVersion: string; warnings: string[]; deltas: Record<string, number>; }
export interface EvalReport { dataset: string; version: string; runsPerCase: number; generatedAt: string; summary: { totalRuns: number; passedRuns: number; queryPassedRuns: number; answerPassedRuns: number; passAt1: number; queryPassAt1: number; answerPassAt1: number; passAtK: number; passAtKValue: number; passPowerK: number; passPowerKValue: number; toolSuccessRate: number; toolBudgetPassRate: number; wikiSearchBudgetPassRate: number; averageRounds: number; averageToolCalls: number; averageAttemptedToolCalls: number; averageBlockedToolCalls: number; averageWikiSearchCalls: number; averageAttemptedWikiSearchCalls: number; averageBlockedWikiSearchCalls: number; unrelatedToolRate: number; retryRate: number; loopRate: number; averageLatencyMs: number; p50LatencyMs: number; p95LatencyMs: number; averageInputTokens: number; averageOutputTokens: number; averageReasoningTokens: number; averageTtftMs: number; citationCoverageRate: number; citationAccuracyRate: number; retrievalCoverageRate: number; abstentionAccuracy: number; essentialPassRate: number; importantPassRate: number; optionalPassRate: number; }; caseStats: EvalCaseStats[]; comparison?: EvalComparison; results: EvalCaseResult[]; }
export type AgentEvalExecutor = (evalCase: EvalCase) => Promise<EvalExecution>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readStatePath(state: Record<string, unknown> | undefined, statePath: string): { exists: boolean; value: unknown } {
  if (!statePath) return { exists: false, value: undefined };
  let current: unknown = state;
  for (const part of statePath.split('.')) {
    if (!isRecord(current) || !(part in current)) return { exists: false, value: undefined };
    current = current[part];
  }
  return { exists: true, value: current };
}

function validateRubricCheck(check: unknown, caseId: string): asserts check is EvalRubricCheck {
  if (!isRecord(check) || typeof check.type !== 'string') throw new Error(`Invalid rubric check: ${caseId}`);
  const stringValueTypes = new Set(['answer_contains', 'answer_not_contains', 'tool_used', 'tool_not_used', 'source_file', 'source_chunk']);
  if (stringValueTypes.has(check.type) && (typeof check.value !== 'string' || !check.value)) throw new Error(`Invalid rubric check value: ${caseId}`);
  if (check.type === 'answer_contains_any' && !isStringArray(check.values)) throw new Error(`Invalid rubric alternatives: ${caseId}`);
  if (check.type === 'min_citations' && (!Number.isInteger(check.value) || Number(check.value) < 0)) throw new Error(`Invalid rubric citation count: ${caseId}`);
  if ((check.type === 'state_equals' || check.type === 'state_exists') && (typeof check.path !== 'string' || !check.path)) throw new Error(`Invalid rubric state path: ${caseId}`);
  if (check.type === 'state_exists' && typeof check.value !== 'boolean') throw new Error(`Invalid rubric state existence: ${caseId}`);
  if (check.type === 'source_file' || check.type === 'source_chunk') {
    if (check.scope !== undefined && !['answer', 'retrieval', 'both'].includes(String(check.scope))) throw new Error(`Invalid rubric source scope: ${caseId}`);
  }
}

function validateRubric(rubric: unknown, caseId: string): asserts rubric is EvalRubric {
  if (!isRecord(rubric)) throw new Error(`Invalid rubric: ${caseId}`);
  for (const level of ['essential', 'important', 'optional', 'veto'] as const) {
    const checks = rubric[level];
    if (checks !== undefined && (!Array.isArray(checks) || checks.some(check => { validateRubricCheck(check, caseId); return false; }))) throw new Error(`Invalid ${level} rubric: ${caseId}`);
  }
}

function validateStateAssertions(assertions: unknown, caseId: string): asserts assertions is EvalStateAssertion[] {
  if (!Array.isArray(assertions) || assertions.some(assertion => {
    if (!isRecord(assertion) || typeof assertion.path !== 'string' || !assertion.path) return true;
    const modes = Number('equals' in assertion) + Number('contains' in assertion) + Number('exists' in assertion);
    return modes !== 1 || ('contains' in assertion && typeof assertion.contains !== 'string') || ('exists' in assertion && typeof assertion.exists !== 'boolean');
  })) throw new Error(`Invalid finalState assertions: ${caseId}`);
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

interface RubricContext {
  content: string;
  toolNames: string[];
  citations: EvalCitation[];
  retrievedCitations: EvalCitation[];
  state?: Record<string, unknown>;
}

function sourceMatches(citations: EvalCitation[], value: string, field: 'file' | 'chunkId'): boolean {
  const normalized = value.toLocaleLowerCase();
  return citations.some(citation => {
    const candidate = field === 'file' ? `${citation.file} ${citation.sourceFile || ''}` : String(citation.chunkId || '');
    return candidate.toLocaleLowerCase().includes(normalized);
  });
}

function evaluateRubricCheck(check: EvalRubricCheck, context: RubricContext): boolean {
  switch (check.type) {
    case 'answer_contains': return context.content.includes(check.value.toLocaleLowerCase());
    case 'answer_contains_any': return check.values.some(value => context.content.includes(value.toLocaleLowerCase()));
    case 'answer_not_contains': return !context.content.includes(check.value.toLocaleLowerCase());
    case 'tool_used': return context.toolNames.includes(check.value);
    case 'tool_not_used': return !context.toolNames.includes(check.value);
    case 'source_file': return check.scope === 'retrieval' ? sourceMatches(context.retrievedCitations, check.value, 'file') : check.scope === 'answer' ? sourceMatches(context.citations, check.value, 'file') : sourceMatches(context.citations, check.value, 'file') || sourceMatches(context.retrievedCitations, check.value, 'file');
    case 'source_chunk': return check.scope === 'retrieval' ? sourceMatches(context.retrievedCitations, check.value, 'chunkId') : check.scope === 'answer' ? sourceMatches(context.citations, check.value, 'chunkId') : sourceMatches(context.citations, check.value, 'chunkId') || sourceMatches(context.retrievedCitations, check.value, 'chunkId');
    case 'min_citations': return context.citations.length >= check.value;
    case 'state_equals': { const actual = readStatePath(context.state, check.path); return actual.exists && valuesEqual(actual.value, check.value); }
    case 'state_exists': return readStatePath(context.state, check.path).exists === check.value;
  }
}

function evaluateRubricLevel(level: string, checks: EvalRubricCheck[], context: RubricContext, reasons: string[]): boolean {
  const failed = checks.filter(check => !evaluateRubricCheck(check, context));
  for (const check of failed) reasons.push(`${level} rubric failed: ${check.type}`);
  return failed.length === 0;
}

function evaluateFinalState(assertions: EvalStateAssertion[], state: Record<string, unknown> | undefined, reasons: string[]): boolean {
  let passed = true;
  for (const assertion of assertions) {
    const actual = readStatePath(state, assertion.path);
    const matches = 'equals' in assertion
      ? actual.exists && valuesEqual(actual.value, assertion.equals)
      : typeof assertion.contains === 'string' ? actual.exists && String(actual.value).toLocaleLowerCase().includes(assertion.contains.toLocaleLowerCase())
        : actual.exists === assertion.exists;
    if (!matches) { reasons.push(`final state assertion failed: ${assertion.path}`); passed = false; }
  }
  return passed;
}

function isBudgetBlockedToolEnd(event: EvalTraceEvent): boolean {
  return event.type === 'tool_call_end'
    && event.summary?.includes('未执行该调用') === true;
}

interface ToolAccounting {
  starts: EvalTraceEvent[];
  executedStarts: EvalTraceEvent[];
  ends: EvalTraceEvent[];
  executedEnds: EvalTraceEvent[];
  blockedEnds: EvalTraceEvent[];
}

function accountToolEvents(events: EvalTraceEvent[]): ToolAccounting {
  const starts = events.filter(event => event.type === 'tool_call_start');
  const ends = events.filter(event => event.type === 'tool_call_end');
  const blockedEnds = ends.filter(isBudgetBlockedToolEnd);
  const blockedCallIds = new Set(blockedEnds.map(event => event.callId).filter((callId): callId is string => Boolean(callId)));
  const executedStarts = starts.filter(event => !event.callId || !blockedCallIds.has(event.callId));
  const executedEnds = ends.filter(event => !isBudgetBlockedToolEnd(event));
  return { starts, executedStarts, ends, executedEnds, blockedEnds };
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
  if (candidate.complexity !== undefined && !['basic', 'multi-hop', 'boundary', 'adversarial', 'long-horizon'].includes(candidate.complexity)) throw new Error(`Invalid complexity: ${candidate.id}`);
  if (candidate.capabilities !== undefined && !isStringArray(candidate.capabilities)) throw new Error(`Invalid capabilities: ${candidate.id}`);
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
  if (expected.finalState !== undefined) validateStateAssertions(expected.finalState, candidate.id);
  if (expected.rubric !== undefined) validateRubric(expected.rubric, candidate.id);
}

/** 使用答案和轨迹执行确定性验收。 */
export function verifyExecution(evalCase: EvalCase, execution: EvalExecution, runIndex: number, latencyMs: number): EvalCaseResult {
  const content = execution.content.toLowerCase(); const events = execution.events;
  const { starts, executedStarts, executedEnds, blockedEnds } = accountToolEvents(events);
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
  const toolNames = starts.map(event => event.toolName).filter((toolName): toolName is string => Boolean(toolName));
  const executedToolNames = executedStarts.map(event => event.toolName).filter((toolName): toolName is string => Boolean(toolName));
  const wikiSearchCalls = executedToolNames.filter(toolName => toolName === 'wiki_search').length;
  const attemptedWikiSearchCalls = toolNames.filter(toolName => toolName === 'wiki_search').length;
  const blockedWikiSearchCalls = blockedEnds.filter(event => event.toolName === 'wiki_search').length;
  const unrelatedToolCalls = executedToolNames.filter(toolName => toolName !== 'wiki_search').length;
  const maxWikiSearchCalls = getWikiSearchBudget(evalCase);
  for (const tool of evalCase.expected.mustUseTools || []) if (!toolNames.includes(tool)) reasons.push(`missing tool: ${tool}`);
  for (const tool of evalCase.expected.mustNotUseTools || []) if (toolNames.includes(tool)) reasons.push(`forbidden tool: ${tool}`);
  if (evalCase.expected.maxToolCalls !== undefined && executedStarts.length > evalCase.expected.maxToolCalls) reasons.push('tool call limit exceeded');
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
  const rubric = evalCase.expected.rubric;
  const rubricContext: RubricContext = { content, toolNames, citations, retrievedCitations, state: execution.state };
  const essentialChecks = rubric?.essential || [];
  const importantChecks = rubric?.important || [];
  const optionalChecks = rubric?.optional || [];
  const vetoChecks = rubric?.veto || [];
  const essentialPassed = evaluateRubricLevel('essential', essentialChecks, rubricContext, reasons);
  const importantPassed = evaluateRubricLevel('important', importantChecks, rubricContext, reasons);
  const optionalPassed = evaluateRubricLevel('optional', optionalChecks, rubricContext, reasons);
  const vetoTriggered = vetoChecks.some(check => evaluateRubricCheck(check, rubricContext));
  if (vetoTriggered) { reasons.push('veto rubric failed'); vetoed = true; }
  const rubricChecks = [...essentialChecks, ...importantChecks, ...optionalChecks, ...vetoChecks];
  const rubricScore = rubricChecks.length > 0 ? (essentialChecks.filter(check => evaluateRubricCheck(check, rubricContext)).length + importantChecks.filter(check => evaluateRubricCheck(check, rubricContext)).length + optionalChecks.filter(check => evaluateRubricCheck(check, rubricContext)).length + vetoChecks.filter(check => !evaluateRubricCheck(check, rubricContext)).length) / rubricChecks.length : 1;
  const finalStatePassed = evaluateFinalState(evalCase.expected.finalState || [], execution.state, reasons);
  const approvalSatisfied = Boolean(evalCase.expected.mustRequireApproval && approvals.length > 0 && evalCase.expected.approvalTool && !events.some(event => event.type === 'tool_call_end' && event.toolName === evalCase.expected.approvalTool));
  const completed = events.some(event => event.type === 'run_completed') || approvalSatisfied;
  const citationPassed = citationChecks.every(Boolean);
  const retrievalPassed = retrievalChecks.every(Boolean);
  const abstentionPassed = !evalCase.expected.mustAbstain || abstained;
  const toolBudgetPassed = (evalCase.expected.maxToolCalls === undefined || executedStarts.length <= evalCase.expected.maxToolCalls)
    && (maxWikiSearchCalls === undefined || wikiSearchCalls <= maxWikiSearchCalls)
    && !loopDetected;
  const answerFailures = reasons.filter(reason => reason.startsWith('missing answer ') || reason.startsWith('forbidden answer ') || reason === 'answer did not abstain' || reason === 'answer abstained unexpectedly');
  const policyFailures = reasons.filter(reason => reason.startsWith('missing tool:') || reason.startsWith('forbidden tool:') || reason.startsWith('approval ') || reason === 'tool executed before approval');
  const answerPassed = completed && !vetoed && answerFailures.length === 0 && policyFailures.length === 0 && abstentionPassed && essentialPassed && importantPassed && finalStatePassed;
  const queryPassed = answerPassed && citationPassed && retrievalPassed;
  const passed = queryPassed && toolBudgetPassed && !vetoed;
  if (!passed && !reasons.length) reasons.push('run did not complete');
  const retrievalCoverage = retrievalChecks.length > 0 ? retrievalChecks.filter(Boolean).length / retrievalChecks.length : retrievedCitations.length > 0 ? 1 : 0;
  return { caseId: evalCase.id, runIndex, passed, queryPassed, answerPassed, retrievalPassed, toolBudgetPassed, abstentionPassed, vetoed, essentialPassed, importantPassed, optionalPassed, rubricScore, reasons, content: execution.content, citations, citationCount: citations.length, retrievedCitationCount: retrievedCitations.length, citationCoverage, retrievalCoverage, abstained, rounds: new Set(events.filter(event => event.round !== undefined).map(event => event.round)).size, toolCalls: executedStarts.length, attemptedToolCalls: starts.length, blockedToolCalls: blockedEnds.length, wikiSearchCalls, attemptedWikiSearchCalls, blockedWikiSearchCalls, unrelatedToolCalls, successfulToolCalls: executedEnds.length, retries: errors.filter(event => event.phase === 'retrying').length, loopDetected, approvalRequired: approvals.length > 0, latencyMs, inputTokens: execution.inputTokens, outputTokens: execution.outputTokens, reasoningTokens: execution.reasoningTokens, ttftMs: execution.ttftMs, traceId: execution.traceId };
}

/** 执行一个数据集，并返回逐用例结果和聚合指标。 */
export async function runEvaluation(dataset: EvalDataset, executor: AgentEvalExecutor, runsPerCase = 1): Promise<EvalReport> {
  if (!Number.isInteger(runsPerCase) || runsPerCase < 1) throw new Error('runsPerCase must be a positive integer');
  const results: EvalCaseResult[] = [];
  for (const evalCase of dataset.cases) for (let runIndex = 1; runIndex <= runsPerCase; runIndex++) { const startedAt = Date.now(); const execution = await executor(evalCase); results.push(verifyExecution(evalCase, execution, runIndex, Date.now() - startedAt)); }
  return buildReport(dataset, results, runsPerCase);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[Math.max(0, index)];
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map(value => (value - mean) ** 2)));
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= k; index += 1) result = (result * (n - index + 1)) / index;
  return result;
}

function passAtK(runs: EvalCaseResult[], k: number): number {
  if (!runs.length) return 0;
  const sampleSize = Math.min(k, runs.length);
  const failures = runs.filter(result => !result.passed).length;
  const total = combinations(runs.length, sampleSize);
  return total ? 1 - combinations(failures, sampleSize) / total : 0;
}

function passPowerK(runs: EvalCaseResult[], k: number): number {
  if (!runs.length) return 0;
  const sampleSize = Math.min(k, runs.length);
  const total = combinations(runs.length, sampleSize);
  return total ? combinations(runs.filter(result => result.passed).length, sampleSize) / total : 0;
}

function averageDefined(results: EvalCaseResult[], selector: (result: EvalCaseResult) => number | undefined): number {
  return average(results.map(selector).filter((value): value is number => value !== undefined));
}

/** 从逐次结果构造可比较的聚合报告。 */
export function buildReport(dataset: EvalDataset, results: EvalCaseResult[], runsPerCase: number): EvalReport {
  const totalRuns = results.length; const passedRuns = results.filter(result => result.passed).length; const queryPassedRuns = results.filter(result => result.queryPassed).length; const answerPassedRuns = results.filter(result => result.answerPassed).length; const firstRuns = results.filter(result => result.runIndex === 1);
  const successfulTools = results.reduce((sum, result) => sum + result.successfulToolCalls, 0); const totalTools = results.reduce((sum, result) => sum + result.toolCalls, 0); const averageResult = (selector: (result: EvalCaseResult) => number) => average(results.map(selector));
  const grouped = dataset.cases.map(item => ({ caseId: item.id, runs: results.filter(result => result.caseId === item.id) }));
  const k = Math.min(3, Math.max(1, runsPerCase));
  const caseStats = grouped.map(group => {
    const latencies = group.runs.map(result => result.latencyMs);
    return { caseId: group.caseId, runs: group.runs.length, passedRuns: group.runs.filter(result => result.passed).length, passRate: group.runs.filter(result => result.passed).length / Math.max(1, group.runs.length), passAtK: passAtK(group.runs, k), passPowerK: passPowerK(group.runs, k), meanLatencyMs: average(latencies), latencyStdDevMs: standardDeviation(latencies), p95LatencyMs: percentile(latencies, 0.95) };
  });
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
  return { dataset: dataset.name, version: dataset.version, runsPerCase, generatedAt: new Date().toISOString(), summary: { totalRuns, passedRuns, queryPassedRuns, answerPassedRuns, passAt1: firstRuns.filter(result => result.passed).length / Math.max(1, firstRuns.length), queryPassAt1: firstRuns.filter(result => result.queryPassed).length / Math.max(1, firstRuns.length), answerPassAt1: firstRuns.filter(result => result.answerPassed).length / Math.max(1, firstRuns.length), passAtK: average(caseStats.map(stat => stat.passAtK)), passAtKValue: k, passPowerK: average(caseStats.map(stat => stat.passPowerK)), passPowerKValue: k, toolSuccessRate: successfulTools / Math.max(1, totalTools), toolBudgetPassRate: results.filter(result => result.toolBudgetPassed).length / Math.max(1, totalRuns), wikiSearchBudgetPassRate: wikiSearchBudgetResults.length > 0 ? wikiSearchBudgetResults.filter(result => !result.reasons.includes('wiki search call limit exceeded')).length / wikiSearchBudgetResults.length : 0, averageRounds: averageResult(result => result.rounds), averageToolCalls: averageResult(result => result.toolCalls), averageAttemptedToolCalls: averageResult(result => result.attemptedToolCalls), averageBlockedToolCalls: averageResult(result => result.blockedToolCalls), averageWikiSearchCalls: averageResult(result => result.wikiSearchCalls), averageAttemptedWikiSearchCalls: averageResult(result => result.attemptedWikiSearchCalls), averageBlockedWikiSearchCalls: averageResult(result => result.blockedWikiSearchCalls), unrelatedToolRate: results.reduce((sum, result) => sum + result.unrelatedToolCalls, 0) / Math.max(1, totalTools), retryRate: results.filter(result => result.retries > 0).length / Math.max(1, totalRuns), loopRate: results.filter(result => result.loopDetected).length / Math.max(1, totalRuns), averageLatencyMs: averageResult(result => result.latencyMs), p50LatencyMs: percentile(results.map(result => result.latencyMs), 0.5), p95LatencyMs: percentile(results.map(result => result.latencyMs), 0.95), averageInputTokens: averageDefined(results, result => result.inputTokens), averageOutputTokens: averageDefined(results, result => result.outputTokens), averageReasoningTokens: averageDefined(results, result => result.reasoningTokens), averageTtftMs: averageDefined(results, result => result.ttftMs), citationCoverageRate, citationAccuracyRate, retrievalCoverageRate, abstentionAccuracy: abstentionResults.filter(result => result.abstentionPassed).length / Math.max(1, abstentionResults.length), essentialPassRate: averageResult(result => Number(result.essentialPassed)), importantPassRate: averageResult(result => Number(result.importantPassed)), optionalPassRate: averageResult(result => Number(result.optionalPassed)) }, caseStats, results };
}

/** 将当前报告与历史基线按同名聚合指标做差，便于识别回归。 */
export function compareReports(report: EvalReport, baseline: EvalReport): EvalReport {
  const metricNames = ['passAt1', 'queryPassAt1', 'answerPassAt1', 'passAtK', 'passPowerK', 'toolBudgetPassRate', 'retrievalCoverageRate', 'citationAccuracyRate', 'averageLatencyMs', 'p95LatencyMs'] as const;
  const deltas = Object.fromEntries(metricNames.map(name => [name, report.summary[name] - (baseline.summary[name] ?? 0)]));
  const warnings: string[] = [];
  if (report.dataset !== baseline.dataset) warnings.push(`数据集不同：${baseline.dataset} → ${report.dataset}`);
  if (report.version !== baseline.version) warnings.push(`数据集版本不同：${baseline.version} → ${report.version}`);
  return { ...report, comparison: { baselineGeneratedAt: baseline.generatedAt, baselineVersion: baseline.version, warnings, deltas } };
}

/** 将评估报告写入 JSON 文件。 */
export async function writeReport(report: EvalReport, outputPath: string): Promise<void> { await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); }

/** 返回数据集文件路径。 */
export function datasetPath(directory: string, name: string): string { if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid dataset name: ${name}`); return path.resolve(directory, `${name}.json`); }
