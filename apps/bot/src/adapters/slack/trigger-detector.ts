import { ORDER_REF_PATTERN } from "@/lib/id"
import { lookupTrackedMessage } from "@/memory/working-memory"
import type { BotMeta, TriggerType } from "@supper-bot/types"

export interface SlackMessageShape {
  text: string
  channelType?: "im" | "channel" | "group" | "mpim"
  threadTs?: string
  parentUserId?: string
  user?: string
}

export function detectMentionTrigger(text: string, bot: BotMeta): boolean {
  return text.includes(bot.mentionString)
}

export function detectReplyTrigger(parentUserId: string | undefined, bot: BotMeta): boolean {
  return parentUserId === bot.userId
}

export function detectOrderRefTrigger(text: string): boolean {
  ORDER_REF_PATTERN.lastIndex = 0
  return ORDER_REF_PATTERN.test(text)
}

export function detectDmTrigger(channelType: SlackMessageShape["channelType"]): boolean {
  return channelType === "im"
}

/**
 * Detects the trigger type for a Slack message in the priority order specified
 * in ARCHITECTURE §4.1. Returns null when nothing matches — caller should still
 * push the message into the ambient buffer but not enqueue it.
 *
 * Slack does not surface a reliable "quote" event, and DMs to a workspace bot
 * are not part of supper-bot's surface area, so those branches are intentionally
 * collapsed.
 */
export async function detectSlackTrigger(
  msg: SlackMessageShape,
  bot: BotMeta,
): Promise<TriggerType | null> {
  // 1. reply — message is a direct reply to the bot
  if (detectReplyTrigger(msg.parentUserId, bot)) return "reply"

  // 2. thread — the bot has a tracked message at the thread root
  if (msg.threadTs) {
    const tracked = await lookupTrackedMessage("slack", msg.threadTs)
    if (tracked) return "thread"
  }

  // 3. mention
  if (detectMentionTrigger(msg.text, bot)) return "mention"

  // 4. order_ref
  if (detectOrderRefTrigger(msg.text)) return "order_ref"

  // 5. dm — Slack workspace bots receive 'im' messages. Treated as a trigger
  // but the rest of the pipeline currently has no DM handling.
  if (detectDmTrigger(msg.channelType)) return "dm"

  return null
}
