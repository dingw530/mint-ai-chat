import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import './loadEnv.js';
import { compareReports, datasetPath, loadDataset, runEvaluation, writeReport } from './index.js';
import type { AgentEvalExecutor, EvalProgressUpdate, EvalReport } from './index.js';
import { ingestWikiRagCorpus, prepareWikiRagCorpus } from './wikiRagCorpus.js';
import { resolveRuns } from './runOptions.js';
import { buildCalibrationTemplate, compareCalibration, type CalibrationLabel } from './calibration.js';
import { createOpenAiJudge, createOpenAiPairwiseJudge } from './judge.js';
import { calculateElo, runPairwiseComparison, type PairwiseReport } from './pairwise.js';

const [, , command = 'list', ...args] = process.argv;
const evalDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetsDirectory = path.join(evalDirectory, 'datasets');
const smokeExecutor: AgentEvalExecutor = async evalCase => ({ content: evalCase.id === 'qa-001' ? '思考、行动、观察' : '', events: [{ type: 'run_completed' }] });
const DATASET_NAMES = ['smoke', 'wiki-rag'];

const dryRunExecutor: AgentEvalExecutor = async evalCase => {
  const expected = evalCase.expected;
  const claims = [
    ...(expected.mustContain || []),
    ...(expected.mustContainAny || []).map(group => group[0]),
    ...(expected.mustAbstain ? [expected.abstainMarkers?.[0] || '没有足够信息'] : []),
  ].filter((value): value is string => Boolean(value));
  const toolEvents = (expected.mustUseTools || []).map(toolName => ({ type: 'tool_call_start', toolName, round: 1 }));
  const citations = (expected.requiredSourceFiles || []).map(file => ({ file, refId: `dry-${file}` }));
  const completionEvent = expected.mustRequireApproval
    ? { type: 'approval_required', toolName: expected.approvalTool || expected.mustUseTools?.[0], round: 1 }
    : { type: 'run_completed' };
  return {
    content: claims.join('；'),
    events: [...toolEvents, completionEvent],
    citations,
  };
};

