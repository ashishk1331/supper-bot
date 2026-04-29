export type Platform = "slack" | "discord" | "telegram"

export type TriggerType = "mention" | "reply" | "quote" | "thread" | "reaction" | "order_ref" | "dm"

export interface AmbientMessage {
  messageId: string
  userId: string
  displayName: string
  content: string
  timestamp: Date
  replyTo?: string
}

export interface UnifiedMessage {
  type: "message"
  platform: Platform
  groupId: string
  threadId?: string
  userId: string
  displayName: string
  text: string
  trigger: TriggerType
  triggerMessageId?: string
  replyTo?: string
  orderRefs: string[]
  mentions: string[]
  ambientContext: AmbientMessage[]
  timestamp: Date
  rawEvent: unknown
}

export interface UnifiedReaction {
  type: "reaction"
  platform: Platform
  groupId: string
  userId: string
  displayName: string
  emoji: string
  action: "added" | "removed"
  targetMessageId: string
  trigger: "reaction"
  timestamp: Date
  rawEvent: unknown
}

export type UnifiedEvent = UnifiedMessage | UnifiedReaction

export type ReactionIntent =
  | "confirm_order"
  | "opt_out"
  | "upvote_dish"
  | "downvote_dish"
  | "unknown"

export interface TrackedMessage {
  messageId: string
  sessionId: string
  intent: "voting_summary" | "dish_suggestion" | "order_summary" | "general"
}

export interface BotMeta {
  userId: string
  mentionString: string
}

export interface ChannelTarget {
  platform: Platform
  groupId: string
  threadId?: string
  replyTo?: string
}
