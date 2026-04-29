import { loadConfig } from "@/lib/config"
import { getRedis } from "@/lib/redis"
import type { UnifiedEvent } from "@supper-bot/types"
import { Queue } from "bullmq"

export const QUEUE_NAME = "incoming-events"

let cached: Queue<UnifiedEvent> | null = null

export function getQueue(): Queue<UnifiedEvent> {
  if (cached) return cached
  const config = loadConfig()
  cached = new Queue<UnifiedEvent>(QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: config.QUEUE_ATTEMPTS,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  })
  return cached
}

export async function enqueueEvent(event: UnifiedEvent): Promise<void> {
  const queue = getQueue()
  await queue.add(event.type, event)
}

export async function closeQueue(): Promise<void> {
  if (cached) {
    await cached.close()
    cached = null
  }
}
