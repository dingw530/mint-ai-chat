import path from 'node:path';
import './loadEnv.js';
import { datasetPath, loadDataset, runEvaluation, writeReport } from './index.js';
import type { AgentEvalExecutor } from './index.js';

const [, , command = 'list', ...args] = process.argv;
const smokeExecutor: AgentEvalExecutor = async evalCase => ({ content: evalCase.id === 'qa-001' ? '思考、行动、观察' : '', events: [{ type: 'run_completed' }] });

/** 执行评估 CLI 命令。 */
async function main(): Promise<void> {
  if (command === 'list') { console.log('smoke'); return; }
  if (command !== 'run') throw new Error(`Unknown eval command: ${command}`);
  const datasetIndex = args.indexOf('--dataset'); const runsIndex = args.indexOf('--runs'); const outputIndex = args.indexOf('--output');
  const live = args.includes('--live');
  const name = datasetIndex >= 0 ? args[datasetIndex + 1] : 'smoke'; const runs = Number(runsIndex >= 0 ? args[runsIndex + 1] : 1);
  const output = outputIndex >= 0 ? args[outputIndex + 1] : path.resolve(process.cwd(), 'agent-eval/viewer/report.json');
  const dataset = await loadDataset(datasetPath(path.resolve(process.cwd(), 'agent-eval/datasets'), name));
  let executor = smokeExecutor;
  if (live) { const server = await import('mint-server/eval'); executor = server.createReactExecutor(server.getAiSettings()); }
  const report = await runEvaluation(dataset, executor, runs); await writeReport(report, output); console.log(JSON.stringify(report.summary, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
