import { ToolCall, ToolDefinition } from '../types.js';
import { mcpService } from './api/mcpService.js';
import * as agentRepo from '../repositories/agentRepository.js';
import { toolRegistry as newToolRegistry, toolExecutor } from './tools/index.js';

// 获取 Agent 可用的工具定义列表
export async function getAllToolDefinitions(agentId?: string): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];

  // 全局工具，所有 Agent 可用
  const globalToolNames = ['http_fetch', 'invoke_skill', 'bash', 'invoke_agent', 'write_file', 'wiki_ingest', 'wiki_lint', 'wiki_search'];
  for (const name of globalToolNames) {
    const def = getToolDefinitionSafe(name);
    if (def) tools.push(def);
  }

  // general 助手仅使用全局工具
  if (!agentId || agentId === 'general') return tools;

  // weather Agent：追加天气工具
  if (agentId === 'weather') {
    const weatherDef = getToolDefinitionSafe('get_weather_forecast');
    if (weatherDef) tools.push(weatherDef);
    return tools;
  }

  // 自定义 Agent：根据 mcp_server_ids 加载其全部工具
  const agent = agentRepo.findById(agentId);
  if (!agent || !agent.available) return tools;

  // 加载 Agent 绑定的 MCP Server 的全部工具
  const boundServerIds: string[] = agent.mcpServerIds || [];
  if (boundServerIds.length > 0) {
    const allMcpTools = await mcpService.getTools();
    for (const mcpTool of allMcpTools) {
      const serverName = mcpTool.function.name.split('__')[0];
      if (boundServerIds.includes(serverName)) {
        tools.push(mcpTool);
      }
    }
  }

  return tools;
}

// 根据 tool_call 分发执行对应的工具函数
export async function executeTool(toolCall: ToolCall): Promise<unknown> {
  const { name, arguments: argsStr } = toolCall.function;

  // 1. 优先从新工具系统执行（get_weather_forecast, http_fetch 等内置工具）
  if (newToolRegistry.has(name)) {
    const result = await toolExecutor.executeFromToolCall(toolCall, {
      conversationId: '',
    });
    if (result.success) return result.data;
    return { error: result.error };
  }

  // 2. MCP 工具格式：serverName__toolName
  const separatorIndex = name.indexOf('__');
  if (separatorIndex > 0) {
    const serverName = name.substring(0, separatorIndex);
    const toolName = name.substring(separatorIndex + 2);
    try {
      const args = JSON.parse(argsStr);
      return await mcpService.callTool(serverName, toolName, args);
    } catch (err) {
      return { error: `MCP tool error: ${(err as Error).message}` };
    }
  }

  return { error: `未知工具: ${name}` };
}

/**
 * 安全获取工具定义，工具未注册或未启用时返回 undefined
 */
function getToolDefinitionSafe(name: string): ToolDefinition | undefined {
  const tool = newToolRegistry.get(name);
  if (!tool || !tool.isEnabled()) return undefined;
  return tool.getDefinition();
}
