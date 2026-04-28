import { loadConfig } from "@/lib/config"
import { getLogger } from "@/lib/logger"
import type { ChannelAdapter } from "./base"
import { DiscordAdapter } from "./discord"
import { SlackAdapter } from "./slack"
import { TelegramAdapter } from "./telegram"

export type { ChannelAdapter } from "./base"

export function buildEnabledAdapters(): ChannelAdapter[] {
  const config = loadConfig()
  const log = getLogger()
  const adapters: ChannelAdapter[] = []

  if (config.SLACK_ENABLED) adapters.push(new SlackAdapter())
  if (config.DISCORD_ENABLED) adapters.push(new DiscordAdapter())
  if (config.TELEGRAM_ENABLED) adapters.push(new TelegramAdapter())

  log.info({ count: adapters.length, platforms: adapters.map((a) => a.platform) }, "adapters built")
  return adapters
}
