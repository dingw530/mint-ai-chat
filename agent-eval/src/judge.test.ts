import { describe, expect, it } from 'vitest';
import { buildCalibrationTemplate, compareCalibration } from './calibration.js';
import { assessJudgeResult, runEvaluation, validateCase, type EvalCase, type EvalJudgeResult } from './index.js';
import { buildJudgePrompt, parseJudgeResponse } from './judge.js';

const judgeCase: EvalCase = {
  id: 'judge-001',
  input: '根据资料说明 RAG 的价值。',
  tags: ['wiki', 'citation'],
  expected: {
    mustContain: ['检索'],
    requiredSourceFiles: ['rag.md'],
    minCitations: 1,
    judgeRubric: {
      version: 'test-v1',
      pitfalls: ['只堆砌关键词'],
      edgeCases: ['资料不足时应拒答'],
      dimensions: [
        { id: 'correctness', name: '正确性', importance: 'essential', scoring: { '1': '错误', '2': '部分正确', '3': '正确', '4': '准确完整' } },
        { id: 'completeness', name: '完整性', importance: 'important', scoring: { '1': '遗漏核心', '2': '遗漏部分', '3': '覆盖核心', '4': '覆盖全部' } },
        { id: 'style', name: '简洁性', importance: 'optional', scoring: { '1': '冗长', '2': '偏长', '3': '简洁', '4': '精炼' } },
        { id: 'hallucination', name: '幻觉', importance: 'veto', veto: { pass: '均有证据', fail: '编造事实' } },
      ],
    },
  },
};

const approvedJudge: EvalJudgeResult = {
  dimensions: [
    { id: 'correctness', score: 4, evidenceIds: ['C1'], reason: '结论与来源一致。' },
    { id: 'completeness', score: 3, evidenceIds: ['C1'], reason: '覆盖核心结论。' },
    { id: 'style', score: 3, evidenceIds: [], reason: '表达简洁。' },
    { id: 'hallucination', passed: true, evidenceIds: ['C1'], reason: '没有编造事实。' },
  ],
  confidence: 0.9,
  shortReason: '回答正确且有证据。',
};

describe('LLM Judge evaluation', () => {
  it('validates a self-contained judge rubric and rejects incomplete scoring levels', () => {
    expect(() => validateCase(judgeCase)).not.toThrow();
    const invalid = { ...judgeCase, id: 'judge-invalid', expected: { ...judgeCase.expected, judgeRubric: { ...judgeCase.expected.judgeRubric!, dimensions: [{ id: 'broken', name: '损坏', importance: 'essential', scoring: { '1': '一分', '2': '二分', '3': '三分' } }] } } };
    expect(() => validateCase(invalid)).toThrow('Invalid judge scoring');
  });

  it('scores judge dimensions after deterministic validation and exposes judge metrics', async () => {
    const report = await runEvaluation({ name: 'judge', version: '1', cases: [judgeCase] }, async () => ({
      content: 'RAG 先检索资料，再用检索结果生成回答。',
      events: [{ type: 'run_completed' }],
      citations: [{ file: 'rag.md', refId: 'C1' }],
    }), 1, async input => {
      expect(input.execution.events[0]?.result).toBeUndefined();
      expect(input.deterministic.passed).toBe(true);
      return approvedJudge;
    });
    expect(report.results[0]?.judgePassed).toBe(true);
    expect(report.results[0]?.judge?.weightedScore).toBeCloseTo(0.875);
    expect(report.summary.judgePassAt1).toBe(1);
    expect(report.summary.averageAnswerChars).toBeGreaterThan(0);
  });

  it('skips judge calls when deterministic hard gates fail', async () => {
    let called = false;
    const report = await runEvaluation({ name: 'judge', version: '1', cases: [judgeCase] }, async () => ({ content: '没有引用的检索回答。', events: [{ type: 'run_completed' }] }), 1, async () => { called = true; return approvedJudge; });
    expect(called).toBe(false);
    expect(report.results[0]?.judge?.skipped).toBe(true);
    expect(report.results[0]?.judgePassed).toBe(false);
  });

  it('rejects missing judge dimensions and veto failures', () => {
    const rubric = judgeCase.expected.judgeRubric!;
    expect(() => assessJudgeResult(rubric, { ...approvedJudge, dimensions: approvedJudge.dimensions.slice(0, 3) })).toThrow('dimensions do not match');
    const vetoed = assessJudgeResult(rubric, { ...approvedJudge, dimensions: approvedJudge.dimensions.map(dimension => dimension.id === 'hallucination' ? { ...dimension, passed: false } : dimension) });
    expect(vetoed.passed).toBe(false);
  });

  it('exports and compares human calibration labels', async () => {
    const report = await runEvaluation({ name: 'judge', version: '1', cases: [judgeCase] }, async () => ({ content: 'RAG 通过检索资料降低回答风险。', events: [{ type: 'run_completed' }], citations: [{ file: 'rag.md', refId: 'C1' }] }), 1, async () => approvedJudge);
    const template = buildCalibrationTemplate(report);
    template.labels[0]!.passed = true;
    template.labels[0]!.dimensions = approvedJudge.dimensions;
    const comparison = compareCalibration(report, template.labels);
    expect(comparison.matched).toBe(1);
    expect(comparison.passAgreementRate).toBe(1);
    expect(comparison.dimensionExactAgreementRate).toBe(1);
  });

  it('builds and validates an OpenAI-compatible structured judge response', () => {
    const prompt = buildJudgePrompt({ evalCase: judgeCase, execution: { content: '回答', events: [], citations: [], retrievedCitations: [] }, deterministic: { caseId: 'judge-001', runIndex: 1, passed: true, queryPassed: true, answerPassed: true, retrievalPassed: true, toolBudgetPassed: true, abstentionPassed: true, vetoed: false, reasons: [], content: '回答', citations: [], citationCount: 0, retrievedCitationCount: 0, citationCoverage: 0, retrievalCoverage: 0, abstained: false, rounds: 0, toolCalls: 0, attemptedToolCalls: 0, blockedToolCalls: 0, wikiSearchCalls: 0, attemptedWikiSearchCalls: 0, blockedWikiSearchCalls: 0, unrelatedToolCalls: 0, successfulToolCalls: 0, retries: 0, loopDetected: false, approvalRequired: false, latencyMs: 1 } });
    expect(prompt).toContain('Do not reward length');
    const parsed = parseJudgeResponse({ choices: [{ message: { content: JSON.stringify(approvedJudge) } }] }, { apiUrl: 'https://example.test', apiKey: 'key', modelId: 'judge-model' });
    expect(parsed.judgeModel).toBe('judge-model');
  });

  it('normalizes common compatible schema aliases without relaxing validation', () => {
    const parsed = parseJudgeResponse({ choices: [{ message: { content: JSON.stringify({ ...approvedJudge, dimensions: undefined, scores: approvedJudge.dimensions, confidence: '0.8', summary: '兼容响应', shortReason: undefined }) } }] }, { apiUrl: 'https://example.test', apiKey: 'key', modelId: 'judge-model' });
    expect(parsed).toMatchObject({ confidence: 0.8, shortReason: '兼容响应', judgeModel: 'judge-model' });
    expect(parsed.dimensions).toHaveLength(4);
  });
});
