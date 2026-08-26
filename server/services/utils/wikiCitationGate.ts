import { findWikiCitationMarkers } from './wikiCitationMarkers.js';

/** 最终回答中可被 A2UI 和评测链路解析的 Wiki 引用。 */
export interface WikiCitationReference {
  refId: string;
}

function normalizeRefId(refId: string): string {
  return refId.trim().toLocaleUpperCase();
}

/**
 * 构造缺失 Wiki 来源的透明兜底区块。
 *
 * 兜底只补充已经由 Wiki 搜索返回的引用 marker，不改写模型事实正文，
 * 并明确区分“逐句引用”和“补充检索来源”，避免把检索命中伪装成结论证明。
 *
 * @param content 模型生成的最终回答
 * @param references 本轮已登记的 Wiki 搜索引用
 * @returns 应追加到回答末尾的文本；没有缺失来源时返回空字符串
 */
export function buildMissingWikiCitationFooter(
  content: string,
  references: WikiCitationReference[],
): string {
  const uniqueReferences = [...new Map(
    references
      .filter((reference) => reference.refId.trim())
      .map((reference) => [normalizeRefId(reference.refId), reference]),
  ).values()];
  if (uniqueReferences.length === 0) return '';

  const citedRefIds = new Set(
    findWikiCitationMarkers(content).map((marker) => normalizeRefId(marker.refId)),
  );
  const missingReferences = uniqueReferences.filter(
    (reference) => !citedRefIds.has(normalizeRefId(reference.refId)),
  );
  if (missingReferences.length === 0) return '';

  const label = citedRefIds.size === 0
    ? '参考来源（模型未逐句标注）：'
    : '补充检索来源：';
  const markers = missingReferences
    .map((reference) => `[${reference.refId}]`)
    .join(' ');
  return `${content.trim() ? '\n\n' : ''}${label}${markers}`;
}
