import type { EvalJudgeDimensionResult, EvalReport } from './index.js';

export interface CalibrationLabel {
  caseId: string;
  runIndex: number;
  passed: boolean;
  dimensions: EvalJudgeDimensionResult[];
}

export interface CalibrationComparison {
  matched: number;
  passAgreementRate: number;
  dimensionExactAgreementRate: number;
  meanAbsoluteError: number;
  disagreements: Array<{ caseId: string; runIndex: number; reason: string }>;
}

/** 导出可由人工填写的 Judge 校准模板，保留原始评测上下文。 */
export function buildCalibrationTemplate(report: EvalReport): { dataset: string; version: string; labels: CalibrationLabel[] } {
  return {
    dataset: report.dataset,
    version: report.version,
    labels: report.results.filter(result => result.judge && !result.judge.skipped).map(result => ({
      caseId: result.caseId,
      runIndex: result.runIndex,
      passed: false,
      dimensions: result.judge!.dimensions.map(dimension => ({ ...dimension, score: dimension.score, passed: dimension.passed, evidenceIds: [], reason: '' })),
    })),
  };
}

/** 将人工标注与 Judge 结果逐题对齐，输出可复核的一致性度量。 */
export function compareCalibration(report: EvalReport, labels: CalibrationLabel[]): CalibrationComparison {
  const labelsByRun = new Map(labels.map(label => [`${label.caseId}:${label.runIndex}`, label]));
  let matched = 0; let passMatches = 0; let dimensionMatches = 0; let dimensionCount = 0; let absoluteError = 0;
  const disagreements: CalibrationComparison['disagreements'] = [];
  for (const result of report.results) {
    if (!result.judge || result.judge.skipped) continue;
    const label = labelsByRun.get(`${result.caseId}:${result.runIndex}`);
    if (!label) continue;
    matched += 1;
    if (label.passed === result.judgePassed) passMatches += 1;
    else disagreements.push({ caseId: result.caseId, runIndex: result.runIndex, reason: 'overall pass disagreement' });
    const humanDimensions = new Map(label.dimensions.map(dimension => [dimension.id, dimension]));
    for (const judgeDimension of result.judge.dimensions) {
      const humanDimension = humanDimensions.get(judgeDimension.id);
      if (!humanDimension) continue;
      dimensionCount += 1;
      if (judgeDimension.score !== undefined && humanDimension.score !== undefined) {
        absoluteError += Math.abs(judgeDimension.score - humanDimension.score);
        if (judgeDimension.score === humanDimension.score) dimensionMatches += 1;
      } else if (judgeDimension.passed === humanDimension.passed) dimensionMatches += 1;
      else disagreements.push({ caseId: result.caseId, runIndex: result.runIndex, reason: `dimension disagreement: ${judgeDimension.id}` });
    }
  }
  return { matched, passAgreementRate: passMatches / Math.max(1, matched), dimensionExactAgreementRate: dimensionMatches / Math.max(1, dimensionCount), meanAbsoluteError: absoluteError / Math.max(1, dimensionCount), disagreements };
}
