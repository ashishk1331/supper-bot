import { describe, expect, test } from "bun:test"
import {
  deserializeAmbientMessage,
  deserializeChatWindow,
  deserializeSession,
  serializeAmbientMessage,
  serializeChatWindow,
  serializeSession,
} from "@/memory/serde"
import type { ActiveChatWindow, AmbientMessage, OrderSession } from "@supper-bot/types"

const sampleSession: OrderSession = {
  sessionId: "swift-mango-lands",
  orderId: "lazy-tiger-runs",
  platform: "slack",
  groupId: "G1",
  state: "collecting",
  partyLeader: { userId: "U1", displayName: "Alice" },
  restaurant: { id: "R1", name: "Pizzeria", minOrderValue: 200 },
  members: {
    U1: {
      userId: "U1",
      displayName: "Alice",
      items: [{ dishId: "D1", dishName: "Margherita", qty: 1, price: 320 }],
      confirmed: false,
      optedOut: false,
      lastActiveAt: new Date("2026-04-29T10:15:00.000Z"),
    },
  },
  trackedMessages: {
    M1: { messageId: "M1", sessionId: "swift-mango-lands", intent: "voting_summary" },
  },
  createdAt: new Date("2026-04-29T10:00:00.000Z"),
  updatedAt: new Date("2026-04-29T10:15:00.000Z"),
  expiresAt: new Date("2026-04-29T12:00:00.000Z"),
}

describe("serde", () => {
  test("session round-trip preserves Date fields", () => {
    const round = deserializeSession(serializeSession(sampleSession))
    expect(round.sessionId).toBe(sampleSession.sessionId)
    expect(round.createdAt).toBeInstanceOf(Date)
    expect(round.updatedAt).toBeInstanceOf(Date)
    expect(round.expiresAt).toBeInstanceOf(Date)
    expect(round.createdAt.toISOString()).toBe(sampleSession.createdAt.toISOString())
    expect(round.members.U1?.lastActiveAt).toBeInstanceOf(Date)
    expect(round.members.U1?.lastActiveAt.toISOString()).toBe(
      sampleSession.members.U1?.lastActiveAt.toISOString(),
    )
  })

  test("session round-trip preserves nested cart items", () => {
    const round = deserializeSession(serializeSession(sampleSession))
    expect(round.members.U1?.items).toHaveLength(1)
    expect(round.members.U1?.items[0]?.dishName).toBe("Margherita")
    expect(round.trackedMessages.M1?.intent).toBe("voting_summary")
  })

  test("session with closedAt round-trips correctly", () => {
    const closed: OrderSession = {
      ...sampleSession,
      closedAt: new Date("2026-04-29T11:00:00.000Z"),
    }
    const round = deserializeSession(serializeSession(closed))
    expect(round.closedAt).toBeInstanceOf(Date)
    expect(round.closedAt?.toISOString()).toBe(closed.closedAt?.toISOString())
  })

  test("chat window round-trip preserves message and summary timestamps", () => {
    const window: ActiveChatWindow = {
      sessionId: "swift-mango-lands",
      groupId: "G1",
      messages: [
        {
          id: "m1",
          role: "user",
          content: "hello",
          timestamp: new Date("2026-04-29T10:01:00.000Z"),
        },
        {
          type: "summary",
          covers: {
            from: new Date("2026-04-29T09:00:00.000Z"),
            to: new Date("2026-04-29T09:30:00.000Z"),
            messageCount: 5,
          },
          content: "summary",
          keyFacts: ["a", "b"],
          preservedMessages: [],
        },
        {
          type: "gap",
          droppedMessageCount: 3,
          from: new Date("2026-04-29T08:00:00.000Z"),
          to: new Date("2026-04-29T08:30:00.000Z"),
          reason: "truncation",
        },
      ],
      tokenEstimate: 42,
      compactionHistory: [],
      summaries: [],
    }
    const round = deserializeChatWindow(serializeChatWindow(window))
    expect(round.messages).toHaveLength(3)
    const [first, summary, gap] = round.messages
    if (!first || !summary || !gap) throw new Error("expected three items")
    expect("timestamp" in first && first.timestamp instanceof Date).toBe(true)
    expect("covers" in summary && summary.covers.from instanceof Date).toBe(true)
    expect("from" in gap && gap.from instanceof Date).toBe(true)
  })

  test("ambient message round-trip", () => {
    const m: AmbientMessage = {
      messageId: "x1",
      userId: "U1",
      displayName: "Alice",
      content: "anyone hungry?",
      timestamp: new Date("2026-04-29T10:30:00.000Z"),
    }
    const round = deserializeAmbientMessage(serializeAmbientMessage(m))
    expect(round.timestamp).toBeInstanceOf(Date)
    expect(round.timestamp.toISOString()).toBe(m.timestamp.toISOString())
    expect(round.content).toBe(m.content)
  })
})
