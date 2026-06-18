import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { getWikiPath } from '../utils/pathSecurity.js';

const WikiLintInputSchema = z.object({});

type WikiLintInput = z.infer<typeof WikiLintInputSchema>;

interface LintIssue {
  type: 'orphan' | 'broken_link' | 'missing_frontmatter' | 'schema_mismatch' | 'uncompiled_source';
  file: string;
  description: string;
}

interface WikiLintOutput {
  healthy: boolean;
  issues: LintIssue[];
  totalSourceFiles: number;
  totalPages: number;
  summary: string;
}

export class WikiLintTool extends BaseTool<WikiLintInput, WikiLintOutput> {
  readonly name = 'wiki_lint';
  readonly description = `检查 Wiki 知识库的健康状况（三层架构）。
检查范围：pages/（Wiki 知识层）和 sources/（Sources 层）。
检查项：孤立页面、断裂链接、缺少 frontmatter、Schema 合规性、未编译的原始资料。`;
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
    void (schema.categories); // 预留

    // 扫描 sources/ 和 pages/
    const sourcesDir = path.join(wikiPath, 'sources');
    const pagesDir = path.join(wikiPath, 'pages');

    const sourceFiles = this.findMdFiles(sourcesDir);
    const pageFiles = this.findMdFiles(pagesDir);

    // 检查 pages/ 中的页面
    const pageNames = new Set<string>();
    const backlinks = new Map<string, string[]>();

    for (const filePath of pageFiles) {
      const relPath = path.relative(wikiPath, filePath);
      const pageName = relPath.replace(/\.md$/, '');
      pageNames.add(pageName);

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
          // 解析 frontmatter 检查 schema 合规性
          const frontmatter = this.parseFrontmatter(content);
          if (frontmatter) {
            // 检查 tags 是否在 schema 中
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

        // 提取链接
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(content)) !== null) {
          const linkTarget = match[2].replace(/\.md$/, '').replace(/^\.\//, '');
          if (!backlinks.has(linkTarget)) {
            backlinks.set(linkTarget, []);
          }
          backlinks.get(linkTarget)!.push(relPath);

          // 检查断裂链接
          if (!linkTarget.startsWith('http') && !linkTarget.startsWith('#') && !linkTarget.startsWith('/')) {
            if (!pageNames.has(linkTarget)) {
              issues.push({
                type: 'broken_link',
                file: relPath,
                description: `断裂链接: "${linkTarget}" 目标页面不存在`,
              });
            }
          }
        }
      } catch { /* skip unreadable */ }
    }

    // 检查孤立页面
    for (const filePath of pageFiles) {
      const relPath = path.relative(wikiPath, filePath);
      if (relPath === 'pages/index.md') continue;

      const pageName = relPath.replace(/\.md$/, '');
      const linkedBy = backlinks.get(pageName) || [];
      if (linkedBy.length === 0) {
        issues.push({
          type: 'orphan',
          file: relPath,
          description: '孤立页面：未被任何其他页面链接',
        });
      }
    }

    // 检查未编译的原始资料（sources/ 中有但 pages/ 中无对应内容）
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
      // 跳过 .gitkeep
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

    const healthy = issues.length === 0;

    return {
      healthy,
      issues,
      totalSourceFiles: sourceFiles.filter(f => !f.endsWith('.gitkeep')).length,
      totalPages: pageFiles.length,
      summary: healthy
        ? `Wiki 健康状态良好（${sourceFiles.length} 个原始资料，${pageFiles.length} 个页面）`
        : `发现 ${issues.length} 个问题：` +
          issues.filter(i => i.type === 'orphan').length + ' 个孤立页面, ' +
          issues.filter(i => i.type === 'broken_link').length + ' 个断裂链接, ' +
          issues.filter(i => i.type === 'missing_frontmatter').length + ' 个缺少 frontmatter, ' +
          issues.filter(i => i.type === 'schema_mismatch').length + ' 个 Schema 不匹配, ' +
          issues.filter(i => i.type === 'uncompiled_source').length + ' 个未编译资料',
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
