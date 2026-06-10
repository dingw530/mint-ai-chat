// ── SSE 输出抽象 ──
// 将 AI 流式输出从 Express Response 解耦，支持单元测试和非 HTTP 场景

import { Response as ExpressResponse } from 'express';

export interface Sink {
  write(data: string): void;
  end(): void;
  get headersSent(): boolean;
  get writableEnded(): boolean;
}

// Express Response 适配：将数据以 SSE data: 格式写入 HTTP 响应
export class ResSink implements Sink {
  private _ended = false;

  constructor(private res: ExpressResponse) {}

  write(data: string): void {
    if (!this._ended && !this.res.writableEnded) {
      this.res.write(`data: ${data}\n\n`);
    }
  }

  end(): void {
    if (!this._ended && !this.res.writableEnded) {
      this.res.write('data: [DONE]\n\n');
      this.res.end();
      this._ended = true;
    }
  }

  get headersSent(): boolean { return this.res.headersSent; }
  get writableEnded(): boolean { return this._ended || this.res.writableEnded; }
}

// 累加型 Sink：将流式数据聚合为完整字符串，不输出到任何地方
export class AccumulatingSink implements Sink {
  private _data = '';
  private _ended = false;

  write(data: string): void {
    this._data += data;
  }

  end(): void {
    this._ended = true;
  }

  get headersSent(): boolean { return false; }
  get writableEnded(): boolean { return this._ended; }
  get data(): string { return this._data; }
}
