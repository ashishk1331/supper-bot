import { estimateJsonTokens } from "@/lib/token-counter"
import { DefaultTokenBudget } from "@/memory/constants"
import type {
  ActiveChatWindow,
  ChatMessage,
  ChatSummaryBlock,
  CompactionResult,
  GapMarker,
} from "@supper-bot/types"

export interface ToolTrimRule {
  keepVerbatimFor: number
  afterThat: "summarise" | "drop" | "keep_keys"
  keysToKeep?: string[]
  summariseAs?: string
}

export const DefaultToolTrimRules: Record<string, ToolTrimRule> = {
  swiggy_get_menu: {
    keepVerbatimFor: 2,
    afterThat: "summarise",
    summariseAs: "Menu for {restaurant} fetched ({itemCount} items)",
  },
  swiggy_search_restaurants: {
    keepVerbatimFor: 2,
    afterThat: "keep_keys",
    keysToKeep: ["id", "name", "cuisine", "rating"],
  },
  swiggy_get_dish_details: {
    keepVerbatimFor: 3,
    afterThat: "summarise",
    summariseAs: "{dishName} details fetched (₹{price})",
  },
  session_get_summary: { keepVerbatimFor: 1, afterThat: "drop" },
}

export interface CompactionConfig {
  triggerThreshold: number // 0-1 fraction of availableForHistory
  targetAfterCompaction: number // 0-1 fraction
  alwaysKeepLastN: number
  toolTrimRules: Record<string, ToolTrimRule>
  summarise: SummariseFn
  budget: number // tokens available for history
}

export type SummariseFn = (messages: ChatMessage[]) => Promise<{
  content: string
  keyFacts: string[]
}>

const stubSummariser: SummariseFn = async (messages) => ({
  content: `Summary of ${messages.length} earlier messages.`,
  keyFacts: [],
})

export const DefaultCompactionConfig: CompactionConfig = {
  triggerThreshold: 0.85,
  targetAfterCompaction: 0.5,
  alwaysKeepLastN: 8,
  toolTrimRules: DefaultToolTrimRules,
  summarise: stubSummariser,
  budget: DefaultTokenBudget.availableForHistory,
}

type Entry = ActiveChatWindow["messages"][number]

function isChat(e: Entry): e is ChatMessage {
  return (e as { type?: string }).type === undefined
}

function entryTokens(e: Entry): number {
  return estimateJsonTokens(e)
}

function totalTokens(messages: Entry[]): number {
  let n = 0
  for (const e of messages) n += entryTokens(e)
  return n
}

function applyKeepKeys(payload: unknown, keys: string[]): unknown {
  if (Array.isArray(payload)) return payload.map((p) => applyKeepKeys(p, keys))
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      if (k in (payload as Record<string, unknown>)) {
        out[k] = (payload as Record<string, unknown>)[k]
      }
    }
    return out
  }
  return payload
}

function applyTrimRule(msg: ChatMessage, rule: ToolTrimRule): ChatMessage | null {
  if (rule.afterThat === "drop") return null
  if (rule.afterThat === "keep_keys" && rule.keysToKeep) {
    const trimmed = applyKeepKeys(msg.toolPayload ?? {}, rule.keysToKeep)
    return { ...msg, toolPayload: trimmed as Record<string, unknown>, content: "" }
  }
  if (rule.afterThat === "summarise") {
    return {
      ...msg,
      toolPayload: undefined,
      content: rule.summariseAs ?? `(${msg.toolName} result trimmed)`,
    }
  }
  return msg
}

/** Layer 1 — trim or drop old tool_call / tool_result messages per rule table. */
export function toolTrim(
  window: ActiveChatWindow,
  cfg: CompactionConfig,
): { window: ActiveChatWindow; changed: boolean } {
  const tail = cfg.alwaysKeepLastN
  const tailStart = Math.max(0, window.messages.length - tail)
  const counts = new Map<string, number>() // tool name -> seen-from-newest count

  // Walk newest -> oldest, allow N most-recent verbatim per tool, then trim.
  const next: Entry[] = window.messages.slice()
  let changed = false

  for (let i = next.length - 1; i >= 0; i--) {
    if (i >= tailStart) continue
    const e = next[i]
    if (!e || !isChat(e)) continue
    if (e.role !== "tool_result" && e.role !== "tool_call") continue
    const name = e.toolName ?? ""
    const rule = cfg.toolTrimRules[name]
    if (!rule) continue
    const seen = counts.get(name) ?? 0
    counts.set(name, seen + 1)
    if (seen < rule.keepVerbatimFor) continue
    const trimmed = applyTrimRule(e, rule)
    if (trimmed === null) {
      next.splice(i, 1)
      changed = true
    } else if (trimmed !== e) {
      next[i] = trimmed
      changed = true
    }
  }

  if (!changed) return { window, changed: false }
  const updated: ActiveChatWindow = { ...window, messages: next, tokenEstimate: totalTokens(next) }
  return { window: updated, changed: true }
}

