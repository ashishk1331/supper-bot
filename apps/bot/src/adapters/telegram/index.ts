import type { AgentResponse, ChannelTarget, UnifiedEvent } from "@supper-bot/types"
import type { ChannelAdapter } from "../base"

export class TelegramAdapter implements ChannelAdapter {
  readonly platform = "telegram" as const

  parseIncoming(_event: unknown): UnifiedEvent | null {
    // TODO: implement Telegram event parsing via grammy
    return null
  }

  async sendMessage(_target: ChannelTarget, _content: AgentResponse): Promise<void> {
    // TODO: implement Telegram message sending (inline keyboards)
  }

  async start(): Promise<void> {
    // TODO: long-poll or webhook based on TELEGRAM_USE_WEBHOOK
  }

  async stop(): Promise<void> {
    // TODO: stop polling / unregister webhook
  }
}
