/**
 * 天气工具 - 基于 BaseTool 的具体实现
 */

import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import * as qweather from '../qweatherService.js';

// ── 输入 Schema ──

const WeatherInputSchema = z.object({
  city: z.string().describe('城市中文名称，如 北京、上海、广州'),
  days: z.coerce.number().int().min(1).max(7).optional().default(3).describe('预报天数，默认3天'),
});

type WeatherInput = z.infer<typeof WeatherInputSchema>;

// ── 输出类型 ──

interface WeatherOutput {
  city: string;
  forecast: unknown[];
}

// ── 天气工具 ──

export class WeatherTool extends BaseTool<WeatherInput, WeatherOutput> {
  readonly name = 'get_weather_forecast';
  readonly description = '获取指定城市的天气预报，支持3天和7天预报';
  readonly inputSchema = WeatherInputSchema;

  /**
   * 检查工具是否启用
   * 需要环境变量配置
   */
  isEnabled(): boolean {
    return !!(
      process.env.QWEATHER_PROJECT_ID &&
      process.env.QWEATHER_KEY_ID &&
      process.env.QWEATHER_PRIVATE_KEY
    );
  }

  /**
   * 天气查询是只读操作
   */
  isReadOnly(): boolean {
    return true;
  }

  /**
   * 天气查询是幂等的
   */
  isIdempotent(): boolean {
    return true;
  }

  /**
   * 执行天气查询
   */
  async execute(input: WeatherInput, _context: ToolContext): Promise<WeatherOutput> {
    const { city, days } = input;

    // 获取城市位置
    const locations = await qweather.getCityLocation(city);
    if (!locations || locations.length === 0) {
      throw new Error(`未找到城市: ${city}`);
    }

    // 获取天气预报
    const forecast = await qweather.getWeatherForecast(locations[0].id, days);

    return {
      city,
      forecast: Array.isArray(forecast) ? forecast : [forecast],
    };
  }
}