/** Layer 2 — collapse a leading run of plain chat messages into a SummaryBlock. */
export async function summariseHead(
  window: ActiveChatWindow,
  cfg: CompactionConfig,
  targetTokens: number,
): Promise<{ window: ActiveChatWindow; changed: boolean; summary?: ChatSummaryBlock }> {
  const tailStart = Math.max(0, window.messages.length - cfg.alwaysKeepLastN)
  const head = window.messages.slice(0, tailStart)
  const tail = window.messages.slice(tailStart)

  const chatHead = head.filter(isChat)
  if (chatHead.length < 2) return { window, changed: false }

  // Take the longest run from the start that we can collapse.
  let take = chatHead.length
  let summarised: ChatMessage[]
  while (true) {
    summarised = chatHead.slice(0, take)
    const remainingHead = head.filter((e, idx) => {
      if (!isChat(e)) return true
      const chatIdx = head.slice(0, idx).filter(isChat).length
      return chatIdx >= take
    })
    const projectedTokens =
      totalTokens(remainingHead) + entryTokens({ type: "summary" } as Entry) + totalTokens(tail)
    if (projectedTokens <= targetTokens || take <= 2) break
    take--
  }

  if (summarised.length < 2) return { window, changed: false }

  const { content, keyFacts } = await cfg.summarise(summarised)
  const summary: ChatSummaryBlock = {
    type: "summary",
    covers: {
      from: summarised[0]!.timestamp,
      to: summarised[summarised.length - 1]!.timestamp,
      messageCount: summarised.length,
    },
    content,
    keyFacts,
    preservedMessages: [],
  }

  // Rebuild head with summary in place of the consumed chat messages.
  const out: Entry[] = []
  let consumed = 0
  let inserted = false
  for (const e of head) {
    if (isChat(e) && consumed < summarised.length) {
      consumed++
      if (!inserted) {
        out.push(summary)
        inserted = true
      }
      continue
    }
    out.push(e)
  }
  out.push(...tail)

  const updated: ActiveChatWindow = {
    ...window,
    messages: out,
    tokenEstimate: totalTokens(out),
    summaries: [...window.summaries, summary],
  }
  return { window: updated, changed: true, summary }
}

/** Layer 3 — drop a middle range; insert a GapMarker. */
export function truncateMiddle(
  window: ActiveChatWindow,
  cfg: CompactionConfig,
  targetTokens: number,
): { window: ActiveChatWindow; changed: boolean } {
  const msgs = window.messages
  if (msgs.length <= cfg.alwaysKeepLastN + 1) return { window, changed: false }

  const tailStart = Math.max(1, msgs.length - cfg.alwaysKeepLastN)
  // Keep the very first entry (often the anchoring summary) and the tail; drop the middle.
  const dropFrom = 1
  const dropTo = tailStart // exclusive
  if (dropTo - dropFrom < 1) return { window, changed: false }

  const range = msgs.slice(dropFrom, dropTo)
  const chatRange = range.filter(isChat)
  if (chatRange.length === 0) return { window, changed: false }

  const first = chatRange[0]!
  const last = chatRange[chatRange.length - 1]!
  const gap: GapMarker = {
    type: "gap",
    droppedMessageCount: range.length,
    from: first.timestamp,
    to: last.timestamp,
    reason: "truncation",
  }
  const working = [...msgs.slice(0, dropFrom), gap, ...msgs.slice(dropTo)]
  const tokens = totalTokens(working)
  // targetTokens is informational; truncation drops the maximal middle in one pass.
  void targetTokens
  return {
    window: { ...window, messages: working, tokenEstimate: tokens },
    changed: true,
  }
}

export function shouldCompact(window: ActiveChatWindow, cfg: CompactionConfig): boolean {
  return window.tokenEstimate >= cfg.triggerThreshold * cfg.budget
}

export async function compact(
  window: ActiveChatWindow,
  cfgOverride: Partial<CompactionConfig> = {},
): Promise<{ window: ActiveChatWindow; result: CompactionResult }> {
  const cfg: CompactionConfig = { ...DefaultCompactionConfig, ...cfgOverride }
  const tokensBefore = window.tokenEstimate
  const messagesBefore = window.messages.length
  const target = cfg.targetAfterCompaction * cfg.budget
  const strategy: CompactionResult["strategy"] = []

  let current = window

  // Layer 1
  const trimmed = toolTrim(current, cfg)
  if (trimmed.changed) {
    current = trimmed.window
    strategy.push("tool_trim")
  }

  let summaryText: string | undefined
  if (current.tokenEstimate > target) {
    const sum = await summariseHead(current, cfg, target)
    if (sum.changed) {
      current = sum.window
      strategy.push("summarise")
      summaryText = sum.summary?.content
    }
  }

  if (current.tokenEstimate > target) {
    const trunc = truncateMiddle(current, cfg, target)
    if (trunc.changed) {
      current = trunc.window
      strategy.push("truncate")
    }
  }

  const result: CompactionResult = {
    strategy,
    messagesBefore,
    messagesAfter: current.messages.length,
    tokensBefore,
    tokensAfter: current.tokenEstimate,
    ...(summaryText ? { summaryGenerated: summaryText } : {}),
    compactedAt: new Date(),
  }

  current = {
    ...current,
    lastCompactedAt: result.compactedAt,
    compactionHistory: [...current.compactionHistory, result],
  }

  return { window: current, result }
}

export async function compactIfNeeded(
  window: ActiveChatWindow,
  cfgOverride: Partial<CompactionConfig> = {},
): Promise<{ window: ActiveChatWindow; result: CompactionResult | null }> {
  const cfg: CompactionConfig = { ...DefaultCompactionConfig, ...cfgOverride }
  if (!shouldCompact(window, cfg)) return { window, result: null }
  return compact(window, cfgOverride)
}
