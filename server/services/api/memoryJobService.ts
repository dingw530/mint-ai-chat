import * as messageRepo from '../../repositories/messageRepository.js';
import * as memoryJobRepo from '../../repositories/memoryJobRepository.js';
import * as settingsService from './settingsService.js';
import * as memoryService from './memoryService.js';

let scheduled = false;
let running = false;

/** 将会话加入持久化记忆处理队列，并触发当前进程的 worker。 */
export function enqueueMemoryProcessing(conversationId: string): void {
  memoryJobRepo.enqueue(conversationId);
  scheduleDrain();
}

/** 恢复服务重启前遗留的任务，并启动记忆 worker。 */
export function startMemoryProcessing(): void {
  memoryJobRepo.recoverProcessing();
  scheduleDrain();
}

function scheduleDrain(): void {
  if (scheduled || running) return;
  scheduled = true;
  setImmediate(() => {
    scheduled = false;
    void drain();
  });
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    let job = memoryJobRepo.claimNext();
    while (job) {
      try {
        const messages = messageRepo.findByConversationId(job.conversationId);
        const userContent = messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
        const assistantContent = messages.filter((message) => message.role === 'assistant').map((message) => message.content).join('\n');
        if (userContent && assistantContent) {
          const succeeded = await memoryService.performExtraction(settingsService.getAiSettings(), userContent, assistantContent, job.conversationId);
          if (!succeeded) throw new Error('记忆提取失败');
        }
        memoryJobRepo.complete(job.id);
      } catch (error) {
        memoryJobRepo.fail(job.id, error instanceof Error ? error.message : String(error));
      }
      job = memoryJobRepo.claimNext();
    }
  } finally {
    running = false;
  }
}
