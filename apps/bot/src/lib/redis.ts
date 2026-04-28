import { loadConfig } from "@/lib/config"
import { getLogger } from "@/lib/logger"
import IORedis, { type Redis } from "ioredis"

let cached: Redis | null = null

export function getRedis(): Redis {
  if (cached) return cached
  const config = loadConfig()
  const log = getLogger()
  const client = new IORedis(config.FALKORDB_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
    enableReadyCheck: true,
  })
  client.on("error", (err) => log.error({ err }, "redis error"))
  client.on("ready", () => log.info("redis connected"))
  cached = client
  return cached
}

export async function closeRedis(): Promise<void> {
  if (cached) {
    await cached.quit()
    cached = null
  }
}
