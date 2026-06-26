import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './BaseTool.js';
import type { ToolContext, PermissionResult } from './BaseTool.js';
import { checkCommand } from '../api/bashSecurityService.js';
import { getWikiPath } from '../utils/pathSecurity.js';

const execAsync = promisify(exec);

// ── 输入 Schema ──

const BashInputSchema = z.object({
  command: z.string().describe('要执行的命令'),
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
      const readCmds = /^(cat|head|tail|less|more|grep|rg|find|ls|wc|diff|sort|uniq|awk|sed|xargs)/;
      if (readCmds.test(cmd.trim()) && cmd.includes(wikiPath)) {
        return { allowed: false, reason: 'Wiki 知识库文件必须使用 wiki_search 工具读取，禁止使用 bash' };
      }
    }

    return { allowed: true };
  }

  async execute(input: BashInput, _context: ToolContext): Promise<BashOutput> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(input.command, {
        timeout: input.timeout,
        maxBuffer: 1024 * 1024,
        shell: '/bin/bash',
      });

      return {
        stdout: stdout.length > 10000 ? stdout.substring(0, 10000) + '\n...(output truncated)' : stdout,
        stderr: stderr.length > 5000 ? stderr.substring(0, 5000) + '\n...(stderr truncated)' : stderr,
        exitCode: 0,
        duration: Date.now() - startTime,
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;

      if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        return {
          stdout: err.stdout?.substring(0, 10000) || '',
          stderr: err.stderr?.substring(0, 5000) || '',
          exitCode: null,
          duration,
        };
      }

      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.code || null,
        duration,
      };
    }
  }
}
