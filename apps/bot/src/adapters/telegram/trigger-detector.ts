import { ORDER_REF_PATTERN } from "@/lib/id"
import { lookupTrackedMessage } from "@/memory/working-memory"
import type { BotMeta, TriggerType } from "@supper-bot/types"

export interface TelegramMessageShape {
  text: string
  isDm: boolean
  threadId?: string
  replyToBot?: boolean
  mentionsBot?: boolean
}

export function detectMentionTrigger(msg: TelegramMessageShape): boolean {
  return msg.mentionsBot === true
}

export function detectReplyTrigger(msg: TelegramMessageShape): boolean {
  return msg.replyToBot === true
}

export function detectOrderRefTrigger(text: string): boolean {
  ORDER_REF_PATTERN.lastIndex = 0
  return ORDER_REF_PATTERN.test(text)
}

export async function detectTelegramTrigger(
  msg: TelegramMessageShape,
  _bot: BotMeta,
): Promise<TriggerType | null> {
  if (detectReplyTrigger(msg)) return "reply"
  if (msg.threadId) {
    const tracked = await lookupTrackedMessage("telegram", msg.threadId)
    if (tracked) return "thread"
  }
  if (detectMentionTrigger(msg)) return "mention"
  if (detectOrderRefTrigger(msg.text)) return "order_ref"
  if (msg.isDm) return "dm"
  return null
}
