import { describe, expect, test } from "bun:test"
import {
  type CompactionConfig,
  DefaultCompactionConfig,
  compact,
  compactIfNeeded,
  shouldCompact,
  toolTrim,
  truncateMiddle,
} from "@/memory/compaction-manager"
import type { ActiveChatWindow, ChatMessage } from "@supper-bot/types"

let counter = 0
function chat(
  role: ChatMessage["role"],
  content: string,
  opts: Partial<ChatMessage> = {},
): ChatMessage {
  counter++
  return {
    id: `m${counter}`,
    role,
    content,
    timestamp: new Date(2026, 0, 1, 0, 0, counter),
    ...opts,
  }
}

function makeWindow(messages: ChatMessage[]): ActiveChatWindow {
  return {
    sessionId: "s1",
    groupId: "g1",
    messages,
    tokenEstimate: messages.reduce((acc, m) => acc + m.content.length, 0),
    compactionHistory: [],
    summaries: [],
  }
}

describe("toolTrim", () => {
  test("keeps last N tool results verbatim, summarises older per rule", () => {
    const cfg: CompactionConfig = { ...DefaultCompactionConfig, alwaysKeepLastN: 0 }
    const tools = Array.from({ length: 5 }, (_, i) =>
      chat("tool_result", `menu blob ${i}`, {
        toolName: "swiggy_get_menu",
        toolPayload: { items: Array(50).fill({ name: "x" }) },
      }),
    )
    const w = makeWindow(tools)
    const out = toolTrim(w, cfg)
    expect(out.changed).toBe(true)
    // Newest 2 are verbatim; older 3 collapsed.
    const last = out.window.messages.at(-1) as ChatMessage
    const last2 = out.window.messages.at(-2) as ChatMessage
    expect(last.toolPayload).toBeDefined()
    expect(last2.toolPayload).toBeDefined()
    const first = out.window.messages[0] as ChatMessage
    expect(first.toolPayload).toBeUndefined()
    expect(first.content).toContain("Menu for")
  })

  test("keep_keys narrows tool payload to whitelist", () => {
    const cfg: CompactionConfig = { ...DefaultCompactionConfig, alwaysKeepLastN: 0 }
    const messages = Array.from({ length: 4 }, (_, i) =>
      chat("tool_result", `s${i}`, {
        toolName: "swiggy_search_restaurants",
        toolPayload: {
          results: [{ id: "r1", name: "X", cuisine: "Y", rating: 4, raw: { huge: true } }],
        },
      }),
    )
    const out = toolTrim(makeWindow(messages), cfg)
    expect(out.changed).toBe(true)
    const oldest = out.window.messages[0] as ChatMessage
    const payload = oldest.toolPayload as { results?: Array<Record<string, unknown>> }
    expect(payload.results).toBeUndefined()
  })

  test("ignores tools without a rule", () => {
    const out = toolTrim(
      makeWindow([
        chat("tool_result", "blob", { toolName: "swiggy_track_order", toolPayload: { x: 1 } }),
        chat("tool_result", "blob", { toolName: "swiggy_track_order", toolPayload: { x: 2 } }),
        chat("tool_result", "blob", { toolName: "swiggy_track_order", toolPayload: { x: 3 } }),
      ]),
      { ...DefaultCompactionConfig, alwaysKeepLastN: 0 },
    )
    expect(out.changed).toBe(false)
  })
})

describe("truncateMiddle", () => {
  test("inserts a GapMarker when over target", () => {
    const messages = Array.from({ length: 12 }, (_, i) => chat("user", `hello ${i}`))
    const w = makeWindow(messages)
    const out = truncateMiddle(w, { ...DefaultCompactionConfig, alwaysKeepLastN: 3 }, 30)
    expect(out.changed).toBe(true)
    const gap = out.window.messages.find((m) => (m as { type?: string }).type === "gap")
    expect(gap).toBeDefined()
  })
})

describe("compact pipeline", () => {
  test("noop under threshold", () => {
    const w = makeWindow([chat("user", "hi")])
    expect(shouldCompact(w, DefaultCompactionConfig)).toBe(false)
  })

  test("compactIfNeeded returns null result below threshold", async () => {
    const w = makeWindow([chat("user", "hi")])
    const out = await compactIfNeeded(w)
    expect(out.result).toBeNull()
  })

  test("full pipeline trims tools then summarises then records history", async () => {
    const tools = Array.from({ length: 3 }, (_, i) =>
      chat("tool_result", `m${i}`, {
        toolName: "swiggy_get_menu",
        toolPayload: { items: Array(40).fill({ name: "x".repeat(20) }) },
      }),
    )
    const chats = Array.from({ length: 12 }, (_, i) => chat("user", `msg ${i} `.repeat(20)))
    const w = makeWindow([...tools, ...chats])
    let summariseCalled = 0
    const out = await compact(w, {
      budget: 200,
      triggerThreshold: 0.5,
      targetAfterCompaction: 0.3,
      alwaysKeepLastN: 4,
      summarise: async (msgs) => {
        summariseCalled++
        return { content: `Summary of ${msgs.length} msgs`, keyFacts: [] }
      },
    })
    expect(out.result.strategy.length).toBeGreaterThan(0)
    expect(out.result.tokensAfter).toBeLessThan(out.result.tokensBefore)
    expect(out.window.compactionHistory).toHaveLength(1)
    if (out.result.strategy.includes("summarise")) {
      expect(summariseCalled).toBeGreaterThan(0)
      expect(out.window.summaries.length).toBeGreaterThan(0)
    }
  })
})
