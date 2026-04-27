import type { AgentResponse, UnifiedReaction } from "@supper-bot/types"

// TODO: handle confirm/opt-out reactions without invoking the LLM
export async function handleReaction(_event: UnifiedReaction): Promise<AgentResponse | null> {
  return null
}
