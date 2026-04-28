import type { AgentResponse, Button, RichBlock } from "@supper-bot/types"

type SlackBlock =
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | {
      type: "actions"
      block_id?: string
      elements: Array<{
        type: "button"
        action_id: string
        text: { type: "plain_text"; text: string }
        value?: string
        style?: "primary" | "danger"
      }>
    }

export interface SlackRenderResult {
  text: string
  blocks: SlackBlock[]
}

function renderRichBlock(block: RichBlock): SlackBlock | null {
  switch (block.kind) {
    case "section": {
      const text = typeof block.payload.text === "string" ? block.payload.text : ""
      return { type: "section", text: { type: "mrkdwn", text } }
    }
    default:
      return null
  }
}

function renderButtons(buttons: Button[]): SlackBlock {
  return {
    type: "actions",
    block_id: "supper-actions",
    elements: buttons.map((b) => ({
      type: "button" as const,
      action_id: b.id,
      text: { type: "plain_text" as const, text: b.label },
      ...(b.value ? { value: b.value } : {}),
      ...(b.style === "primary" || b.style === "danger" ? { style: b.style } : {}),
    })),
  }
}

export function renderSlack(response: AgentResponse): SlackRenderResult {
  const blocks: SlackBlock[] = []

  if (response.text) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: response.text } })
  }

  for (const rb of response.blocks ?? []) {
    const slackBlock = renderRichBlock(rb)
    if (slackBlock) blocks.push(slackBlock)
  }

  if (response.buttons && response.buttons.length > 0) {
    blocks.push(renderButtons(response.buttons))
  }

  return { text: response.text, blocks }
}
