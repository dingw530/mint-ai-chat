import fs from 'node:fs/promises';
import path from 'node:path';

export async function createRun(rootDir, changeId) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const artifactDir = path.join(rootDir, '.harness', 'runs', changeId, runId);
  await fs.mkdir(artifactDir, { recursive: true });
  return { runId, artifactDir, changeId };
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeRunTask(run, task) {
  await writeJson(path.join(run.artifactDir, 'task.json'), task);
}

export async function writeIteration(run, iteration, value) {
  const filePath = path.join(run.artifactDir, `iteration-${iteration}.json`);
  await writeJson(filePath, value);
  return filePath;
}

export async function appendSddExecutionRecord(rootDir, changeId, record) {
  const changeDir = path.join(rootDir, 'docs', 'changes', changeId);
  const timestamp = new Date().toISOString().slice(0, 10);
  const block = [
    '',
    `### ${timestamp}：Harness run ${record.runId}`,
    '',
    `- 状态：${record.status}`,
    `- TP：${record.currentTp || '未指定'}`,
    `- 轮次：${record.iterations}`,
    `- 证据目录：.harness/runs/${changeId}/${record.runId}`,
    `- 检查结果：${record.checkSummary}`,
  ].join('\n');

  for (const fileName of ['exec-plan.md', 'traceability.md']) {
    const filePath = path.join(changeDir, fileName);
    try {
      await fs.appendFile(filePath, `${block}\n`, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
