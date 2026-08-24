import type { EvalJudgeInput, EvalJudgeResult, JudgeExecutor } from './index.js';
import type { PairwiseJudgeExecutor, PairwiseJudgment } from './pairwise.js';

export interface OpenAiJudgeConfig {
  apiUrl: string;
  apiKey: string;
  modelId: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function completionUrl(apiUrl: string): string {
  const normalized = apiUrl.replace(/\/$/, '');
  return normalized.endsWith('/v1') ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
}

/** 将 Judge 输入转为不含隐藏推理和原始工具载荷的评审请求。 */
export function buildJudgePrompt(input: EvalJudgeInput): string {
  const rubric = input.evalCase.expected.judgeRubric;
  if (!rubric) throw new Error(`Case ${input.evalCase.id} has no judge rubric`);
  return JSON.stringify({
    task: 'Evaluate the agent result only from the supplied observable evidence. Do not reward length, style, keyword repetition, or unsupported claims. Do not infer hidden reasoning.',
    outputContract: {
      dimensions: rubric.dimensions.map(dimension => ({ id: dimension.id, importance: dimension.importance, score: dimension.importance === 'veto' ? 'omit and set passed boolean' : 'integer 1-4', passed: dimension.importance === 'veto' ? 'boolean' : 'omit', evidenceIds: 'string[] using provided citation refId/chunkId/file when available', reason: 'short, evidence-based explanation' })),
      criticalFailure: 'optional string',
      confidence: 'number 0-1',
      shortReason: 'short string',
    },
    input: {
      question: input.evalCase.input,
      expected: input.evalCase.expected,
      judgeRubric: rubric,
      finalAnswer: input.execution.content,
      answerCitations: input.execution.citations || [],
      retrievedCitations: input.execution.retrievedCitations || [],
      observableTrace: input.execution.events,
      finalState: input.execution.state || {},
      deterministicResult: {
        passed: input.deterministic.passed,
        reasons: input.deterministic.reasons,
        citationCoverage: input.deterministic.citationCoverage,
        retrievalCoverage: input.deterministic.retrievalCoverage,
      },
    },
  });
}

/** 解析 OpenAI 兼容 Chat Completions 中的结构化 Judge 结果。 */
export function parseJudgeResponse(payload: unknown, config: OpenAiJudgeConfig): EvalJudgeResult {
  const content = (payload as ChatCompletionResponse).choices?.[0]?.message?.content;
  if (!content) throw new Error('Judge response does not contain message content');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('Judge response is not valid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Judge response must be an object');
  const candidate = parsed as Partial<EvalJudgeResult> & { scores?: unknown; summary?: unknown; reason?: unknown };
  const dimensions = Array.isArray(candidate.dimensions) ? candidate.dimensions : candidate.scores;
  const confidence = typeof candidate.confidence === 'number' ? candidate.confidence : Number(candidate.confidence);
  const shortReason = typeof candidate.shortReason === 'string'
    ? candidate.shortReason
    : typeof candidate.summary === 'string' ? candidate.summary : candidate.reason;
  if (!Array.isArray(dimensions) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || typeof shortReason !== 'string' || !shortReason) {
    throw new Error('Judge response does not match the required schema');
  }
  return { ...candidate, dimensions, confidence, shortReason, judgeModel: config.modelId };
}

async function requestJudge(config: OpenAiJudgeConfig, messages: Array<{ role: string; content: string }>): Promise<unknown> {
  const response = await fetch(completionUrl(config.apiUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.modelId, temperature: 0, response_format: { type: 'json_object' }, messages }),
  });
  if (!response.ok) throw new Error(`Judge request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function judgeContent(payload: unknown): string {
  const content = (payload as ChatCompletionResponse).choices?.[0]?.message?.content;
  if (!content) throw new Error('Judge response does not contain message content');
  return content;
}

/** 创建显式调用 OpenAI 兼容 JSON Judge 的执行器。 */
export function createOpenAiJudge(config: OpenAiJudgeConfig): JudgeExecutor {
  if (!config.apiUrl || !config.apiKey || !config.modelId) throw new Error('Judge requires apiUrl, apiKey and modelId');
  return async input => {
    const prompt = buildJudgePrompt(input);
    const messages = [
      { role: 'system', content: 'You are a strict evaluation judge. Return only valid JSON that follows the requested contract.' },
      { role: 'user', content: prompt },
    ];
    const payload = await requestJudge(config, messages);
    try { return parseJudgeResponse(payload, config); } catch (error) {
      const correction = `Your previous JSON did not match the contract. Return a corrected JSON object only; preserve the evaluation, do not add fields. Contract and previous output:\n${JSON.stringify({ contract: JSON.parse(prompt).outputContract, previous: judgeContent(payload).slice(0, 12000) })}`;
      const retry = await requestJudge(config, [...messages, { role: 'user', content: correction }]);
      try { return parseJudgeResponse(retry, config); } catch { throw error; }
    }
  };
}

/** 创建只比较可观察答案和证据的 OpenAI 兼容配对 Judge。 */
export function createOpenAiPairwiseJudge(config: OpenAiJudgeConfig): PairwiseJudgeExecutor {
  if (!config.apiUrl || !config.apiKey || !config.modelId) throw new Error('Judge requires apiUrl, apiKey and modelId');
  return async input => {
    const response = await fetch(completionUrl(config.apiUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.modelId,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a strict pairwise evaluation judge. Return only JSON with winner (a, b, or tie), confidence (0-1), and short evidence-based reason. Do not reward length or style.' },
          { role: 'user', content: JSON.stringify({ question: input.evalCase.input, rubric: input.evalCase.expected.judgeRubric, candidateA: { answer: input.first.content, citations: input.first.citations, trace: input.first.reasons }, candidateB: { answer: input.second.content, citations: input.second.citations, trace: input.second.reasons } }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Pairwise judge request failed: ${response.status} ${await response.text()}`);
    const content = (await response.json() as ChatCompletionResponse).choices?.[0]?.message?.content;
    if (!content) throw new Error('Pairwise judge response does not contain message content');
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error('Pairwise judge response is not valid JSON'); }
    const candidate = parsed as Partial<PairwiseJudgment>;
    if (!candidate || !['a', 'b', 'tie'].includes(String(candidate.winner)) || !Number.isFinite(candidate.confidence) || candidate.confidence! < 0 || candidate.confidence! > 1 || typeof candidate.reason !== 'string' || !candidate.reason) {
      throw new Error('Pairwise judge response does not match the required schema');
    }
    return { winner: candidate.winner!, confidence: candidate.confidence!, reason: candidate.reason };
  };
}
