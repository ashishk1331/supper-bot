import { getLogger } from "@/lib/logger"

// TODO: BullMQ worker; pulls UnifiedEvent and routes to orchestrator
export async function startWorkers(): Promise<void> {
  getLogger().info("queue worker stub started (no BullMQ wiring yet)")
}

export async function stopWorkers(): Promise<void> {
  // TODO: graceful shutdown
}
