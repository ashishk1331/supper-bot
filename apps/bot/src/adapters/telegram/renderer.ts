import type { AgentResponse, RichBlock } from "@supper-bot/types"
import { InlineKeyboard } from "grammy"

export interface TelegramRenderResult {
  text: string
  reply_markup?: InlineKeyboard
}

function richBlockToText(block: RichBlock): string {
  if (block.kind === "section" && typeof block.payload.text === "string") {
    return block.payload.text
  }
  return ""
}

export function renderTelegram(response: AgentResponse): TelegramRenderResult {
  const parts: string[] = []
  if (response.text) parts.push(response.text)
  for (const rb of response.blocks ?? []) {
    const t = richBlockToText(rb)
    if (t) parts.push(t)
  }
  const text = parts.join("\n\n") || "."

  if (!response.buttons || response.buttons.length === 0) return { text }

  const keyboard = new InlineKeyboard()
  for (const b of response.buttons) {
    keyboard.text(b.label, b.id)
  }
  return { text, reply_markup: keyboard }
}
