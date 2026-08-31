// Contrato único de LLM. Claude e Qwen implementam a MESMA interface, então o
// loop de tool use (llm/loop.ts) e os agentes não sabem qual modelo está atrás.
//
// Por que não usar o formato da Anthropic direto: o Qwen fala OpenAI-compatible
// (tool_calls no assistant + role "tool" nas respostas). Traduzir nas pontas é
// mais barato do que espalhar `if (provider === ...)` pelo código dos agentes.

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema do input (object). */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;
  /** Conteúdo textual devolvido ao modelo (JSON stringificado, normalmente). */
  content: string;
  isError?: boolean;
}

export type AgentMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface LlmTurn {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: { inputTokens: number; outputTokens: number };
  /** Identificação do modelo que de fato respondeu (auditoria/eventos). */
  model: string;
}

export interface CompleteParams {
  system: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
}

export interface LlmProvider {
  /** "claude" | "qwen" — usado em log e nos eventos. */
  readonly kind: string;
  readonly model: string;
  complete(params: CompleteParams): Promise<LlmTurn>;
}
