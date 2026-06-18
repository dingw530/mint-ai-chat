import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { isPathSafe, getWikiPath } from '../utils/pathSecurity.js';

const ListFilesInputSchema = z.object({
  path: z.string().optional().default('').describe('目录路径（相对 wiki 根目录），默认为根目录'),
  recursive: z.coerce.boolean().optional().default(false).describe('是否递归列出所有文件，默认 false'),
});

type ListFilesInput = z.infer<typeof ListFilesInputSchema>;

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

interface ListFilesOutput {
  entries: FileEntry[];
  total: number;
}

export class ListFilesTool extends BaseTool<ListFilesInput, ListFilesOutput> {
  readonly name = 'list_files';
  readonly description = '列出 Wiki 知识库中的文件和目录。可指定路径和是否递归。';
  readonly inputSchema = ListFilesInputSchema;

  isReadOnly(): boolean {
    return true;
  }

  isConcurrencySafe(): boolean {
    return true;
  }

  async execute(input: ListFilesInput, _context: ToolContext): Promise<ListFilesOutput> {
    const wikiPath = getWikiPath();
    if (!wikiPath) {
      throw new Error('Wiki 路径未配置，请在设置中配置 wikiPath');
    }

    if (!isPathSafe(wikiPath, input.path || '')) {
      throw new Error(`路径穿越被拒绝: ${input.path}`);
    }

    const resolvedPath = path.resolve(wikiPath, input.path || '');

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`目录不存在: ${input.path || '/'}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new Error(`不是目录: ${input.path || '/'}`);
    }

    const entries: FileEntry[] = [];

    if (input.recursive) {
      this.walkDir(resolvedPath, wikiPath, entries);
    } else {
      const items = fs.readdirSync(resolvedPath);
      for (const item of items) {
        const fullPath = path.join(resolvedPath, item);
        const itemStat = fs.statSync(fullPath);
        const relativePath = path.relative(wikiPath, fullPath);
        entries.push({
          name: item,
          type: itemStat.isDirectory() ? 'directory' : 'file',
          path: relativePath,
        });
      }
    }

    return { entries, total: entries.length };
  }

  private walkDir(dirPath: string, basePath: string, entries: FileEntry[]): void {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const itemStat = fs.statSync(fullPath);
      const relativePath = path.relative(basePath, fullPath);

      if (itemStat.isDirectory()) {
        entries.push({ name: item, type: 'directory', path: relativePath });
        this.walkDir(fullPath, basePath, entries);
      } else {
        entries.push({ name: item, type: 'file', path: relativePath });
      }
    }
  }
}
