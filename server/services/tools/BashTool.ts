import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './BaseTool.js';
import type { ToolContext, PermissionResult } from './BaseTool.js';
import { checkCommand } from '../api/bashSecurityService.js';
import * as path from 'path';
import { getWikiPath } from '../utils/pathSecurity.js';
import { getMintWorkspacePath } from '../utils/mintWorkspace.js';

const execAsync = promisify(exec);

// ── 输入 Schema ──

const BashInputSchema = z.object({
  command: z.string().describe('要执行的命令'),
  cwd: z.string().optional().describe('可选工作目录，必须位于 Runtime 允许的目录边界内'),
  timeout: z.coerce.number().int().min(1000).max(120000).optional().default(30000).describe('超时时间（毫秒），默认 30000'),
});

type BashInput = z.infer<typeof BashInputSchema>;

// ── 输出类型 ──

interface BashOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
}

// ── Bash 工具 ──

export class BashTool extends BaseTool<BashInput, BashOutput> {
  readonly name = 'bash';
  readonly description = '执行 shell 命令并返回输出结果。适合运行脚本、代码编译等场景。注意：Wiki 知识库文件必须使用 wiki_search 工具读取，禁止通过 bash 读取。';
  readonly inputSchema = BashInputSchema;

  isEnabled(): boolean {
    return process.env.AI_CHAT_BASH_ENABLED !== 'false';
  }

  isReadOnly(): boolean {
    return false;
  }

  isIdempotent(): boolean {
    return false;
  }

  checkPermission(input: BashInput, _context: ToolContext): PermissionResult {
    const result = checkCommand(input.command);
    if (!result.allowed) {
      return { allowed: false, reason: result.reason };
    }

    // 拦截对 Wiki 目录的读取操作（必须使用 wiki_search）
    const wikiPath = getWikiPath();
    if (wikiPath) {
      const cmd = input.command;
      const wikiDirName = path.basename(wikiPath);
      // 读取命令匹配
      const readCmdRe = /^(cat|head|tail|less|more|grep|rg|find|ls|wc|diff|sort|uniq|awk|sed|xargs|cd)/;
      // 检测命令是否访问 Wiki 目录：包含绝对路径、包含目录名、或 cd 进 wiki 目录
      const accessesWiki = cmd.includes(wikiPath)
        || new RegExp(`\\b${wikiDirName}\\b`).test(cmd)
        || (cmd.trim().startsWith('cd ') && cmd.includes(wikiDirName));
      if (readCmdRe.test(cmd.trim()) && accessesWiki) {
        return { allowed: false, reason: 'Wiki 知识库文件必须使用 wiki_search 工具读取，禁止使用 bash' };
      }
    }

    return { allowed: true };
  }

  async execute(input: BashInput, context: ToolContext): Promise<BashOutput> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(input.command, {
        cwd: input.cwd ?? getMintWorkspacePath(),
        timeout: input.timeout,
        maxBuffer: 1024 * 1024,
        shell: '/bin/bash',
        signal: context.signal,
      });

      return {
        stdout: stdout.length > 10000 ? stdout.substring(0, 10000) + '\n...(output truncated)' : stdout,
        stderr: stderr.length > 5000 ? stderr.substring(0, 5000) + '\n...(stderr truncated)' : stderr,
        exitCode: 0,
        duration: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const details = typeof err === 'object' && err !== null ? err as {
        code?: string | number;
        stdout?: string;
        stderr?: string;
        message?: string;
      } : {};

      if (details.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        return {
          stdout: details.stdout?.substring(0, 10000) || '',
          stderr: details.stderr?.substring(0, 5000) || '',
          exitCode: null,
          duration,
        };
      }

      return {
        stdout: details.stdout || '',
        stderr: details.stderr || details.message || String(err),
        exitCode: typeof details.code === 'number' ? details.code : null,
        duration,
      };
    }
  }
}
