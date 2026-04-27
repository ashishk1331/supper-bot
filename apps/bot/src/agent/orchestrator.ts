import type { AgentResponse, UnifiedEvent } from "@supper-bot/types"

// TODO: per-message processing flow (load context -> call LLM -> tool loop -> respond)
export async function processEvent(_event: UnifiedEvent): Promise<AgentResponse | null> {
  return null
}
