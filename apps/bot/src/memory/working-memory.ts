import { loadConfig } from "@/lib/config"
import { getRedis } from "@/lib/redis"
import { estimateJsonTokens } from "@/lib/token-counter"
import {
  ambientKey,
  sessionActiveKey,
  sessionChatKey,
  sessionChatLockKey,
  trackedMessageIndexKey,
} from "@/memory/keys"
import { withLock } from "@/memory/locks"
import {
  deserializeAmbientMessage,
  deserializeChatWindow,
  deserializeSession,
  serializeAmbientMessage,
  serializeChatWindow,
  serializeSession,
} from "@/memory/serde"
import type {
  ActiveChatWindow,
  AmbientMessage,
  ChatMessage,
  OrderSession,
  Platform,
  TrackedMessage,
} from "@supper-bot/types"

function sessionTtlSeconds(): number {
  return loadConfig().SESSION_TIMEOUT_MINUTES * 60
}

function ambientCapacity(): number {
  return loadConfig().AMBIENT_BUFFER_SIZE
}

function ambientTtlSeconds(): number {
  return loadConfig().AMBIENT_BUFFER_TTL_MINUTES * 60
}

// ── Sessions ──────────────────────────────────────────────────────────

export async function getSession(
  platform: Platform,
  groupId: string,
): Promise<OrderSession | null> {
  const raw = await getRedis().get(sessionActiveKey(platform, groupId))
  return raw ? deserializeSession(raw) : null
}

export async function setSession(session: OrderSession): Promise<void> {
  const redis = getRedis()
  const key = sessionActiveKey(session.platform, session.groupId)
  await redis.set(key, serializeSession(session), "EX", sessionTtlSeconds())
}

export async function deleteSession(platform: Platform, groupId: string): Promise<void> {
  const session = await getSession(platform, groupId)
  const redis = getRedis()
  const pipeline = redis.multi()
  pipeline.del(sessionActiveKey(platform, groupId))
  if (session) {
    pipeline.del(sessionChatKey(session.sessionId))
    for (const tm of Object.values(session.trackedMessages)) {
      pipeline.del(trackedMessageIndexKey(platform, tm.messageId))
    }
  }
  await pipeline.exec()
}

// ── Chat windows ──────────────────────────────────────────────────────

export async function getChatWindow(sessionId: string): Promise<ActiveChatWindow | null> {
  const raw = await getRedis().get(sessionChatKey(sessionId))
  return raw ? deserializeChatWindow(raw) : null
}

export async function replaceChatWindow(window: ActiveChatWindow): Promise<void> {
  await getRedis().set(
    sessionChatKey(window.sessionId),
    serializeChatWindow(window),
    "EX",
    sessionTtlSeconds(),
  )
}

export async function appendMessage(
  sessionId: string,
  groupId: string,
  message: ChatMessage,
): Promise<ActiveChatWindow> {
  // Lock the read-modify-write so concurrent appends (cross-instance, or
  // the orchestrator + session manager racing) don't lose messages.
  return withLock(sessionChatLockKey(sessionId), async () => {
    const existing =
      (await getChatWindow(sessionId)) ??
      ({
        sessionId,
        groupId,
        messages: [],
        tokenEstimate: 0,
        compactionHistory: [],
        summaries: [],
      } satisfies ActiveChatWindow)
    existing.messages.push(message)
    existing.tokenEstimate += estimateJsonTokens(message)
    await replaceChatWindow(existing)
    return existing
  })
}

// ── Ambient buffer ────────────────────────────────────────────────────

export async function pushAmbientMessage(
  platform: Platform,
  groupId: string,
  msg: AmbientMessage,
): Promise<void> {
  const redis = getRedis()
  const key = ambientKey(platform, groupId)
  const cap = ambientCapacity()
  const pipeline = redis.multi()
  pipeline.lpush(key, serializeAmbientMessage(msg))
  pipeline.ltrim(key, 0, cap - 1)
  pipeline.expire(key, ambientTtlSeconds())
  await pipeline.exec()
}

export async function getAmbientBuffer(
  platform: Platform,
  groupId: string,
): Promise<AmbientMessage[]> {
  const raws = await getRedis().lrange(ambientKey(platform, groupId), 0, -1)
  // LPUSH stores newest first; reverse so callers receive chronological order.
  return raws.map(deserializeAmbientMessage).reverse()
}

// ── Tracked messages ──────────────────────────────────────────────────

export async function addTrackedMessage(
  session: OrderSession,
  tracked: TrackedMessage,
): Promise<OrderSession> {
  session.trackedMessages[tracked.messageId] = tracked
  session.updatedAt = new Date()
  const redis = getRedis()
  const ttl = sessionTtlSeconds()
  const pipeline = redis.multi()
  pipeline.set(
    sessionActiveKey(session.platform, session.groupId),
    serializeSession(session),
    "EX",
    ttl,
  )
  pipeline.set(
    trackedMessageIndexKey(session.platform, tracked.messageId),
    JSON.stringify({ sessionId: session.sessionId, groupId: session.groupId }),
    "EX",
    ttl,
  )
  await pipeline.exec()
  return session
}

export interface TrackedLookup {
  sessionId: string
  groupId: string
}

export async function lookupTrackedMessage(
  platform: Platform,
  messageId: string,
): Promise<TrackedLookup | null> {
  const raw = await getRedis().get(trackedMessageIndexKey(platform, messageId))
  return raw ? (JSON.parse(raw) as TrackedLookup) : null
}
