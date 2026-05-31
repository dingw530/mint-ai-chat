// ── 统一日志模块 ──
// 提供结构化 JSON 日志输出到 stdout，不引入外部依赖

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;     // ISO 8601, 毫秒精度
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

export class Logger {
  constructor(private module: string) {}

  private write(entry: LogEntry): void {
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.write({ timestamp: new Date().toISOString(), level: 'debug', module: this.module, message, data });
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write({ timestamp: new Date().toISOString(), level: 'info', module: this.module, message, data });
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write({ timestamp: new Date().toISOString(), level: 'warn', module: this.module, message, data });
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.write({ timestamp: new Date().toISOString(), level: 'error', module: this.module, message, data });
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}
