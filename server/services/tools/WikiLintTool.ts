import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { getWikiPath } from '../utils/pathSecurity.js';
import { WikiSearchTool } from './WikiSearchTool.js';

const WikiLintInputSchema = z.object({});

type WikiLintInput = z.infer<typeof WikiLintInputSchema>;

interface LintIssue {
  type: 'orphan' | 'broken_link' | 'missing_frontmatter' | 'schema_mismatch' | 'uncompiled_source';
  file: string;
  description: string;
}

interface WikiLintOutput {
  directoryTree: string;
  issues: LintIssue[];
  totalSourceFiles: number;
  totalPages: number;
  summary: string;
}

export class WikiLintTool extends BaseTool<WikiLintInput, WikiLintOutput> {
  readonly name = 'wiki_lint';
  readonly description = `检查 Wiki 知识库的健康状况。输出目录结构、元数据检查，并通过 wiki_search 验证所有内部链接是否断裂。
检查范围：pages/（Wiki 知识层）和 sources/（Sources 层）。
检查项：缺少 frontmatter、Schema 标签合规性、未编译的原始资料、断裂链接（内部页面间链接）。`;
  readonly inputSchema = WikiLintInputSchema;

  isReadOnly(): boolean {
    return true;
  }

  isConcurrencySafe(): boolean {
    return true;
  }

