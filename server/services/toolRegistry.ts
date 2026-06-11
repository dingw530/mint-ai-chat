import * as qweather from './qweatherService.js';
import { ToolCall, ToolDefinition } from '../types.js';
import { mcpService } from './mcpService.js';
import * as agentRepo from '../repositories/agentRepository.js';
import { getInvokeAgentToolDefinition, invokeAgent } from './orchestratorService.js';

// 内置天气工具定义
const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather_forecast',
      description: '获取指定城市的天气预报，支持3天和7天预报',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市中文名称，如 北京、上海、广州',
          },
          days: {
            type: 'integer',
            enum: [3, 7],
            description: '预报天数，默认3天',
          },
        },
        required: ['city'],
      },
    },
  },
];

// 全局内置工具（所有 Agent 可用）
const GLOBAL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'http_fetch',
      description: '发起 HTTP 请求获取外部数据（支持 GET/POST），AI 助手可通过此工具访问公开 API 或网页内容',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '请求 URL',
          },
          method: {
            type: 'string',
            enum: ['GET', 'POST'],
            description: 'HTTP 方法，默认 GET',
          },
          headers: {
            type: 'object',
            description: '自定义请求头，可选',
            additionalProperties: { type: 'string' },
          },
          body: {
            type: 'string',
            description: 'POST 请求体（字符串），可选',
          },
        },
        required: ['url'],
      },
    },
  },
];

// 天气工具是否可用（环境变量已配置）
function weatherConfigured(): boolean {
  return !!(
    process.env.QWEATHER_PROJECT_ID &&
    process.env.QWEATHER_KEY_ID &&
    process.env.QWEATHER_PRIVATE_KEY
  );
}

// 获取 Agent 可用的工具定义列表
export async function getAllToolDefinitions(agentId?: string): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];

  // 全局内置工具（http_fetch 等），所有 Agent 可用
  tools.push(...GLOBAL_TOOLS);

  // general 助手仅使用全局工具
  if (!agentId || agentId === 'general') return tools;

  // weather Agent：追加天气工具
  if (agentId === 'weather') {
    if (weatherConfigured()) {
      tools.push(...BUILTIN_TOOLS);
    }
    return tools;
  }

  // 自定义 Agent：根据 mcp_server_ids 加载其全部工具
  const agent = agentRepo.findById(agentId);
  if (!agent || !agent.available) return tools;

  // 编排 Agent：注册 invoke_agent 工具（不含 MCP 工具）
  if (agent.type === 'orchestrator') {
    tools.push(getInvokeAgentToolDefinition());
    return tools;
  }

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
  const args = JSON.parse(argsStr);

  // 内置工具分发
  switch (name) {
    case 'get_weather_forecast': {
      const locations = await qweather.getCityLocation(args.city);
      if (!locations || locations.length === 0) {
        return { error: `未找到城市: ${args.city}` };
      }
      const forecast = await qweather.getWeatherForecast(locations[0].id, args.days || 3);
      return forecast;
    }
    case 'invoke_agent': {
      return await invokeAgent(args.agent_id, args.task);
    }
    case 'http_fetch': {
      const method = (args.method || 'GET').toUpperCase();
      console.log('[http_fetch]', { url: args.url, method, headers: args.headers, body: args.body ? args.body.substring(0, 200) : undefined });
      const fetchInit: RequestInit = { method };
      if (args.headers) fetchInit.headers = args.headers;
      if (method === 'POST' && args.body) fetchInit.body = args.body;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      fetchInit.signal = controller.signal;

      try {
        const resp = await fetch(args.url, fetchInit);
        clearTimeout(timeout);
        const text = await resp.text();
        return {
          status: resp.status,
          statusText: resp.statusText,
          headers: Object.fromEntries(resp.headers.entries()),
          body: text.length > 10000 ? text.substring(0, 10000) + '\n...(truncated)' : text,
        };
      } catch (err) {
          console.error(err)
        clearTimeout(timeout);
        return { error: `HTTP request failed: ${(err as Error).message}` };
      }
    }
    default: {
      // MCP 工具格式：serverName__toolName
      const separatorIndex = name.indexOf('__');
      if (separatorIndex > 0) {
        const serverName = name.substring(0, separatorIndex);
        const toolName = name.substring(separatorIndex + 2);
        try {
          return await mcpService.callTool(serverName, toolName, args);
        } catch (err) {
          return { error: `MCP tool error: ${(err as Error).message}` };
        }
      }
      return { error: `未知工具: ${name}` };
    }
  }
}
