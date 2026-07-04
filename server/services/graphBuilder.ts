import * as graphRepo from '../repositories/graphRepository.js';
import type { CompiledPage } from './utils/wikiShared.js';

// ── Types ──

export interface BuildGraphResult {
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
}

// ── Category → Node Type Mapping ──

const CATEGORY_TO_TYPE: Record<string, 'concept' | 'practice' | 'methodology'> = {
  concept: 'concept',
  practice: 'practice',
  methodology: 'methodology',
};

const DEFAULT_TYPE = 'concept' as const;

/**
 * 从 CompiledPage.filename 中提取分类目录并映射为 node.type。
 *
 * filename 格式: "pages/<category>/<page-name>.md"
 * 例: "pages/concept/极限编程.md" → type: "concept"
 */
function inferNodeType(filename: string): 'concept' | 'practice' | 'methodology' {
  const parts = filename.split('/');
  const category = parts.length >= 2 ? parts[1] : '';
  return CATEGORY_TO_TYPE[category] || DEFAULT_TYPE;
}

// ── Main ──

/**
 * 从 Wiki 编译结果自动构建知识图谱。
 *
 * 在摄入流程的 compileSource() 返回后调用，功能：
 * 1. 每个 CompiledPage 创建一个 graph_node（按 label 去重）
 * 2. 同批次共享标签的页面间建立 shared_tag 边（同一对页面无论共享多少个标签只建一条）
 * 3. 所有操作在事务中执行，保证数据一致性
 *
 * @param pages - compileSource() 返回的完整编译页面列表
 * @returns 包含创建的节点数、边数及错误信息的构建结果
 */
export function buildGraphFromPages(pages: CompiledPage[]): BuildGraphResult {
  const errors: string[] = [];

  if (pages.length === 0) {
    return { nodesCreated: 0, edgesCreated: 0, errors: [] };
  }

  // ── Phase 1: Build Node Specs ──

  interface NodeSpec {
    label: string;
    type: 'concept' | 'practice' | 'methodology';
    sourceFile: string;
  }

  const nodeSpecs: NodeSpec[] = pages.map((page) => ({
    label: page.title,
    type: inferNodeType(page.filename),
    sourceFile: page.filename,
  }));

  // ── Phase 2: Build Edge Specs (shared tags) ──

  const tagToPageIndices = new Map<string, number[]>();
  for (let i = 0; i < pages.length; i++) {
    for (const tag of pages[i].tags) {
      if (!tagToPageIndices.has(tag)) {
        tagToPageIndices.set(tag, []);
      }
      tagToPageIndices.get(tag)!.push(i);
    }
  }

  /** 按字母序排列的 "labelA|labelB" 用于去重 */
  const edgePairSet = new Set<string>();
  const edgeSpecs: Array<{ sourceLabel: string; targetLabel: string }> = [];

  for (const [, indices] of tagToPageIndices) {
    if (indices.length < 2) continue;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = nodeSpecs[indices[i]].label;
        const b = nodeSpecs[indices[j]].label;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgePairSet.has(key)) continue;
        edgePairSet.add(key);
        edgeSpecs.push({ sourceLabel: a, targetLabel: b });
      }
    }
  }

  // ── Phase 3: Execute Writes in Transaction ──

  const result = graphRepo.transaction(() => {
    let nodesCreated = 0;
    let edgesCreated = 0;

    // 3a. Create nodes with dedup by label
    const labelToId = new Map<string, string>();

    for (const spec of nodeSpecs) {
      const existing = graphRepo.searchNodes(spec.label);
      const match = existing.find((n) => n.label === spec.label);
      if (match) {
        labelToId.set(spec.label, match.id);
        continue;
      }

      try {
        const node = graphRepo.createNode({
          label: spec.label,
          type: spec.type,
          sourceFile: spec.sourceFile,
        });
        labelToId.set(spec.label, node.id);
        nodesCreated++;
      } catch (err) {
        errors.push(`创建节点失败 [${spec.label}]: ${(err as Error).message}`);
      }
    }

    // 3b. Create edges with dedup by triple
    for (const spec of edgeSpecs) {
      const sourceId = labelToId.get(spec.sourceLabel);
      const targetId = labelToId.get(spec.targetLabel);
      if (!sourceId || !targetId) {
        errors.push(`找不到节点 ID: ${spec.sourceLabel} -> ${spec.targetLabel}`);
        continue;
      }

      const existingEdge = graphRepo.findEdgeByTriple(sourceId, 'shared_tag', targetId);
      if (existingEdge) continue;

      try {
        graphRepo.createEdge({
          sourceId,
          relation: 'shared_tag',
          targetId,
          source: 'auto-extracted',
        });
        edgesCreated++;
      } catch (err) {
        errors.push(`创建边失败 [${spec.sourceLabel} -> ${spec.targetLabel}]: ${(err as Error).message}`);
      }
    }

    return { nodesCreated, edgesCreated, errors };
  });

  return result;
}
