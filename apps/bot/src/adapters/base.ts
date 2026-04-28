import type { AgentResponse, ChannelTarget, Platform, UnifiedEvent } from "@supper-bot/types"

export interface ChannelAdapter {
  readonly platform: Platform

  parseIncoming(event: unknown): Promise<UnifiedEvent | null>
  sendMessage(target: ChannelTarget, content: AgentResponse): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}