  async execute(_input: WikiLintInput, _context: ToolContext): Promise<WikiLintOutput> {
    const wikiPath = getWikiPath();
    if (!wikiPath) {
      throw new Error('Wiki 路径未配置，请在设置中配置 wikiPath');
    }

    const issues: LintIssue[] = [];

    // 读取 Schema
    const schema = this.readSchema(wikiPath);
    const validTags = new Set<string>((schema.tags as string[]) || []);

    // 扫描 sources/ 和 pages/
    const sourcesDir = path.join(wikiPath, 'sources');
    const pagesDir = path.join(wikiPath, 'pages');

    const sourceFiles = this.findMdFiles(sourcesDir);
    const pageFiles = this.findMdFiles(pagesDir);

    // 生成目录树
    const treeLines: string[] = ['pages/'];
    for (const filePath of pageFiles) {
      const relPath = path.relative(pagesDir, filePath);
      treeLines.push('  ' + relPath);
    }
    treeLines.push('sources/');
    for (const filePath of sourceFiles) {
      const relPath = path.relative(sourcesDir, filePath);
      if (relPath === '.gitkeep') continue;
      treeLines.push('  ' + relPath);
    }
    const directoryTree = treeLines.join('\n');

    // 第二轮：检查页面元数据 + 提取内部链接
    const linksToVerify: Array<{ source: string; target: string }> = [];

    for (const filePath of pageFiles) {
      const relPath = path.relative(wikiPath, filePath);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // 检查 frontmatter
        if (!content.startsWith('---')) {
          issues.push({
            type: 'missing_frontmatter',
            file: relPath,
            description: '缺少 YAML frontmatter',
          });
        } else {
          const frontmatter = this.parseFrontmatter(content);
          if (frontmatter) {
            const tags: string[] = (frontmatter.tags as string[]) || [];
            if (validTags.size > 0) {
              for (const tag of tags) {
                if (!validTags.has(tag)) {
                  issues.push({
                    type: 'schema_mismatch',
                    file: relPath,
                    description: `标签 "${tag}" 不在 _schema.json 的 tags 中`,
                  });
                }
              }
            }
          }
        }

        // 提取内部 Markdown 链接
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(content)) !== null) {
          const rawTarget = match[2];
          const stripped = rawTarget.replace(/\.md$/, '');
          // 只处理内部相对链接
          if (stripped.startsWith('http') || stripped.startsWith('#') || stripped.startsWith('/')) continue;

          const fileDir = path.dirname(relPath);
          let resolved = path.join(fileDir, stripped);
          resolved = path.normalize(resolved).replace(/\\/g, '/');

          // 检查目标是否在 pages/ 中
          if (!resolved.startsWith('pages/')) continue;

          linksToVerify.push({ source: relPath, target: resolved });
        }
      } catch { /* skip unreadable */ }
    }

    // 第三轮：用 WikiSearchTool 批量验证链接有效性
    if (linksToVerify.length > 0) {
      // 去重，只验证每个目标文件一次
      const seen = new Set<string>();
      const uniquePaths: string[] = [];
      for (const link of linksToVerify) {
        const fullPath = link.target + '.md';
        if (!seen.has(fullPath)) {
          seen.add(fullPath);
          uniquePaths.push(fullPath);
        }
      }

      const wsTool = new WikiSearchTool();
      const verifyResult = await wsTool.execute(
        { paths: uniquePaths, maxResults: 1, includeContent: false },
        { conversationId: '' },
      );

      // 收集不存在的文件路径
      const nonExistent = new Set<string>();
      for (const r of verifyResult.results) {
        if (r.content.startsWith('[文件不存在')) {
          nonExistent.add(r.file);
        }
      }

      // 原路映射回所有引用关系
      for (const link of linksToVerify) {
        if (nonExistent.has(link.target + '.md')) {
          issues.push({
            type: 'broken_link',
            file: link.source,
            description: `断裂链接: "${link.target}.md" 目标页面不存在`,
          });
        }
      }
    }

    // 检查未编译的原始资料
    const compiledSources = new Set<string>();
    for (const filePath of pageFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sourceMatch = content.match(/^source:\s*(.+)$/m);
      if (sourceMatch) {
        compiledSources.add(sourceMatch[1].trim());
      }
    }
    for (const filePath of sourceFiles) {
      const filename = path.basename(filePath);
      if (filename === '.gitkeep') continue;
      if (!compiledSources.has(filename)) {
        const relPath = path.relative(wikiPath, filePath);
        issues.push({
          type: 'uncompiled_source',
          file: relPath,
          description: `原始资料 "${filename}" 尚未被编译为 Wiki 页面`,
        });
      }
    }

    const brokenCount = issues.filter(i => i.type === 'broken_link').length;
    const frontmatterCount = issues.filter(i => i.type === 'missing_frontmatter').length;
    const schemaCount = issues.filter(i => i.type === 'schema_mismatch').length;
    const uncompiledCount = issues.filter(i => i.type === 'uncompiled_source').length;

    return {
      directoryTree,
      issues,
      totalSourceFiles: sourceFiles.filter(f => !f.endsWith('.gitkeep')).length,
      totalPages: pageFiles.length,
      summary: issues.length === 0
        ? `Wiki 健康状态良好（${sourceFiles.length} 个原始资料，${pageFiles.length} 个页面）`
        : `发现 ${issues.length} 个问题：` +
          (brokenCount ? brokenCount + ' 个断裂链接, ' : '') +
          (frontmatterCount ? frontmatterCount + ' 个缺少 frontmatter, ' : '') +
          (schemaCount ? schemaCount + ' 个 Schema 不匹配, ' : '') +
          (uncompiledCount ? uncompiledCount + ' 个未编译资料' : ''),
    };
  }

  private readSchema(wikiPath: string): Record<string, unknown> {
    try {
      return JSON.parse(fs.readFileSync(path.join(wikiPath, '_schema.json'), 'utf-8'));
    } catch {
      return {};
    }
  }

  private parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const result: Record<string, unknown> = {};
    for (const line of match[1].split('\n')) {
      const [key, ...rest] = line.split(':');
      if (key && rest.length > 0) {
        let value = rest.join(':').trim();
        // Parse arrays [a, b, c]
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1);
          result[key.trim()] = value.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
        } else {
          result[key.trim()] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    }
    return result;
  }

  private findMdFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...this.findMdFiles(fullPath));
        } else if (entry.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch { /* skip */ }
    return files;
  }
}
