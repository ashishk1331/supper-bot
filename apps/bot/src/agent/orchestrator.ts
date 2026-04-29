import { getAdapter } from "@/adapters/registry"
import { coalesce } from "@/agent/coalescer"
import { buildSystemPrompt } from "@/agent/prompt-builder"
import { runToolLoop } from "@/agent/tool-loop"
import { newUuid } from "@/lib/id"
import { getLogger } from "@/lib/logger"
import { compactIfNeeded } from "@/memory/compaction-manager"
import { getMemoryService } from "@/memory/service"
import {
  addTrackedMessage,
  appendMessage,
  getAmbientBuffer,
  getChatWindow,
  replaceChatWindow,
} from "@/memory/working-memory"
import {
  archiveSession,
  clearPendingTrackIntent,
  createSession,
  loadSession,
} from "@/session/manager"
import { handleReaction } from "@/session/reaction-handler"
import { TERMINAL_STATES } from "@/session/state-machine"
import type { ToolContext } from "@/tools/registry"
import type {
  AgentResponse,
  ChannelTarget,
  ChatMessage,
  OrderSession,
  Platform,
  UnifiedEvent,
  UnifiedMessage,
  UnifiedReaction,
} from "@supper-bot/types"

export async function handleEvent(event: UnifiedEvent): Promise<void> {
  if (event.type === "reaction") {
    await handleReactionEvent(event)
    return
  }
  await handleMessageEvent(event)
}

async function handleReactionEvent(event: UnifiedReaction): Promise<void> {
  const log = getLogger()
  const result = await handleReaction(event)
  log.debug(
    {
      intent: result.intent,
      sessionId: result.sessionId,
      stateChanged: result.stateChanged,
      shouldTriggerPlacement: result.shouldTriggerPlacement,
    },
    "reaction handled",
  )
}

async function ensureSession(event: UnifiedMessage): Promise<OrderSession> {
  const existing = await loadSession(event.platform, event.groupId)
  if (existing && !TERMINAL_STATES.has(existing.state)) return existing
  return createSession({
    platform: event.platform,
    groupId: event.groupId,
    partyLeader: { userId: event.userId, displayName: event.displayName },
  })
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || (err as { code?: string }).code === "ABORT_ERR")
  )
}

async function handleMessageEvent(event: UnifiedMessage): Promise<void> {
  const log = getLogger()
  const platform: Platform = event.platform
  const adapter = getAdapter(platform)
  if (!adapter) {
    log.warn({ platform }, "no adapter registered; dropping event")
    return
  }

  const session = await ensureSession(event)
  const memoryService = getMemoryService()

  // Append the user message before entering coalesce. A burst of N messages
  // therefore writes N user turns into the chat window; the surviving turn
  // sees them all when it builds the prompt.
  await appendMessage(session.sessionId, session.groupId, {
    id: newUuid(),
    role: "user",
    userId: event.userId,
    displayName: event.displayName,
    content: event.text,
    timestamp: event.timestamp,
  })

  const result = await coalesce(platform, event.groupId, async (signal) => {
    if (signal.aborted) return null

    // Reload session inside coalesce: bursted messages or other workers may
    // have mutated it during the abort+jitter window.
    const freshSession = (await loadSession(platform, event.groupId)) ?? session
    const [userContext, groupContext, ambient, currentWindow] = await Promise.all([
      memoryService.getUserContext(event.userId, event.displayName),
      memoryService.getGroupContext(platform, event.groupId),
      getAmbientBuffer(platform, event.groupId),
      getChatWindow(freshSession.sessionId),
    ])

    if (signal.aborted) return null
    if (!currentWindow) return null

    const systemPrompt = buildSystemPrompt({
      platform,
      session: freshSession,
      userContext,
      groupContext,
      ambient,
      chatWindow: currentWindow,
    })

    const toolContext: ToolContext = {
      session: freshSession,
      userId: event.userId,
      groupId: event.groupId,
      platform,
      memoryService,
    }

    // Replay only user/assistant text turns into the LLM history.
    const history = currentWindow.messages.filter(
      (m): m is ChatMessage =>
        (m as { type?: string }).type === undefined &&
        ((m as { role?: string }).role === "user" || (m as { role?: string }).role === "assistant"),
    )

    let runResult: { text: string; newMessages: ChatMessage[] }
    try {
      runResult = await runToolLoop({
        systemPrompt,
        history,
        userMessage: `${event.displayName}: ${event.text}`,
        toolContext,
        signal,
      })
    } catch (err) {
      if (isAbortError(err) || signal.aborted) {
        log.debug({ groupId: event.groupId }, "tool-loop aborted by newer message")
        return null
      }
      log.error({ err }, "tool-loop failed")
      runResult = {
        text: "Sorry, I hit a snag while processing that. Try again in a moment.",
        newMessages: [],
      }
    }

    if (signal.aborted) return null

    const response: AgentResponse = { text: runResult.text }
    const target: ChannelTarget = {
      platform,
      groupId: event.groupId,
      ...(event.threadId ? { threadId: event.threadId } : {}),
    }
    const sendResult = await adapter.sendMessage(target, response)

    // If the LLM declared a tracking intent on its next response (via
    // session_track_next_response), register the just-sent messageId now so
    // reactions on it (✅/❌) drive the session without another LLM round-trip.
    const postSession = await loadSession(platform, event.groupId)
    if (postSession?.pendingTrackIntent) {
      try {
        await addTrackedMessage(postSession, {
          messageId: sendResult.messageId,
          sessionId: postSession.sessionId,
          intent: postSession.pendingTrackIntent,
        })
        await clearPendingTrackIntent(platform, event.groupId)
      } catch (err) {
        log.error({ err, sessionId: postSession.sessionId }, "tracked-message register failed")
      }
    }

    for (const m of runResult.newMessages) {
      await appendMessage(freshSession.sessionId, freshSession.groupId, m)
    }

    const finalWindow = await getChatWindow(freshSession.sessionId)
    if (finalWindow) {
      const compacted = await compactIfNeeded(finalWindow)
      if (compacted.result) {
        await replaceChatWindow(compacted.window)
        log.debug(
          { sessionId: freshSession.sessionId, strategy: compacted.result.strategy },
          "compacted chat window",
        )
      }
    }

    const after = await loadSession(platform, event.groupId)
    if (after && TERMINAL_STATES.has(after.state)) {
      try {
        await archiveSession(platform, event.groupId)
      } catch (err) {
        log.error({ err }, "archive failed")
      }
    }
    return runResult
  })

  if (!result.ran) {
    log.debug({ groupId: event.groupId, reason: result.reason }, "message coalesced")
  }
}
