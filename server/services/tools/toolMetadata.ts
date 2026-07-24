/** 工具来源、风险和副作用元数据。 */
export type ToolSource = 'builtin' | 'mcp';
export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ToolSideEffect = 'none' | 'filesystem' | 'network' | 'external';

export interface ToolMetadata {
  source: ToolSource;
  serverName?: string;
  riskLevel: ToolRiskLevel;
  sideEffect: ToolSideEffect;
  requiresApproval?: boolean;
}

export type ToolPolicyDecision =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'approval_required'; reason: string };
