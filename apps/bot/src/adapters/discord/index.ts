import type { AgentResponse, ChannelTarget, UnifiedEvent } from "@supper-bot/types"
import type { ChannelAdapter } from "../base"

export class DiscordAdapter implements ChannelAdapter {
  readonly platform = "discord" as const

  parseIncoming(_event: unknown): UnifiedEvent | null {
    // TODO: implement Discord event parsing via discord.js
    return null
  }

  async sendMessage(_target: ChannelTarget, _content: AgentResponse): Promise<void> {
    // TODO: implement Discord message sending (Embeds + Buttons)
  }

  async start(): Promise<void> {
    // TODO: login + register handlers
  }

  async stop(): Promise<void> {
    // TODO: destroy client
  }
}
