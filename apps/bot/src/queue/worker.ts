import { handleEvent } from "@/agent/orchestrator"
import { loadConfig } from "@/lib/config"
import { getLogger } from "@/lib/logger"
import { getRedis } from "@/lib/redis"
import { QUEUE_NAME, closeQueue } from "@/queue/producer"
import type { UnifiedEvent } from "@supper-bot/types"
import { Worker } from "bullmq"

let worker: Worker<UnifiedEvent> | null = null

export async function startWorkers(): Promise<void> {
  if (worker) return
  const config = loadConfig()
  const log = getLogger()

  worker = new Worker<UnifiedEvent>(
    QUEUE_NAME,
    async (job) => {
      await handleEvent(job.data)
    },
    {
      connection: getRedis(),
      concurrency: config.QUEUE_CONCURRENCY,
    },
  )

  worker.on("failed", (job, err) => {
    log.error({ err, jobId: job?.id, jobName: job?.name }, "queue job failed")
  })
  worker.on("ready", () => log.info({ queue: QUEUE_NAME }, "queue worker ready"))

  // BullMQ workers start automatically. We await `ready` for a deterministic boot log.
  await worker.waitUntilReady()
}

export async function stopWorkers(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  await closeQueue()
}
