import { getLogger } from "@/lib/logger"
import type { ArchivedSession, ExtractionResult } from "@supper-bot/types"

/**
 * Post-session memory extraction. Runs asynchronously after a session is
 * archived. Today this is a no-op scaffold — the LLM-driven extraction pass
 * (cheap second model call over the transcript) lands in a follow-up; for
 * now we log the trigger and return an empty result so wiring works.
 */
export async function extractFromSession(session: ArchivedSession): Promise<ExtractionResult> {
  getLogger().debug(
    {
      sessionId: session.sessionId,
      participantCount: session.participants.length,
      status: session.status,
    },
    "extraction-engine: stub run (no LLM pass yet)",
  )
  return { userFacts: [], groupFacts: [], graphUpdates: [] }
}
