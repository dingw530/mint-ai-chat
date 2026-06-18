import * as fs from 'fs';
import * as path from 'path';
import * as settingsService from './settingsService.js';

interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileTreeNode[];
}

interface WikiListResponse {
  tree: FileTreeNode[];
  total: number;
}

interface WikiReadResponse {
  content: string;
  path: string;
  name: string;
  size: number;
}

function getRootPath(): string {
  const settings = settingsService.get();
  if (!settings.wikiPath) throw new Error('Wiki 路径未配置');
  return settings.wikiPath;
}

function isPathSafe(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, target);
  return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
}

export function listWiki(): WikiListResponse {
  const rootPath = getRootPath();
  if (!fs.existsSync(rootPath)) {
    return { tree: [], total: 0 };
  }
  const tree = buildFileTree(rootPath, rootPath);
  const total = countFiles(tree);
  return { tree, total };
}

export function readWiki(filePath: string): WikiReadResponse {
  if (!filePath) throw new Error('缺少 path 参数');

  const rootPath = getRootPath();
  if (!isPathSafe(rootPath, filePath)) throw new Error('路径穿越被拒绝');

  const resolvedPath = path.resolve(rootPath, filePath);
  if (!fs.existsSync(resolvedPath)) throw new Error('文件不存在');

  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) throw new Error('路径是目录，请指定文件');

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  return {
    content,
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
  };
}

function buildFileTree(rootDir: string, currentDir: string): FileTreeNode[] {
  const entries: FileTreeNode[] = [];
  const items = fs.readdirSync(currentDir);

  for (const item of items.sort()) {
    const fullPath = path.join(currentDir, item);
    const stat = fs.statSync(fullPath);
    const relativePath = path.relative(rootDir, fullPath);

    if (stat.isDirectory()) {
      const children = buildFileTree(rootDir, fullPath);
      entries.push({ name: item, type: 'directory', path: relativePath, children });
    } else if ((item.endsWith('.md') || item === '_schema.json') && item !== '.gitkeep') {
      entries.push({ name: item, type: 'file', path: relativePath });
    }
  }
  return entries;
}

function countFiles(tree: FileTreeNode[]): number {
  let count = 0;
  for (const node of tree) {
    if (node.type === 'file') count++;
    if (node.children) count += countFiles(node.children);
  }
  return count;
}
