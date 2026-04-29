import { ORDER_REF_PATTERN } from "@/lib/id"
import { lookupTrackedMessage } from "@/memory/working-memory"
import type { BotMeta, TriggerType } from "@supper-bot/types"

export interface DiscordMessageShape {
  text: string
  isDm?: boolean
  threadId?: string
  referencedAuthorId?: string
  mentionsBot?: boolean
}

export function detectMentionTrigger(msg: DiscordMessageShape): boolean {
  return msg.mentionsBot === true
}

export function detectReplyTrigger(msg: DiscordMessageShape, bot: BotMeta): boolean {
  return msg.referencedAuthorId === bot.userId
}

export function detectOrderRefTrigger(text: string): boolean {
  ORDER_REF_PATTERN.lastIndex = 0
  return ORDER_REF_PATTERN.test(text)
}

export async function detectDiscordTrigger(
  msg: DiscordMessageShape,
  bot: BotMeta,
): Promise<TriggerType | null> {
  if (detectReplyTrigger(msg, bot)) return "reply"
  if (msg.threadId) {
    const tracked = await lookupTrackedMessage("discord", msg.threadId)
    if (tracked) return "thread"
  }
  if (detectMentionTrigger(msg)) return "mention"
  if (detectOrderRefTrigger(msg.text)) return "order_ref"
  if (msg.isDm) return "dm"
  return null
}
