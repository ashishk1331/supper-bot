import { registerAdapter, unregisterAdapter } from "@/adapters/registry"
import { loadConfig } from "@/lib/config"
import { AdapterError } from "@/lib/errors"
import { extractOrderRefs } from "@/lib/id"
import { getLogger } from "@/lib/logger"
import { getAmbientBuffer, pushAmbientMessage } from "@/memory/working-memory"
import { dispatch } from "@/queue/dispatcher"
import type {
  AgentResponse,
  AmbientMessage,
  BotMeta,
  ChannelTarget,
  UnifiedMessage,
} from "@supper-bot/types"
import { Bot, type Context } from "grammy"
import type { ChannelAdapter, SendResult } from "../base"
import { renderTelegram } from "./renderer"
import { detectTelegramTrigger } from "./trigger-detector"

export class TelegramAdapter implements ChannelAdapter {
  readonly platform = "telegram" as const
  private bot: Bot | null = null
  private botMeta: BotMeta | null = null
  private botUsername: string | null = null

  async parseIncoming(_event: unknown): Promise<null> {
    return null
  }

  async sendMessage(target: ChannelTarget, content: AgentResponse): Promise<SendResult> {
    if (!this.bot) throw new AdapterError("telegram", "adapter not started")
    const rendered = renderTelegram(content)
    const sent = await this.bot.api.sendMessage(target.groupId, rendered.text, {
      ...(target.threadId
        ? { message_thread_id: Number.parseInt(target.threadId, 10) || undefined }
        : {}),
      ...(rendered.reply_markup ? { reply_markup: rendered.reply_markup } : {}),
    })
    return { messageId: String(sent.message_id) }
  }

  async start(): Promise<void> {
    const config = loadConfig()
    const log = getLogger()

    this.bot = new Bot(config.TELEGRAM_BOT_TOKEN)
    const me = await this.bot.api.getMe()
    this.botMeta = { userId: String(me.id), mentionString: `@${me.username}` }
    this.botUsername = me.username

    this.bot.on("message", (ctx) => {
      this.onMessage(ctx).catch((err) => log.error({ err }, "telegram onMessage failed"))
    })

    if (config.TELEGRAM_USE_WEBHOOK) {
      log.warn("TELEGRAM_USE_WEBHOOK=true, but webhook server wiring is deferred")
      // Webhook mode is intentionally not started here; long-poll covers self-hosting.
    } else {
      // Fire-and-forget — bot.start() resolves only on shutdown.
      this.bot.start().catch((err) => log.error({ err }, "telegram polling stopped"))
    }

    registerAdapter(this)
    log.info({ botUserId: me.id, username: me.username }, "telegram adapter connected")
  }

  async stop(): Promise<void> {
    unregisterAdapter("telegram")
    if (this.bot) {
      await this.bot.stop()
      this.bot = null
    }
    this.botMeta = null
    this.botUsername = null
  }

  private async onMessage(ctx: Context): Promise<void> {
    if (!this.botMeta || !this.botUsername) return
    const message = ctx.message
    if (!message || !ctx.from) return
    const text = message.text ?? message.caption ?? ""
    if (!text) return

    const groupId = String(message.chat.id)
    const ambient: AmbientMessage = {
      messageId: String(message.message_id),
      userId: String(ctx.from.id),
      displayName: ctx.from.username ?? ctx.from.first_name ?? String(ctx.from.id),
      content: text,
      timestamp: new Date(message.date * 1000),
      ...(message.reply_to_message ? { replyTo: String(message.reply_to_message.message_id) } : {}),
    }
    await pushAmbientMessage("telegram", groupId, ambient)

    const isDm = message.chat.type === "private"
    const replyToBot = message.reply_to_message?.from?.id === Number(this.botMeta.userId)
    const mentionsBot =
      typeof text === "string" && this.botUsername
        ? text.toLowerCase().includes(`@${this.botUsername.toLowerCase()}`)
        : false
    const threadId = message.message_thread_id ? String(message.message_thread_id) : undefined

    const trigger = await detectTelegramTrigger(
      {
        text,
        isDm,
        ...(threadId ? { threadId } : {}),
        replyToBot,
        mentionsBot,
      },
      this.botMeta,
    )
    if (!trigger) return

    const ambientContext = await getAmbientBuffer("telegram", groupId)
    const unified: UnifiedMessage = {
      type: "message",
      platform: "telegram",
      groupId,
      ...(threadId ? { threadId } : {}),
      userId: String(ctx.from.id),
      displayName: ambient.displayName,
      text,
      trigger,
      ...(message.reply_to_message ? { replyTo: String(message.reply_to_message.message_id) } : {}),
      orderRefs: extractOrderRefs(text),
      mentions: [],
      ambientContext,
      timestamp: ambient.timestamp,
      rawEvent: message,
    }
    await dispatch(unified)
  }
}
