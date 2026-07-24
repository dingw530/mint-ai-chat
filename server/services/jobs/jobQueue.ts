/**
 * 任务队列适配接口。业务层只依赖该接口，未来可替换为 Redis/BullMQ 实现。
 */
export interface JobQueue {
  start(worker: (jobId: string) => Promise<void>): void;
  enqueue(jobId: string): void;
  stop(): void;
}

/**
 * 当前阶段的单进程队列实现。任务事实由 SQLite 保存，队列只负责触发 worker。
 */
export class InProcessJobQueue implements JobQueue {
  private worker?: (jobId: string) => Promise<void>;
  private running = false;
  private scheduled = false;

  start(worker: (jobId: string) => Promise<void>): void {
    this.worker = worker;
    this.running = true;
  }

  enqueue(_jobId: string): void {
    if (!this.running || this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      void this.drain();
    });
  }

  stop(): void {
    this.running = false;
    this.worker = undefined;
  }

  private async drain(): Promise<void> {
    if (!this.running || !this.worker) return;
    // JobStore.claimNext() 在 worker 内部完成原子领取，后续 adapter 可替换领取策略。
    await this.worker('next');
  }
}
