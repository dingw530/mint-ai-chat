import * as agentRepo from '../repositories/agentRepository.js';
import { Agent } from '../types.js';
import { ORCHESTRATOR_INSTRUCTION } from './orchestratorService.js';

// 检查天气工具所需的环境变量是否已配置
function weatherAvailable(): boolean {
  return !!(
    process.env.QWEATHER_PROJECT_ID &&
    process.env.QWEATHER_KEY_ID &&
    process.env.QWEATHER_PRIVATE_KEY
  );
}

export function list(): Agent[] {
  const agents = agentRepo.findAll();

  // 更新内置 Agent 的动态 availability（如天气工具的可用性取决于环境变量）
  return agents.map(agent => {
    if (agent.id === 'weather') {
      return { ...agent, available: weatherAvailable() };
    }
    return agent;
  });
}

export function findById(id: string): Agent | null {
  const agent = agentRepo.findById(id);
  if (!agent) return null;

  if (agent.id === 'weather') {
    return { ...agent, available: weatherAvailable() };
  }
  // 编排 Agent 自动追加编排指令
  if (agent.type === 'orchestrator') {
    const basePrompt = agent.systemPrompt || '';
    if (!basePrompt.includes(ORCHESTRATOR_INSTRUCTION.trim().slice(0, 20))) {
      return { ...agent, systemPrompt: basePrompt + '\n' + ORCHESTRATOR_INSTRUCTION };
    }
  }
  return agent;
}

export function create(data: {
  id: string;
  name: string;
  description?: string;
  type?: string;
  systemPrompt?: string | null;
  mcpServerIds?: string[];
  available?: boolean;
  triggerKeywords?: string[];
}): Agent {
  return agentRepo.create(data);
}

export function update(id: string, fields: Partial<{
  name: string;
  description: string;
  type: string;
  systemPrompt: string | null;
  mcpServerIds: string[];
  available: boolean;
  errorMessage: string | null;
  triggerKeywords: string[];
}>): Agent | null {
  return agentRepo.update(id, fields);
}

export function remove(id: string): { changes: number } {
  return agentRepo.deleteById(id);
}
