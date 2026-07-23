/**
 * 当前时间工具 - 返回执行时服务器的当前日期和时间
 */

import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';

const CurrentTimeInputSchema = z.object({});

interface CurrentTimeOutput {
  iso: string;
  unixTimestamp: number;
  timezone: string;
  localDate: string;
  localTime: string;
  formatted: string;
}

/**
 * 获取服务器执行时的当前日期和时间。
 */
export class CurrentTimeTool extends BaseTool<Record<string, never>, CurrentTimeOutput> {
  readonly name = 'get_current_time';
  readonly description = '获取当前日期和时间。需要判断今天、当前时间或相对日期时必须调用此工具，不要使用模型知识中的日期';
  readonly inputSchema = CurrentTimeInputSchema;

  /**
   * 当前时间查询不会修改任何状态。
   */
  isReadOnly(): boolean {
    return true;
  }

  /**
   * 当前时间会随执行时刻变化，因此不视为幂等。
   */
  isIdempotent(): boolean {
    return false;
  }

  /**
   * 返回执行时服务器的 UTC 与本地时间信息。
   */
  async execute(_input: Record<string, never>, _context: ToolContext): Promise<CurrentTimeOutput> {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

    return {
      iso: now.toISOString(),
      unixTimestamp: now.getTime(),
      timezone,
      localDate: `${values.year}-${values.month}-${values.day}`,
      localTime: `${values.hour}:${values.minute}:${values.second}`,
      formatted: new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: timezone,
      }).format(now),
    };
  }
}
