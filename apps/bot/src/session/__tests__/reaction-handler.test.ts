import { describe, expect, test } from "bun:test"
import { resolveEmoji } from "@/session/reaction-handler"

describe("resolveEmoji", () => {
  test("recognises confirm emoji variants", () => {
    expect(resolveEmoji("✅")).toBe("confirm_order")
    expect(resolveEmoji("👍")).toBe("confirm_order")
    expect(resolveEmoji("white_check_mark")).toBe("confirm_order")
    expect(resolveEmoji(":white_check_mark:")).toBe("confirm_order")
    expect(resolveEmoji("+1")).toBe("confirm_order")
  })

  test("recognises opt-out emoji variants", () => {
    expect(resolveEmoji("❌")).toBe("opt_out")
    expect(resolveEmoji("👎")).toBe("opt_out")
    expect(resolveEmoji("x")).toBe("opt_out")
    expect(resolveEmoji("-1")).toBe("opt_out")
  })

  test("recognises upvote/downvote emoji", () => {
    expect(resolveEmoji("🔥")).toBe("upvote_dish")
    expect(resolveEmoji("heart")).toBe("upvote_dish")
    expect(resolveEmoji("😐")).toBe("downvote_dish")
    expect(resolveEmoji("thumbsdown")).toBe("downvote_dish")
  })

  test("returns 'unknown' for unrelated emoji", () => {
    expect(resolveEmoji("🍕")).toBe("unknown")
    expect(resolveEmoji("smile")).toBe("unknown")
    expect(resolveEmoji("")).toBe("unknown")
  })
})
