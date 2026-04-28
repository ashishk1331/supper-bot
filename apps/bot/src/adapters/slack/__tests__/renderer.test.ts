import { describe, expect, test } from "bun:test"
import { renderSlack } from "@/adapters/slack/renderer"

describe("Slack renderer", () => {
  test("plain text becomes a single mrkdwn section", () => {
    const out = renderSlack({ text: "hello there" })
    expect(out.text).toBe("hello there")
    expect(out.blocks).toHaveLength(1)
    expect(out.blocks[0]).toEqual({
      type: "section",
      text: { type: "mrkdwn", text: "hello there" },
    })
  })

  test("renders rich section blocks alongside text", () => {
    const out = renderSlack({
      text: "Top",
      blocks: [{ kind: "section", payload: { text: "*Body*" } }],
    })
    expect(out.blocks).toHaveLength(2)
    expect(out.blocks[1]).toEqual({ type: "section", text: { type: "mrkdwn", text: "*Body*" } })
  })

  test("renders buttons as an actions block", () => {
    const out = renderSlack({
      text: "Confirm?",
      buttons: [
        { id: "yes", label: "Yes", style: "primary", value: "y" },
        { id: "no", label: "No", style: "danger" },
      ],
    })
    const actions = out.blocks.find((b) => b.type === "actions")
    expect(actions).toBeDefined()
    if (!actions || actions.type !== "actions") throw new Error("expected actions block")
    expect(actions.elements).toHaveLength(2)
    expect(actions.elements[0]).toMatchObject({
      type: "button",
      action_id: "yes",
      style: "primary",
      value: "y",
    })
    expect(actions.elements[1]).toMatchObject({
      type: "button",
      action_id: "no",
      style: "danger",
    })
  })

  test("ignores unknown rich-block kinds", () => {
    const out = renderSlack({
      text: "x",
      blocks: [{ kind: "future-thing", payload: {} }],
    })
    expect(out.blocks).toHaveLength(1)
  })
})
