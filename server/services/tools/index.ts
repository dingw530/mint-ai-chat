/**
 * 工具系统 - 导出所有工具和基础设施
 */

// 基础设施
export { BaseTool } from './BaseTool.js';
export type { ToolContext, ValidationResult, PermissionResult, ToolResult } from './BaseTool.js';
export { ToolRegistry, toolRegistry } from './ToolRegistry.js';
export { ToolExecutor, toolExecutor } from './ToolExecutor.js';
export type { ExecutionOptions, ExecutionResult } from './ToolExecutor.js';

// 具体工具
export { WeatherTool } from './WeatherTool.js';
export { HttpFetchTool } from './HttpFetchTool.js';
export { SkillTool } from './SkillTool.js';
export { BashTool } from './BashTool.js';
export { InvokeAgentTool } from './InvokeAgentTool.js';
export { ReadFileTool } from './ReadFileTool.js';
export { WriteFileTool } from './WriteFileTool.js';
export { ListFilesTool } from './ListFilesTool.js';
export { WikiIngestTool } from './WikiIngestTool.js';
export { WikiQueryTool } from './WikiQueryTool.js';
export { WikiLintTool } from './WikiLintTool.js';
export { WikiSearchTool } from './WikiSearchTool.js';
export { KnowledgeGraphTool } from './KnowledgeGraphTool.js';

// 工具实例（用于注册）
import { WeatherTool } from './WeatherTool.js';
import { HttpFetchTool } from './HttpFetchTool.js';
import { SkillTool } from './SkillTool.js';
import { BashTool } from './BashTool.js';
import { InvokeAgentTool } from './InvokeAgentTool.js';
import { ReadFileTool } from './ReadFileTool.js';
import { WriteFileTool } from './WriteFileTool.js';
import { WikiIngestTool } from './WikiIngestTool.js';
import { WikiLintTool } from './WikiLintTool.js';
import { WikiSearchTool } from './WikiSearchTool.js';
import { KnowledgeGraphTool } from './KnowledgeGraphTool.js';
import { toolRegistry } from './ToolRegistry.js';

// 内置工具列表
export const builtinTools = [
  new WeatherTool(),
  new HttpFetchTool(),
  new SkillTool(),
  new BashTool(),
  new InvokeAgentTool(),
  new ReadFileTool(),
  new WriteFileTool(),
  new WikiIngestTool(),
  new WikiLintTool(),
  new WikiSearchTool(),
  new KnowledgeGraphTool(),
];

/**
 * 初始化工具系统
 * 注册所有内置工具
 */
export function initializeTools(): void {
  toolRegistry.registerAll(builtinTools);
  console.log(`[Tools] Initialized ${builtinTools.length} builtin tools`);
}

// 自动初始化
initializeTools();
