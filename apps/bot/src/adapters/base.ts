import type { AgentResponse, ChannelTarget, Platform, UnifiedEvent } from "@supper-bot/types"

export interface SendResult {
  /** Platform-native message id of the just-sent message. */
  messageId: string
}

export interface ChannelAdapter {
  readonly platform: Platform

  parseIncoming(event: unknown): Promise<UnifiedEvent | null>
  sendMessage(target: ChannelTarget, content: AgentResponse): Promise<SendResult>
  start(): Promise<void>
  stop(): Promise<void>
}
