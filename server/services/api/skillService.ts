import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('skill-service');

// ── 类型定义 ──

export interface Skill {
  name: string;
  description: string;
  content: string;
  filePath: string;
}

// ── 配置 ──

function getSkillsDir(): string {
  return process.env.AI_CHAT_SKILLS_DIR || join(homedir(), '.mint', 'skills');
}

// ── 简易 Frontmatter 解析 ──
// 只解析 --- 包裹的 YAML 块，提取 name 和 description

function parseFrontmatter(content: string): { name: string; description: string; body: string } {
  const lines = content.split('\n');
  if (lines.length < 2 || lines[0].trim() !== '---') {
    return { name: '', description: '', body: content };
  }

  let endIdx = -1;
  const frontLines: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
    frontLines.push(lines[i]);
  }

  if (endIdx === -1) {
    return { name: '', description: '', body: content };
  }

  const body = lines.slice(endIdx + 1).join('\n').trim();
  const frontText = frontLines.join('\n');

  return {
    name: extractField(frontText, 'name'),
    description: extractField(frontText, 'description'),
    body,
  };
}

function extractField(frontmatter: string, key: string): string {
  const regex = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm');
  const match = frontmatter.match(regex);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

// ── 扫描加载 Skill ──

let cachedSkills: Skill[] | null = null;

export async function listSkills(): Promise<Skill[]> {
  if (cachedSkills) return cachedSkills;

  const dir = getSkillsDir();
  if (!existsSync(dir)) {
    log.debug(`Skills directory not found: ${dir}`);
    cachedSkills = [];
    return cachedSkills;
  }

  const skills: Skill[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch (err) {
    log.error(`Failed to read skills directory: ${dir}`, { error: String(err) });
    cachedSkills = [];
    return cachedSkills;
  }

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    let filePath: string | null = null;
    let skillName = '';

    try {
      const entryStat = await stat(entryPath);
      if (entryStat.isFile() && entry.endsWith('.md')) {
        // 单文件格式: translate.md
        filePath = entryPath;
        skillName = entry.replace(/\.md$/, '');
      } else if (entryStat.isDirectory()) {
        // 目录格式: translate/SKILL.md
        const skillMdPath = join(entryPath, 'SKILL.md');
        if (existsSync(skillMdPath)) {
          filePath = skillMdPath;
          skillName = entry;
        }
      }
    } catch {
      continue;
    }

    if (!filePath) continue;

    try {
      const content = await readFile(filePath, 'utf-8');
      const { name, description, body } = parseFrontmatter(content);
      const resolvedName = name || skillName;

      skills.push({
        name: resolvedName,
        description: description || `${resolvedName} skill`,
        content: body,
        filePath,
      });

      log.debug(`Loaded skill: ${resolvedName}`);
    } catch (err) {
      log.error(`Failed to load skill file: ${filePath}`, { error: String(err) });
    }
  }

  cachedSkills = skills;
  log.info(`Loaded ${skills.length} skills from ${dir}`);
  for (const s of skills) {
    console.log(`[skill] ${s.name} - ${s.description} (${s.filePath})`);
  }
  return skills;
}

export async function getSkill(name: string): Promise<Skill | undefined> {
  const skills = await listSkills();
  return skills.find(s => s.name === name);
}

export function clearSkillCache(): void {
  cachedSkills = null;
}
