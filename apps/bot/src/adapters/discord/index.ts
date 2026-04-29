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
  UnifiedReaction,
} from "@supper-bot/types"
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  Partials,
  type User,
} from "discord.js"
import type { ChannelAdapter, SendResult } from "../base"
import { renderDiscord } from "./renderer"
import { detectDiscordTrigger } from "./trigger-detector"

export class DiscordAdapter implements ChannelAdapter {
  readonly platform = "discord" as const
  private client: Client | null = null
  private botMeta: BotMeta | null = null

  async parseIncoming(_event: unknown): Promise<null> {
    // Discord events are dispatched via the gateway client; this entry point is
    // unused for now (the adapter wires its own client.on handlers).
    return null
  }

  async sendMessage(target: ChannelTarget, content: AgentResponse): Promise<SendResult> {
    if (!this.client) throw new AdapterError("discord", "adapter not started")
    const channel = await this.client.channels.fetch(target.threadId ?? target.groupId)
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new AdapterError("discord", `channel ${target.groupId} is not text-based`)
    }
    const sent = await channel.send(renderDiscord(content))
    return { messageId: sent.id }
  }

  async start(): Promise<void> {
    const config = loadConfig()
    const log = getLogger()

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    })

    this.client.on("messageCreate", (msg) => {
      this.onMessage(msg).catch((err) => log.error({ err }, "discord onMessage failed"))
    })
    this.client.on("messageReactionAdd", (reaction, user) => {
      this.onReaction(reaction, user, "added").catch((err) =>
        log.error({ err }, "discord reactionAdd failed"),
      )
    })
    this.client.on("messageReactionRemove", (reaction, user) => {
      this.onReaction(reaction, user, "removed").catch((err) =>
        log.error({ err }, "discord reactionRemove failed"),
      )
    })

    await new Promise<void>((resolve, reject) => {
      const c = this.client
      if (!c) return reject(new AdapterError("discord", "client missing"))
      c.once("ready", () => resolve())
      c.once("error", reject)
      c.login(config.DISCORD_BOT_TOKEN).catch(reject)
    })

    const me = this.client.user
    if (!me) throw new AdapterError("discord", "ready fired but client.user is null")
    this.botMeta = { userId: me.id, mentionString: `<@${me.id}>` }
    registerAdapter(this)
    log.info({ botUserId: me.id }, "discord adapter connected")
  }

  async stop(): Promise<void> {
    unregisterAdapter("discord")
    if (this.client) {
      await this.client.destroy()
      this.client = null
    }
    this.botMeta = null
  }

  private async onMessage(message: Message): Promise<void> {
    if (!this.botMeta) return
    if (message.author.bot) return
    const text = message.content ?? ""

    const ambient: AmbientMessage = {
      messageId: message.id,
      userId: message.author.id,
      displayName: message.author.username,
      content: text,
      timestamp: message.createdAt,
      ...(message.reference?.messageId ? { replyTo: message.reference.messageId } : {}),
    }
    const groupId = message.channelId
    await pushAmbientMessage("discord", groupId, ambient)

    const parsed = await this.toUnifiedMessage(message, text, groupId)
    if (parsed) await dispatch(parsed)
  }

  private async onReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    action: "added" | "removed",
  ): Promise<void> {
    if (user.bot) return
    const fullReaction = reaction.partial ? await reaction.fetch() : reaction
    const event: UnifiedReaction = {
      type: "reaction",
      platform: "discord",
      groupId: fullReaction.message.channelId,
      userId: user.id,
      displayName: user.username ?? user.id,
      emoji: fullReaction.emoji.name ?? "",
      action,
      targetMessageId: fullReaction.message.id,
      trigger: "reaction",
      timestamp: new Date(),
      rawEvent: { reaction: fullReaction, user },
    }
    await dispatch(event)
  }

  private async toUnifiedMessage(
    message: Message,
    text: string,
    groupId: string,
  ): Promise<UnifiedMessage | null> {
    if (!this.botMeta) return null
    const isDm = message.channel.type === ChannelType.DM
    const threadId = message.channel.isThread() ? message.channel.id : undefined
    const referencedAuthorId = message.reference?.messageId
      ? await safeFetchReferencedAuthor(message)
      : undefined

    const trigger = await detectDiscordTrigger(
      {
        text,
        isDm,
        ...(threadId ? { threadId } : {}),
        ...(referencedAuthorId ? { referencedAuthorId } : {}),
        mentionsBot: message.mentions.has(this.botMeta.userId),
      },
      this.botMeta,
    )
    if (!trigger) return null

    const ambientContext = await getAmbientBuffer("discord", groupId)

    return {
      type: "message",
      platform: "discord",
      groupId,
      ...(threadId ? { threadId } : {}),
      userId: message.author.id,
      displayName: message.author.username,
      text,
      trigger,
      ...(message.reference?.messageId ? { replyTo: message.reference.messageId } : {}),
      orderRefs: extractOrderRefs(text),
      mentions: Array.from(message.mentions.users.keys()),
      ambientContext,
      timestamp: message.createdAt,
      rawEvent: message,
    }
  }
}

async function safeFetchReferencedAuthor(message: Message): Promise<string | undefined> {
  try {
    const ref = await message.fetchReference()
    return ref.author.id
  } catch {
    return undefined
  }
}
