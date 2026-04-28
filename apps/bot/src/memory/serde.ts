import type {
  ActiveChatWindow,
  AmbientMessage,
  ChatMessage,
  ChatSummaryBlock,
  GapMarker,
  MemberCart,
  OrderSession,
} from "@supper-bot/types"

const toIso = (d: Date) => d.toISOString()
const fromIso = (s: string) => new Date(s)

type SerializedMember = Omit<MemberCart, "lastActiveAt"> & { lastActiveAt: string }
type SerializedSession = Omit<
  OrderSession,
  "createdAt" | "updatedAt" | "expiresAt" | "closedAt" | "members"
> & {
  createdAt: string
  updatedAt: string
  expiresAt: string
  closedAt?: string
  members: Record<string, SerializedMember>
}

export function serializeSession(s: OrderSession): string {
  const { createdAt, updatedAt, expiresAt, closedAt, members: srcMembers, ...rest } = s
  const members: Record<string, SerializedMember> = {}
  for (const [k, m] of Object.entries(srcMembers)) {
    members[k] = { ...m, lastActiveAt: toIso(m.lastActiveAt) }
  }
  const out: SerializedSession = {
    ...rest,
    members,
    createdAt: toIso(createdAt),
    updatedAt: toIso(updatedAt),
    expiresAt: toIso(expiresAt),
    ...(closedAt ? { closedAt: toIso(closedAt) } : {}),
  }
  return JSON.stringify(out)
}

export function deserializeSession(raw: string): OrderSession {
  const o = JSON.parse(raw) as SerializedSession
  const { createdAt, updatedAt, expiresAt, closedAt, members: srcMembers, ...rest } = o
  const members: Record<string, MemberCart> = {}
  for (const [k, m] of Object.entries(srcMembers)) {
    members[k] = { ...m, lastActiveAt: fromIso(m.lastActiveAt) }
  }
  return {
    ...rest,
    members,
    createdAt: fromIso(createdAt),
    updatedAt: fromIso(updatedAt),
    expiresAt: fromIso(expiresAt),
    ...(closedAt ? { closedAt: fromIso(closedAt) } : {}),
  }
}

type SerializedChatMessage = Omit<ChatMessage, "timestamp"> & { timestamp: string }
type SerializedSummary = Omit<ChatSummaryBlock, "covers" | "preservedMessages"> & {
  covers: { from: string; to: string; messageCount: number }
  preservedMessages: SerializedChatMessage[]
}
type SerializedGap = Omit<GapMarker, "from" | "to"> & { from: string; to: string }
type SerializedWindowItem = SerializedChatMessage | SerializedSummary | SerializedGap

type SerializedWindow = Omit<
  ActiveChatWindow,
  "messages" | "lastCompactedAt" | "compactionHistory" | "summaries"
> & {
  messages: SerializedWindowItem[]
  lastCompactedAt?: string
  compactionHistory: Array<
    Omit<ActiveChatWindow["compactionHistory"][number], "compactedAt"> & {
      compactedAt: string
    }
  >
  summaries: SerializedSummary[]
}

const isSummary = (m: ActiveChatWindow["messages"][number]): m is ChatSummaryBlock =>
  (m as ChatSummaryBlock).type === "summary"
const isGap = (m: ActiveChatWindow["messages"][number]): m is GapMarker =>
  (m as GapMarker).type === "gap"

const serSummary = (s: ChatSummaryBlock): SerializedSummary => ({
  ...s,
  covers: { ...s.covers, from: toIso(s.covers.from), to: toIso(s.covers.to) },
  preservedMessages: s.preservedMessages.map(serMsg),
})
const serMsg = (m: ChatMessage): SerializedChatMessage => ({ ...m, timestamp: toIso(m.timestamp) })
const serGap = (g: GapMarker): SerializedGap => ({ ...g, from: toIso(g.from), to: toIso(g.to) })

const desMsg = (m: SerializedChatMessage): ChatMessage => ({
  ...m,
  timestamp: fromIso(m.timestamp),
})
const desSummary = (s: SerializedSummary): ChatSummaryBlock => ({
  ...s,
  covers: { ...s.covers, from: fromIso(s.covers.from), to: fromIso(s.covers.to) },
  preservedMessages: s.preservedMessages.map(desMsg),
})
const desGap = (g: SerializedGap): GapMarker => ({ ...g, from: fromIso(g.from), to: fromIso(g.to) })

export function serializeChatWindow(w: ActiveChatWindow): string {
  const { messages, lastCompactedAt, compactionHistory, summaries, ...rest } = w
  const out: SerializedWindow = {
    ...rest,
    messages: messages.map((item) =>
      isSummary(item) ? serSummary(item) : isGap(item) ? serGap(item) : serMsg(item),
    ),
    ...(lastCompactedAt ? { lastCompactedAt: toIso(lastCompactedAt) } : {}),
    compactionHistory: compactionHistory.map((c) => {
      const { compactedAt, ...crest } = c
      return { ...crest, compactedAt: toIso(compactedAt) }
    }),
    summaries: summaries.map(serSummary),
  }
  return JSON.stringify(out)
}

export function deserializeChatWindow(raw: string): ActiveChatWindow {
  const o = JSON.parse(raw) as SerializedWindow
  const { messages, lastCompactedAt, compactionHistory, summaries, ...rest } = o
  return {
    ...rest,
    messages: messages.map((item) => {
      if ((item as SerializedSummary).type === "summary")
        return desSummary(item as SerializedSummary)
      if ((item as SerializedGap).type === "gap") return desGap(item as SerializedGap)
      return desMsg(item as SerializedChatMessage)
    }),
    ...(lastCompactedAt ? { lastCompactedAt: fromIso(lastCompactedAt) } : {}),
    compactionHistory: compactionHistory.map((c) => {
      const { compactedAt, ...crest } = c
      return { ...crest, compactedAt: fromIso(compactedAt) }
    }),
    summaries: summaries.map(desSummary),
  }
}

type SerializedAmbient = Omit<AmbientMessage, "timestamp"> & { timestamp: string }

export function serializeAmbientMessage(m: AmbientMessage): string {
  const out: SerializedAmbient = { ...m, timestamp: toIso(m.timestamp) }
  return JSON.stringify(out)
}

export function deserializeAmbientMessage(raw: string): AmbientMessage {
  const o = JSON.parse(raw) as SerializedAmbient
  return { ...o, timestamp: fromIso(o.timestamp) }
}
