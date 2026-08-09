const app = document.querySelector('#app');
const pct = value => `${(value * 100).toFixed(1)}%`;
const sec = value => `${(value / 1000).toFixed(1)} 秒`;
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** 将数据集标识转换为报告页使用的中文名称。 */
function datasetName(dataset) {
  return dataset === 'wiki-rag' ? 'Wiki / RAG' : dataset;
}

/** 将评测器输出的英文原因转换为可读的中文诊断。 */
function translateReason(reason) {
  if (reason === 'wiki search call limit exceeded') return 'Wiki 搜索次数超出限制';
  if (reason === 'loop detected') return '检测到推理循环';

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

function render(report) {
  if (!report) {
    app.innerHTML = '<section class="empty"><b>∅</b><p class="eyebrow">评测报告</p><h1>暂无评测报告</h1><p>请先运行评测命令生成 <code>report.json</code>。</p></section>';
    return;
  }

  const s = report.summary;
  const queryPassAt1 = s.queryPassAt1 ?? s.passAt1;
  const queryPassedRuns = s.queryPassedRuns ?? s.passedRuns;
  const metrics = [
    ['严格通过率', s.passAt1, '回答、引用和工具预算全部通过'],
    ['回答质量', s.answerPassAt1 ?? s.passAt1, '回答内容与无答案拒答行为'],
    ['工具预算', s.toolBudgetPassRate ?? 0, '所有工具调用均未超出限制'],
    ['Wiki 检索预算', s.wikiSearchBudgetPassRate ?? 0, '每题最多进行 2 次 Wiki 搜索'],
    ['检索覆盖率', s.retrievalCoverageRate ?? 0, '检索结果覆盖目标来源的比例'],
    ['引用准确率', s.citationAccuracyRate ?? 0, '最终答案引用目标来源的比例'],
  ];
  const metricMarkup = metrics.map(([label, value, description]) => `<article><span>${label}</span><b>${pct(value)}</b><small>${description}</small></article>`).join('');
  const resultMarkup = report.results.map(result => {
    const reasons = result.reasons.map(translateReason).join(' · ') || '无';
    return `<div class="row"><strong><i class="${result.passed ? 'pass' : 'fail'}"></i>${esc(result.caseId)}</strong><span>${result.passed ? '通过' : '未通过'}</span><span>${result.toolCalls} 次</span><span>${result.citationCount ?? 0} / ${result.retrievedCitationCount ?? 0}</span><span>${sec(result.latencyMs)}</span><span class="reason">${esc(reasons)}</span></div>`;
  }).join('');

  app.innerHTML = `<header><div><p class="eyebrow">AGENT 评测 / ${esc(datasetName(report.dataset))}</p><h1>Agent 能力评测报告</h1><p class="sub">查看回答质量、引用完整性、检索效果和工具调用稳定性。</p></div><div class="meta">版本 v${esc(report.version)} · 生成于 ${new Date(report.generatedAt).toLocaleString('zh-CN')}</div></header><section class="overview"><div class="score"><span>查询通过率 · Pass@1</span><strong>${pct(queryPassAt1)}</strong><small>${queryPassedRuns} / ${s.totalRuns} 条查询通过</small></div><div class="metrics">${metricMarkup}</div></section><section class="guide"><div><p class="eyebrow">指标说明</p><h2>如何阅读这份报告</h2></div><p><b>查询通过率</b>只衡量回答、检索证据和最终引用是否满足题目要求；<b>严格通过率</b>还会额外检查工具调用预算。<b>检索覆盖率</b>关注工具是否搜到目标来源，<b>引用准确率</b>关注最终答案是否展示了正确来源。</p></section><section class="trace"><div class="section-head"><div><p class="eyebrow">逐题结果</p><h2>每条评测用例</h2></div><span>${report.results.length} 次运行</span></div><div class="table"><div class="row head"><span>用例</span><span>状态</span><span>工具调用</span><span>引用（展示 / 检索）</span><span>耗时</span><span>诊断</span></div>${resultMarkup}</div></section>`;
}

fetch('report.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(payload => render(payload?.report ?? payload)).catch(() => render(null));
