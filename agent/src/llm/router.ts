// Roteador de modelo. Cada agente declara sua preferência (persona.brain) e o
// roteador resolve para um provider real, com fallback explícito:
//   - pediu qwen mas QWEN_API_KEY/QWEN_BASE_URL faltam  → cai para Claude
//   - pediu claude mas ANTHROPIC_API_KEY falta          → erro (não há fallback
//     silencioso para um modelo pior numa conversa sua)
// Override por agente via env: AGENT_BRAIN_<ID> = claude | qwen.

import type { AgentEnv } from "../config.ts";
import type { LlmProvider } from "./types.ts";
import { createClaudeProvider } from "./claude.ts";
import { createQwenProvider } from "./qwen.ts";

export type Brain = "claude" | "qwen";

export interface RouteDecision {
  brain: Brain;
  reason: "persona" | "env_override" | "qwen_unavailable";
}

export function decideBrain(
  agentId: string,
  personaBrain: Brain,
  env: AgentEnv,
  rawEnv: Record<string, string | undefined> = process.env,
): RouteDecision {
  const override = (rawEnv[`AGENT_BRAIN_${agentId.toUpperCase()}`] || "").trim().toLowerCase();
  let brain: Brain = personaBrain;
  let reason: RouteDecision["reason"] = "persona";
  if (override === "claude" || override === "qwen") {
    brain = override;
    reason = "env_override";
  }
  if (brain === "qwen" && !(env.qwenApiKey && env.qwenBaseUrl)) {
    return { brain: "claude", reason: "qwen_unavailable" };
  }
  return { brain, reason };
}

export interface ProviderOptions {
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export function createProvider(brain: Brain, env: AgentEnv, opts: ProviderOptions = {}): LlmProvider {
  if (brain === "qwen") {
    if (!env.qwenApiKey || !env.qwenBaseUrl) {
      throw new Error("Qwen selecionado mas QWEN_API_KEY/QWEN_BASE_URL não estão configurados.");
    }
    return createQwenProvider({
      apiKey: env.qwenApiKey,
      baseUrl: env.qwenBaseUrl,
      model: env.qwenModel,
    });
  }
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }
  return createClaudeProvider({
    apiKey: env.anthropicApiKey,
    model: env.claudeModel,
    effort: opts.effort,
  });
}
