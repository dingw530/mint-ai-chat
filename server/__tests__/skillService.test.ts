import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockFiles: Record<string, string> = {};
const mockExists: Record<string, boolean> = {};

vi.mock('fs/promises', () => ({
  readdir: vi.fn(async (dir: string) => {
    const keys = Object.keys(mockFiles)
      .map(k => k.replace(/^.*[\\/]/, ''))
      .filter(k => k !== '.gitkeep');
    return keys;
  }),
  readFile: vi.fn(async (path: string) => mockFiles[path] || ''),
  stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false })),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => {
    if (path in mockExists) return mockExists[path];
    return true;
  }),
}));

import * as skillService from '../services/api/skillService.js';

describe('skillService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockFiles).forEach(k => delete mockFiles[k]);
    Object.keys(mockExists).forEach(k => delete mockExists[k]);
    skillService.clearSkillCache();
  });

  describe('listSkills', () => {
    it('returns empty when skills dir not exists', async () => {
      mockExists['/Users/wangding/.mint/skills'] = false;
      const skills = await skillService.listSkills();
      expect(skills).toEqual([]);
    });

    it('returns skills with frontmatter', async () => {
      mockFiles['/Users/wangding/.mint/skills/translate.md'] = `---
name: 翻译
description: 翻译技能
---
# 翻译助手
你是一个专业翻译。`;
      mockExists['/Users/wangding/.mint/skills'] = true;

      const skills = await skillService.listSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('翻译');
      expect(skills[0].description).toBe('翻译技能');
      expect(skills[0].content).toContain('翻译助手');
    });

    it('handles skills without frontmatter', async () => {
      mockFiles['/Users/wangding/.mint/skills/hello.md'] = '# Hello World';
      mockExists['/Users/wangding/.mint/skills'] = true;

      const skills = await skillService.listSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('hello');
      expect(skills[0].content).toBe('# Hello World');
    });

    it('handles skill with incomplete frontmatter', async () => {
      mockFiles['/Users/wangding/.mint/skills/test.md'] = '---\nname: Test\n---\nContent body';
      mockExists['/Users/wangding/.mint/skills'] = true;

      const skills = await skillService.listSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('Test');
      expect(skills[0].description).toBe('Test skill'); // fallback to name-based default
      expect(skills[0].content).toBe('Content body');
    });
  });

  describe('getSkill', () => {
    it('returns a skill by name', async () => {
      mockFiles['/Users/wangding/.mint/skills/code-review.md'] = `---
name: code-review
description: Code review skill
---
Review the code`;
      mockExists['/Users/wangding/.mint/skills'] = true;

      const skill = await skillService.getSkill('code-review');
      expect(skill).toBeDefined();
      expect(skill!.description).toBe('Code review skill');
    });

    it('returns undefined for non-existent skill', async () => {
      mockExists['/Users/wangding/.mint/skills'] = false;
      const skill = await skillService.getSkill('nonexistent');
      expect(skill).toBeUndefined();
    });
  });

  describe('clearSkillCache', () => {
    it('forces reload on next list call', async () => {
      mockExists['/Users/wangding/.mint/skills'] = false;
      skillService.clearSkillCache();
      const skills = await skillService.listSkills();
      expect(skills).toEqual([]);
    });
  });
});
