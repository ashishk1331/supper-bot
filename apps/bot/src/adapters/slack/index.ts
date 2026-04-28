import { loadConfig } from "@/lib/config"
import { AdapterError } from "@/lib/errors"
import { extractOrderRefs } from "@/lib/id"
import { getLogger } from "@/lib/logger"
import { getAmbientBuffer, pushAmbientMessage } from "@/memory/working-memory"
import { dispatch } from "@/queue/dispatcher"
import { App } from "@slack/bolt"
import type {
  AgentResponse,
  AmbientMessage,
  BotMeta,
  ChannelTarget,
  UnifiedEvent,
  UnifiedMessage,
  UnifiedReaction,
} from "@supper-bot/types"
import type { ChannelAdapter } from "../base"
import { renderSlack } from "./renderer"
import { type SlackMessageShape, detectSlackTrigger } from "./trigger-detector"

interface SlackMessageEvent {
  type: "message"
  subtype?: string
  text?: string
  user?: string
  ts: string
  channel: string
  channel_type?: SlackMessageShape["channelType"]
  thread_ts?: string
  parent_user_id?: string
  bot_id?: string
}

interface SlackReactionEvent {
  type: "reaction_added" | "reaction_removed"
  user: string
  reaction: string
  item: { type: "message"; channel: string; ts: string }
  event_ts: string
}

const MENTION_TAG = /<@([UW][A-Z0-9]+)>/g

function stripMentions(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(MENTION_TAG)) {
    if (match[1]) out.push(match[1])
  }
  return out
}

export class SlackAdapter implements ChannelAdapter {
  readonly platform = "slack" as const
  private app: App | null = null
  private botMeta: BotMeta | null = null

  async parseIncoming(event: unknown): Promise<UnifiedEvent | null> {
    if (!event || typeof event !== "object") return null
    const e = event as { type?: string }
    if (e.type === "message") return this.parseMessage(event as SlackMessageEvent)
    if (e.type === "reaction_added" || e.type === "reaction_removed")
      return this.parseReaction(event as SlackReactionEvent)
    return null
  }

  async sendMessage(target: ChannelTarget, content: AgentResponse): Promise<void> {
    if (!this.app) throw new AdapterError("slack", "adapter not started")
    const rendered = renderSlack(content)
    await this.app.client.chat.postMessage({
      channel: target.groupId,
      text: rendered.text,
      blocks: rendered.blocks,
      ...(target.threadId ? { thread_ts: target.threadId } : {}),
    })
  }

  async start(): Promise<void> {
    const config = loadConfig()
    const log = getLogger()

    this.app = new App({
      token: config.SLACK_BOT_TOKEN,
      appToken: config.SLACK_APP_TOKEN,
      socketMode: true,
      logLevel: undefined,
    })

    const auth = await this.app.client.auth.test()
    if (!auth.user_id) {
      throw new AdapterError("slack", "auth.test did not return user_id")
    }
    this.botMeta = { userId: auth.user_id, mentionString: `<@${auth.user_id}>` }

    this.app.message(async ({ message }) => {
      try {
        await this.onMessage(message as unknown as SlackMessageEvent)
      } catch (err) {
        log.error({ err }, "slack onMessage failed")
      }
    })

    this.app.event("app_mention", async ({ event }) => {
      try {
        // app_mention duplicates a message event Bolt also fires; ignore here
        // and let onMessage handle it via mention trigger detection.
        log.debug({ ts: event.ts }, "app_mention received (handled via message)")
      } catch (err) {
        log.error({ err }, "slack app_mention failed")
      }
    })

    this.app.event("reaction_added", async ({ event }) => {
      try {
        await this.onReaction(event as unknown as SlackReactionEvent)
      } catch (err) {
        log.error({ err }, "slack reaction_added failed")
      }
    })

    this.app.event("reaction_removed", async ({ event }) => {
      try {
        await this.onReaction(event as unknown as SlackReactionEvent)
      } catch (err) {
        log.error({ err }, "slack reaction_removed failed")
      }
    })

    await this.app.start()
    log.info({ botUserId: this.botMeta.userId }, "slack adapter connected")
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop()
      this.app = null
    }
    this.botMeta = null
  }

  private async onMessage(event: SlackMessageEvent): Promise<void> {
    if (!this.botMeta) return
    if (event.bot_id) return // ignore bot messages, including our own
    if (event.subtype && event.subtype !== "thread_broadcast") return
    if (!event.user || !event.text) return

    const ambient: AmbientMessage = {
      messageId: event.ts,
      userId: event.user,
      displayName: event.user,
      content: event.text,
      timestamp: new Date(Number.parseFloat(event.ts) * 1000),
      ...(event.thread_ts ? { replyTo: event.thread_ts } : {}),
    }
    await pushAmbientMessage("slack", event.channel, ambient)

    const parsed = await this.parseMessage(event)
    if (parsed?.trigger) {
      await dispatch(parsed)
    }
  }

  private async onReaction(event: SlackReactionEvent): Promise<void> {
    const parsed = this.parseReaction(event)
    if (parsed) await dispatch(parsed)
  }

  private async parseMessage(event: SlackMessageEvent): Promise<UnifiedMessage | null> {
    if (!this.botMeta || !event.user || !event.text) return null

    const trigger = await detectSlackTrigger(
      {
        text: event.text,
        ...(event.channel_type ? { channelType: event.channel_type } : {}),
        ...(event.thread_ts ? { threadTs: event.thread_ts } : {}),
        ...(event.parent_user_id ? { parentUserId: event.parent_user_id } : {}),
        ...(event.user ? { user: event.user } : {}),
      },
      this.botMeta,
    )

    if (!trigger) return null

    const ambientContext = await getAmbientBuffer("slack", event.channel)

    return {
      type: "message",
      platform: "slack",
      groupId: event.channel,
      ...(event.thread_ts ? { threadId: event.thread_ts } : {}),
      userId: event.user,
      displayName: event.user,
      text: event.text,
      trigger,
      ...(event.thread_ts ? { replyTo: event.thread_ts } : {}),
      orderRefs: extractOrderRefs(event.text),
      mentions: stripMentions(event.text),
      ambientContext,
      timestamp: new Date(Number.parseFloat(event.ts) * 1000),
      rawEvent: event,
    }
  }

  private parseReaction(event: SlackReactionEvent): UnifiedReaction {
    return {
      type: "reaction",
      platform: "slack",
      groupId: event.item.channel,
      userId: event.user,
      displayName: event.user,
      emoji: event.reaction,
      action: event.type === "reaction_added" ? "added" : "removed",
      targetMessageId: event.item.ts,
      trigger: "reaction",
      timestamp: new Date(Number.parseFloat(event.event_ts) * 1000),
      rawEvent: event,
    }
  }
}