function optionValue(args: string[], name: string): string | undefined {
  const index = args.lastIndexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function envPath(name: string, fallback: string): string {
  const value = process.env[name];
  return value ? path.resolve(evalDirectory, value) : fallback;
}

function requiredOption(args: string[], name: string): string {
  const value = optionValue(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function judgeConfig(args: string[]): { apiUrl: string; apiKey: string; modelId: string } {
  const apiUrl = optionValue(args, '--judge-api-url') || process.env.MINT_EVAL_JUDGE_API_URL;
  const apiKey = optionValue(args, '--judge-api-key') || process.env.MINT_EVAL_JUDGE_API_KEY;
  const modelId = optionValue(args, '--judge-model') || process.env.MINT_EVAL_JUDGE_MODEL_ID;
  if (!apiUrl || !apiKey || !modelId) throw new Error('--judge requires MINT_EVAL_JUDGE_API_URL, MINT_EVAL_JUDGE_API_KEY and MINT_EVAL_JUDGE_MODEL_ID (or matching --judge-* options)');
  return { apiUrl, apiKey, modelId };
}

function applyDatabaseOverride(args: string[]): string | undefined {
  const cliPath = optionValue(args, '--db');
  const dbPath = cliPath ? path.resolve(cliPath) : envPath('MINT_EVAL_DB_PATH', '');
  if (dbPath) process.env.AI_CHAT_DB_PATH = dbPath;
  return dbPath || undefined;
}

/** 输出不含提示词、回答或密钥的评测执行进度；`--quiet` 可关闭。 */
function logEvaluationProgress(update: EvalProgressUpdate): void {
  const currentRun = update.phase === 'run_started' ? update.completedRuns + 1 : update.completedRuns;
  const position = `${currentRun}/${update.totalRuns}`;
  if (update.phase === 'run_started') {
    console.log(`[eval] ${position} start ${update.caseId} run ${update.runIndex}`);
  } else if (update.phase === 'judge_started') {
    console.log(`[eval] ${position} judge ${update.caseId} run ${update.runIndex}`);
  } else {
    console.log(`[eval] ${position} done ${update.caseId} run ${update.runIndex} ${update.passed ? 'PASS' : 'FAIL'} ${update.latencyMs}ms`);
  }
}

/** 执行评估 CLI 命令。 */
async function main(): Promise<void> {
  if (command === 'list') { console.log(DATASET_NAMES.join('\n')); return; }
  if (command === 'calibration:export') {
    const report = JSON.parse(await fs.readFile(path.resolve(requiredOption(args, '--report')), 'utf8')) as EvalReport;
    const output = path.resolve(optionValue(args, '--output') || path.join(evalDirectory, 'viewer/calibration-template.json'));
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(buildCalibrationTemplate(report), null, 2)}\n`, 'utf8');
    console.log(output);
    return;
  }
  if (command === 'calibration:compare') {
    const report = JSON.parse(await fs.readFile(path.resolve(requiredOption(args, '--report')), 'utf8')) as EvalReport;
    const payload = JSON.parse(await fs.readFile(path.resolve(requiredOption(args, '--labels')), 'utf8')) as { labels?: CalibrationLabel[] } | CalibrationLabel[];
    const labels = Array.isArray(payload) ? payload : payload.labels;
    if (!Array.isArray(labels)) throw new Error('Calibration labels must be an array or an object with labels');
    const comparison = compareCalibration(report, labels);
    const output = optionValue(args, '--output');
    if (output) {
      const outputPath = path.resolve(output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(comparison, null, 2));
    return;
  }
  if (command === 'pairwise') {
    const dataset = await loadDataset(datasetPath(datasetsDirectory, requiredOption(args, '--dataset')));
    const reportA = JSON.parse(await fs.readFile(path.resolve(requiredOption(args, '--report-a')), 'utf8')) as EvalReport;
    const reportB = JSON.parse(await fs.readFile(path.resolve(requiredOption(args, '--report-b')), 'utf8')) as EvalReport;
    const comparison = await runPairwiseComparison(dataset, reportA, reportB, optionValue(args, '--label-a') || 'A', optionValue(args, '--label-b') || 'B', createOpenAiPairwiseJudge(judgeConfig(args)));
    const output = path.resolve(optionValue(args, '--output') || path.join(evalDirectory, 'viewer/pairwise-report.json'));
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ total: comparison.total, winsA: comparison.winsA, winsB: comparison.winsB, ties: comparison.ties, positionDisagreements: comparison.positionDisagreements }, null, 2));
    return;
  }
  if (command === 'pairwise:elo') {
    const report = JSON.parse(await fs.readFile(path.resolve(requiredOption(args, '--input')), 'utf8')) as PairwiseReport;
    console.log(JSON.stringify(calculateElo(report), null, 2));
    return;
  }
  if (command === 'prepare') {
    const rawDir = optionValue(args, '--raw') || envPath('MINT_EVAL_RAW_DIR', path.join(datasetsDirectory, 'wiki-rag/raw'));
    const outputDir = optionValue(args, '--output') || envPath('MINT_EVAL_FIXTURE_PATH', path.join(datasetsDirectory, 'wiki-rag/fixture'));
    const report = await prepareWikiRagCorpus(rawDir, outputDir);
    console.log(JSON.stringify({ outputDir: report.outputDir, sourceCount: report.sources.length, pageCount: report.sources.length }, null, 2));
    return;
  }
  if (command === 'ingest') {
    const rawDir = optionValue(args, '--raw') || envPath('MINT_EVAL_RAW_DIR', path.join(datasetsDirectory, 'wiki-rag/raw'));
    const outputDir = optionValue(args, '--output') || envPath('MINT_EVAL_WIKI_PATH', path.join(os.tmpdir(), 'mint-wiki-rag-ingested'));
    const cliDbPath = optionValue(args, '--db');
    const dbPath = cliDbPath ? path.resolve(cliDbPath) : envPath('MINT_EVAL_DB_PATH', path.join(os.tmpdir(), 'mint-wiki-rag-agent-eval.db'));
    process.env.AI_CHAT_DB_PATH = dbPath;
    const server = await import('mint-server/eval');
    const existing = server.getAiSettings();
    const apiUrl = optionValue(args, '--api-url') || process.env.MINT_EVAL_API_URL || existing.apiUrl;
    const apiKey = optionValue(args, '--api-key') || process.env.MINT_EVAL_API_KEY || existing.apiKey;
    const modelId = optionValue(args, '--model') || process.env.MINT_EVAL_MODEL_ID || existing.modelId;
    if (!apiUrl || !apiKey || !modelId) {
      throw new Error('Wiki ingestion requires --api-url, --api-key and --model (or MINT_EVAL_API_* environment variables)');
    }
    const settings = server.configureEvalSettings({ apiUrl, apiKey, modelId, wikiPath: path.resolve(outputDir) });
    const report = await ingestWikiRagCorpus(rawDir, outputDir, settings, server.ingestWikiSource, {
      clean: args.includes('--clean'),
      onProgress: (update) => {
        const position = `${update.phase === 'source_started' ? update.completedSources + 1 : update.completedSources}/${update.totalSources}`;
        if (update.phase === 'source_started') console.log(`[ingest] ${position} start ${update.sourceFile}`);
        else console.log(`[ingest] ${position} done ${update.sourceFile} pages=${update.pageCount}`);
      },
    });
    const pageCount = report.sources.reduce((sum, source) => sum + source.result.pages.length, 0);
    console.log(JSON.stringify({ outputDir: report.outputDir, dbPath: path.resolve(dbPath), sourceCount: report.sources.length, pageCount }, null, 2));
    return;
  }
  if (command !== 'run') throw new Error(`Unknown eval command: ${command}`);
  const datasetName = optionValue(args, '--dataset'); const runsValue = optionValue(args, '--runs'); const outputPath = optionValue(args, '--output'); const baselinePath = optionValue(args, '--baseline');
  const live = args.includes('--live');
  const name = datasetName || 'smoke'; const runs = resolveRuns(runsValue, live);
  const output = outputPath || path.join(evalDirectory, 'viewer/report.json');
  const dbPath = applyDatabaseOverride(args);
  const dataset = await loadDataset(datasetPath(datasetsDirectory, name));
  let executor = smokeExecutor;
  if (args.includes('--dry-run')) executor = dryRunExecutor;
  if (live) {
    const server = await import('mint-server/eval');
    const wikiPath = optionValue(args, '--wiki') || envPath('MINT_EVAL_WIKI_PATH', '');
    if (wikiPath && !dbPath) throw new Error('--wiki requires --db or MINT_EVAL_DB_PATH so the Wiki path remains isolated from production settings');
    const existing = server.getAiSettings();
    const settings = wikiPath
      ? server.configureEvalSettings({ apiUrl: existing.apiUrl, apiKey: existing.apiKey, modelId: existing.modelId, wikiPath: path.resolve(wikiPath) })
      : existing;
    if (!settings.wikiPath) throw new Error('Live Wiki-RAG evaluation requires --wiki <isolated-wiki-path> or a configured wikiPath');
    executor = server.createReactExecutor(settings);
  }
  const judge = args.includes('--judge') ? createOpenAiJudge(judgeConfig(args)) : undefined;
  const report = await runEvaluation(dataset, executor, runs, judge, args.includes('--quiet') ? undefined : logEvaluationProgress);
  const finalReport = baselinePath
    ? compareReports(report, JSON.parse(await fs.readFile(path.resolve(baselinePath), 'utf8')) as EvalReport)
    : report;
  await writeReport(finalReport, output); console.log(JSON.stringify(finalReport.summary, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
