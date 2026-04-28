import { KnownReactionMappings } from "@/memory/constants"
import { getSession, lookupTrackedMessage } from "@/memory/working-memory"
import { allActiveMembersConfirmed, confirmMember, optOutMember } from "@/session/manager"
import type { ReactionIntent, UnifiedReaction } from "@supper-bot/types"

export interface ReactionResolution {
  intent: ReactionIntent
  sessionId?: string
  groupId?: string
  trackedIntent?: "voting_summary" | "dish_suggestion" | "order_summary" | "general"
  stateChanged: boolean
  shouldTriggerPlacement: boolean
}

const NO_OP: ReactionResolution = {
  intent: "unknown",
  stateChanged: false,
  shouldTriggerPlacement: false,
}

export function resolveEmoji(emoji: string): ReactionIntent {
  const normalized = emoji.replace(/:/g, "")
  if (KnownReactionMappings.CONFIRM.includes(normalized as never)) return "confirm_order"
  if (KnownReactionMappings.OPT_OUT.includes(normalized as never)) return "opt_out"
  if (KnownReactionMappings.UPVOTE.includes(normalized as never)) return "upvote_dish"
  if (KnownReactionMappings.DOWNVOTE.includes(normalized as never)) return "downvote_dish"
  return "unknown"
}

export async function handleReaction(event: UnifiedReaction): Promise<ReactionResolution> {
  const intent = resolveEmoji(event.emoji)
  if (intent === "unknown") return NO_OP

  const tracked = await lookupTrackedMessage(event.platform, event.targetMessageId)
  if (!tracked) return { ...NO_OP, intent }

  const session = await getSession(event.platform, tracked.groupId)
  if (!session) return { ...NO_OP, intent, sessionId: tracked.sessionId, groupId: tracked.groupId }
  const trackedMsg = session.trackedMessages[event.targetMessageId]
  const trackedIntent = trackedMsg?.intent

  // Removed reactions clear the corresponding state. We only act on adds for now;
  // a future pass can implement undo on `removed`.
  if (event.action === "removed") {
    return {
      intent,
      sessionId: session.sessionId,
      groupId: session.groupId,
      ...(trackedIntent ? { trackedIntent } : {}),
      stateChanged: false,
      shouldTriggerPlacement: false,
    }
  }

  let stateChanged = false
  let shouldTriggerPlacement = false

  if (trackedIntent === "voting_summary" || trackedIntent === "order_summary") {
    if (intent === "confirm_order") {
      const updated = await confirmMember(
        event.platform,
        session.groupId,
        event.userId,
        event.displayName,
      )
      stateChanged = true
      if (updated.state === "voting" && allActiveMembersConfirmed(updated)) {
        shouldTriggerPlacement = true
      }
    } else if (intent === "opt_out") {
      await optOutMember(event.platform, session.groupId, event.userId, event.displayName)
      stateChanged = true
    }
  }
  // Dish upvotes/downvotes are recorded by the orchestrator/memory layer later;
  // handler simply surfaces the intent.

  return {
    intent,
    sessionId: session.sessionId,
    groupId: session.groupId,
    ...(trackedIntent ? { trackedIntent } : {}),
    stateChanged,
    shouldTriggerPlacement,
  }
}
