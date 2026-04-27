import type { AgentResponse, ChannelTarget, UnifiedEvent } from "@supper-bot/types"
import type { ChannelAdapter } from "../base"

export class SlackAdapter implements ChannelAdapter {
  readonly platform = "slack" as const

  parseIncoming(_event: unknown): UnifiedEvent | null {
    // TODO: implement Slack event parsing via @slack/bolt
    return null
  }

  async sendMessage(_target: ChannelTarget, _content: AgentResponse): Promise<void> {
    // TODO: implement Slack message sending (Block Kit rendering)
  }

  async start(): Promise<void> {
    // TODO: connect via Socket Mode
  }

  async stop(): Promise<void> {
    // TODO: disconnect
  }
}
