import { describe, expect, test } from "bun:test"
import { renderDiscord } from "@/adapters/discord/renderer"
import {
  detectMentionTrigger,
  detectOrderRefTrigger,
  detectReplyTrigger,
} from "@/adapters/discord/trigger-detector"

const BOT = { userId: "BOT123", mentionString: "<@BOT123>" }

describe("discord trigger detectors", () => {
  test("reply matches when referenced author is bot", () => {
    expect(detectReplyTrigger({ text: "yo", referencedAuthorId: "BOT123" }, BOT)).toBe(true)
    expect(detectReplyTrigger({ text: "yo", referencedAuthorId: "U999" }, BOT)).toBe(false)
  })

  test("mention is opaque to bot's specific id (relies on mentions.has)", () => {
    expect(detectMentionTrigger({ text: "hi", mentionsBot: true })).toBe(true)
    expect(detectMentionTrigger({ text: "hi", mentionsBot: false })).toBe(false)
  })

  test("order_ref picks up #human-id pattern", () => {
    expect(detectOrderRefTrigger("track #swift-mango-lands please")).toBe(true)
    expect(detectOrderRefTrigger("just chatting")).toBe(false)
  })
})

describe("renderDiscord", () => {
  test("plain text response", () => {
    const out = renderDiscord({ text: "Hello" })
    expect(out.content).toBe("Hello")
    expect(out.embeds).toBeUndefined()
    expect(out.components).toBeUndefined()
  })

  test("renders section blocks as embeds", () => {
    const out = renderDiscord({
      text: "",
      blocks: [{ kind: "section", payload: { text: "menu line" } }],
    })
    expect(out.embeds?.length).toBe(1)
  })

  test("renders buttons in an action row", () => {
    const out = renderDiscord({
      text: "vote",
      buttons: [{ id: "yes", label: "Yes", style: "primary" }],
    })
    expect(out.components?.length).toBe(1)
  })
})
