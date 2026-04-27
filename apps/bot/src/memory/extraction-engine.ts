import type { ArchivedSession, ExtractionResult } from "@supper-bot/types"

// TODO: post-session LLM pass to extract MemoryFacts + GraphUpdates
export async function extractFromSession(_session: ArchivedSession): Promise<ExtractionResult> {
  return { userFacts: [], groupFacts: [], graphUpdates: [] }
}
