import type { ActiveChatWindow, CompactionResult } from "@supper-bot/types"

// TODO: 3-layer compaction pipeline (tool trim -> summarise -> truncate)
export async function compact(_window: ActiveChatWindow): Promise<CompactionResult> {
  return {
    strategy: [],
    messagesBefore: 0,
    messagesAfter: 0,
    tokensBefore: 0,
    tokensAfter: 0,
    compactedAt: new Date(),
  }
}
