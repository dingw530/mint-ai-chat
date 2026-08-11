const app = document.querySelector('#app');
const pct = value => `${(value * 100).toFixed(1)}%`;
const sec = value => `${(value / 1000).toFixed(1)} 秒`;
const deltaPct = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} 个百分点`;
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** 将数据集标识转换为报告页使用的中文名称。 */
function datasetName(dataset) {
  return dataset === 'wiki-rag' ? 'Wiki / RAG' : dataset;
}

/** 将评测器输出的英文原因转换为可读的中文诊断。 */
function translateReason(reason) {
  if (reason === 'wiki search call limit exceeded') return 'Wiki 搜索次数超出限制';
  if (reason === 'loop detected') return '检测到推理循环';
  if (reason === 'veto rubric failed') return '触发禁止条件，结果被否决';

  const rubric = reason.match(/^(essential|important|optional) rubric failed: (.+)$/);
  if (rubric) return `${{ essential: '必要项', important: '重要项', optional: '可选项' }[rubric[1]]} Rubric 未通过：${rubric[2]}`;

  const state = reason.match(/^final state assertion failed: (.+)$/);
  if (state) return `最终状态断言未通过：${state[1]}`;

  const alternatives = reason.match(/^missing answer alternatives: (.+)$/);
  if (alternatives) return `缺少应提供的替代答案：${alternatives[1]}`;

  const source = reason.match(/^missing required source: (.+)$/);
  if (source) return `缺少必需来源：${source[1]}`;

  const retrievalSource = reason.match(/^retrieval missing required source: (.+)$/);
  if (retrievalSource) return `检索未覆盖必需来源：${retrievalSource[1]}`;

  const citations = reason.match(/^not enough citations: expected (\d+), got (\d+)$/);
  if (citations) return `最终答案引用不足：应有 ${citations[1]} 条，实际 ${citations[2]} 条`;

  return reason;
}

/** 将可选百分比字段格式化为展示文本。 */
function formatPercent(value) {
  return typeof value === 'number' ? pct(value) : '—';
}

/** 将可选数值字段格式化为不带小数的展示文本。 */
function formatCount(value) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '—';
}

/** 根据报告中的失败原因生成最多三条高频诊断。 */
function failureInsights(results) {
  const counts = new Map();
  results.filter(result => !result.passed).forEach(result => {
    (result.reasons?.length ? result.reasons : ['未通过，但未记录具体原因']).forEach(reason => {
      const label = translateReason(reason);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
}

/** 将指标配置渲染为统一的指标卡片。 */
function renderMetricCards(metrics) {
  return metrics.map(({ label, value, description, tone = '' }) => `<article class="metric ${tone}"><span>${label}</span><b class="number">${formatPercent(value)}</b><small>${description}</small></article>`).join('');
}

/** 渲染逐题稳定性统计，兼容旧报告中没有 caseStats 的情况。 */
function renderCaseStats(caseStats) {
  if (!caseStats.length) return '<p class="muted">当前报告没有逐题稳定性统计。</p>';
  return caseStats.map(stat => `<div class="case-row"><strong>${esc(stat.caseId)}</strong><span>${stat.passedRuns} / ${stat.runs} 次通过</span><span class="number">${formatPercent(stat.passRate)}</span><span class="number">Pass@k ${formatPercent(stat.passAtK)}</span><span class="number">Pass^k ${formatPercent(stat.passPowerK)}</span><span class="number">${sec(stat.meanLatencyMs)}</span></div>`).join('');
}

function render(report) {
  if (!report) {
    app.innerHTML = '<section class="empty"><b>∅</b><p class="eyebrow">评测报告</p><h1>暂无评测报告</h1><p>请先运行评测命令生成 <code>report.json</code>。</p></section>';
    return;
  }

  const s = report.summary ?? {};
  const results = report.results ?? [];
  const queryPassAt1 = s.queryPassAt1 ?? s.passAt1;
  const queryPassedRuns = s.queryPassedRuns ?? s.passedRuns;
  const failedRuns = results.filter(result => !result.passed).length;
  const failedCases = new Set(results.filter(result => !result.passed).map(result => result.caseId)).size;
  const caseCount = report.caseStats?.length ?? new Set(results.map(result => result.caseId)).size;
  const insights = failureInsights(results);
  const k = s.passAtKValue ?? s.passPowerKValue ?? '?';
  const metrics = [
    { label: '查询通过率', value: queryPassAt1, description: '回答、检索证据和引用满足题目要求', tone: 'accent' },
    { label: '回答质量', value: s.answerPassAt1 ?? s.passAt1, description: '回答内容与无答案拒答行为', tone: 'accent' },
    { label: `Pass@${k}`, value: s.passAtK, description: '多次尝试中至少一次通过的概率', tone: 'accent' },
    { label: `Pass^${s.passPowerKValue ?? k}`, value: s.passPowerK ?? s.passAt1, description: '连续多次运行全部通过的稳定性', tone: 'accent' },
  ];
  const qualityMetrics = [
    { label: '检索覆盖率', value: s.retrievalCoverageRate, description: '检索结果覆盖目标来源的比例' },
    { label: '引用覆盖率', value: s.citationCoverageRate, description: '最终答案覆盖检索证据的比例' },
    { label: '引用准确率', value: s.citationAccuracyRate, description: '最终答案引用正确来源的比例' },
    { label: '拒答准确率', value: s.abstentionAccuracy, description: '无答案场景下正确拒答的比例' },
    { label: '必要项通过率', value: s.essentialPassRate, description: 'Essential Rubric 的通过比例' },
    { label: '重要项通过率', value: s.importantPassRate, description: 'Important Rubric 的通过比例' },
    { label: '可选项通过率', value: s.optionalPassRate, description: 'Optional Rubric 的通过比例' },
    { label: '严格通过率', value: s.passAt1, description: '回答、引用和工具预算全部通过' },
  ];
  const efficiencyMetrics = [
    { label: '平均耗时', value: sec(s.averageLatencyMs), description: '每次运行从开始到结束的平均耗时', raw: true },
    { label: 'P95 耗时', value: sec(s.p95LatencyMs), description: '95% 的运行耗时不超过此值', raw: true },
    { label: '工具预算', value: s.toolBudgetPassRate, description: '工具调用未超出题目限制' },
    { label: 'Wiki 检索预算', value: s.wikiSearchBudgetPassRate, description: 'Wiki 搜索未超出题目限制' },
    { label: '平均轮数', value: s.averageRounds?.toFixed(1), description: '每次运行的平均推理轮数', raw: true },
    { label: '平均工具调用', value: s.averageToolCalls?.toFixed(1), description: '每次运行的平均工具调用数', raw: true },
    { label: '平均 Wiki 搜索', value: s.averageWikiSearchCalls?.toFixed(1), description: '每次运行的平均 Wiki 搜索数', raw: true },
    { label: '工具调用成功率', value: s.toolSuccessRate, description: '工具调用返回成功结果的比例' },
  ];
  const metricMarkup = renderMetricCards(metrics);
  const resultMarkup = results.map(result => {
    const reasons = (result.reasons ?? []).map(translateReason).join(' · ') || '无';
    return `<div class="row"><strong><i class="${result.passed ? 'pass' : 'fail'}"></i>${esc(result.caseId)} <small>第 ${result.runIndex ?? 1} 次</small></strong><span>${result.passed ? '通过' : '未通过'}</span><span class="number">${result.toolCalls} 次</span><span class="number">${result.citationCount ?? 0} / ${result.retrievedCitationCount ?? 0}</span><span class="number">${formatPercent(result.rubricScore)}</span><span class="number">${sec(result.latencyMs)}</span><span class="reason">${esc(reasons)}</span></div>`;
  }).join('');
  const comparisonMarkup = report.comparison ? `<section class="comparison"><div><p class="eyebrow">基线对比</p><h2>与历史报告相比</h2></div><p>${Object.entries(report.comparison.deltas).map(([name, value]) => `<b>${esc(name)}</b> ${deltaPct(value)}`).join(' · ')}${report.comparison.warnings.length ? `<br><small>${esc(report.comparison.warnings.join('；'))}</small>` : ''}</p></section>` : '';
  const insightMarkup = insights.length ? insights.map(([reason, count]) => `<li><span>${esc(reason)}</span><b class="number">${count} 次</b></li>`).join('') : '<li><span>本次运行没有失败原因。</span><b class="number">0 次</b></li>';
  const qualityMarkup = renderMetricCards(qualityMetrics);
  const efficiencyMarkup = efficiencyMetrics.map(({ label, value, description, raw }) => `<article class="metric"><span>${label}</span><b class="number">${raw ? value ?? '—' : formatPercent(value)}</b><small>${description}</small></article>`).join('');

  app.innerHTML = `<header><div><p class="eyebrow">AGENT 评测 / ${esc(datasetName(report.dataset))}</p><h1>Agent 能力评测报告</h1><p class="sub">把一次运行拆成通过质量、证据质量和执行效率，快速定位 Agent 的强项与短板。</p></div><div class="meta">版本 v${esc(report.version)} · 生成于 ${new Date(report.generatedAt).toLocaleString('zh-CN')}</div></header><section class="overview"><div class="score"><span>查询通过率 · Pass@1</span><strong class="number">${formatPercent(queryPassAt1)}</strong><small>${formatCount(queryPassedRuns)} / ${formatCount(s.totalRuns)} 次查询通过</small><div class="score-foot"><span>${caseCount} 条用例</span><span>${report.runsPerCase ?? 1} 次 / 用例</span></div></div><div class="metrics">${metricMarkup}</div></section><section class="run-summary"><div><span class="eyebrow">运行概览</span><strong class="number">${formatCount(s.totalRuns)}</strong><small>总运行次数</small></div><div><span class="eyebrow">完整通过</span><strong class="number">${formatCount(s.passedRuns)}</strong><small>严格通过的运行</small></div><div><span class="eyebrow">未通过运行</span><strong class="number ${failedRuns ? 'warning' : ''}">${formatCount(failedRuns)}</strong><small>${formatCount(failedCases)} 条用例出现失败</small></div><div><span class="eyebrow">平均轮数</span><strong class="number">${s.averageRounds?.toFixed(1) ?? '—'}</strong><small>每次运行</small></div></section><section class="metric-section"><div class="section-head"><div><p class="eyebrow">质量拆解</p><h2>回答与证据</h2></div><span>越高越好</span></div><div class="metrics detail-grid">${qualityMarkup}</div></section><section class="metric-section"><div class="section-head"><div><p class="eyebrow">效率拆解</p><h2>执行成本与稳定性</h2></div><span>时间越低越好 · 通过率越高越好</span></div><div class="metrics detail-grid">${efficiencyMarkup}</div></section><section class="insights"><div><p class="eyebrow">失败诊断</p><h2>最常见的问题</h2><p class="muted">按失败运行中的原因统计，帮助优先处理影响最大的短板。</p></div><ol>${insightMarkup}</ol></section><section class="guide"><div><p class="eyebrow">指标说明</p><h2>如何阅读这份报告</h2></div><p><b>查询通过率</b>只衡量回答、检索证据和最终引用是否满足题目要求；<b>严格通过率</b>还会额外检查工具调用预算。<b>Pass@k</b>表示多次尝试至少一次成功，<b>Pass^k</b>表示连续尝试都成功。<b>检索覆盖率</b>关注工具是否搜到目标来源，<b>引用准确率</b>关注最终答案是否展示了正确来源。</p></section>${comparisonMarkup}<section class="stability"><div class="section-head"><div><p class="eyebrow">稳定性</p><h2>逐题通过情况</h2></div><span>${caseCount} 条用例</span></div><div class="case-table"><div class="case-row case-head"><span>用例</span><span>通过次数</span><span>通过率</span><span>Pass@k</span><span>Pass^k</span><span>平均耗时</span></div>${renderCaseStats(report.caseStats ?? [])}</div></section><section class="trace"><div class="section-head"><div><p class="eyebrow">逐次结果</p><h2>每次运行明细</h2></div><span>${results.length} 次运行</span></div><div class="table"><div class="row head"><span>用例</span><span>状态</span><span>工具调用</span><span>引用（展示 / 检索）</span><span>Rubric</span><span>耗时</span><span>诊断</span></div>${resultMarkup}</div></section>`;
}

fetch('report.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(payload => render(payload?.report ?? payload)).catch(() => render(null));
