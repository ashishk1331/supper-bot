import { describe, expect, test } from "bun:test"
import { renderTelegram } from "@/adapters/telegram/renderer"
import {
  detectMentionTrigger,
  detectOrderRefTrigger,
  detectReplyTrigger,
} from "@/adapters/telegram/trigger-detector"

describe("telegram trigger detectors", () => {
  test("reply when replyToBot=true", () => {
    expect(detectReplyTrigger({ text: "yo", isDm: false, replyToBot: true })).toBe(true)
    expect(detectReplyTrigger({ text: "yo", isDm: false, replyToBot: false })).toBe(false)
  })

  test("mention when mentionsBot=true", () => {
    expect(detectMentionTrigger({ text: "hi @supper", isDm: false, mentionsBot: true })).toBe(true)
    expect(detectMentionTrigger({ text: "hi", isDm: false, mentionsBot: false })).toBe(false)
  })

  test("order_ref matches #human-id", () => {
    expect(detectOrderRefTrigger("status of #swift-mango-lands?")).toBe(true)
    expect(detectOrderRefTrigger("nope")).toBe(false)
  })
})

describe("renderTelegram", () => {
  test("plain text without buttons", () => {
    const out = renderTelegram({ text: "Hello" })
    expect(out.text).toBe("Hello")
    expect(out.reply_markup).toBeUndefined()
  })

  test("section blocks concatenate to text", () => {
    const out = renderTelegram({
      text: "Hi",
      blocks: [{ kind: "section", payload: { text: "menu line" } }],
    })
    expect(out.text).toContain("Hi")
    expect(out.text).toContain("menu line")
  })

  test("buttons populate inline keyboard", () => {
    const out = renderTelegram({
      text: "vote",
      buttons: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
    })
    expect(out.reply_markup).toBeDefined()
  })
})
