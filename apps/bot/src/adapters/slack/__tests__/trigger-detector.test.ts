import { describe, expect, test } from "bun:test"
import {
  detectMentionTrigger,
  detectOrderRefTrigger,
  detectReplyTrigger,
} from "@/adapters/slack/trigger-detector"
import type { BotMeta } from "@supper-bot/types"

const bot: BotMeta = { userId: "UBOT", mentionString: "<@UBOT>" }

describe("Slack trigger detection (sync)", () => {
  test("detects @mention via the bot's mentionString", () => {
    expect(detectMentionTrigger("hey <@UBOT> let's eat", bot)).toBe(true)
    expect(detectMentionTrigger("nothing here", bot)).toBe(false)
  })

  test("detects reply trigger when parent is the bot", () => {
    expect(detectReplyTrigger("UBOT", bot)).toBe(true)
    expect(detectReplyTrigger("USOMEONE", bot)).toBe(false)
    expect(detectReplyTrigger(undefined, bot)).toBe(false)
  })

  test("detects #order-id references", () => {
    expect(detectOrderRefTrigger("status of #swift-mango-lands?")).toBe(true)
    expect(detectOrderRefTrigger("nothing relevant")).toBe(false)
    expect(detectOrderRefTrigger("#two-words")).toBe(false)
  })

  test("order-ref detection is repeatable (lastIndex reset)", () => {
    const text = "check #swift-mango-lands"
    expect(detectOrderRefTrigger(text)).toBe(true)
    expect(detectOrderRefTrigger(text)).toBe(true)
    expect(detectOrderRefTrigger(text)).toBe(true)
  })
})
