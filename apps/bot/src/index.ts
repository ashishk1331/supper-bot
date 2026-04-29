import { buildEnabledAdapters } from "@/adapters"
import { loadConfig } from "@/lib/config"
import { getLogger } from "@/lib/logger"
import { closeRedis, getRedis } from "@/lib/redis"
import { closeMcpClients } from "@/mcp/client"
import { startWorkers, stopWorkers } from "@/queue/worker"
import { registerMemoryTools } from "@/tools/memory"
import { registerSessionTools } from "@/tools/session"
import { registerSwiggyTools } from "@/tools/swiggy"

async function main() {
  const config = loadConfig()
  const log = getLogger()

  log.info(
    {
      port: config.PORT,
      slack: config.SLACK_ENABLED,
      discord: config.DISCORD_ENABLED,
      telegram: config.TELEGRAM_ENABLED,
    },
    "supper-bot booting",
  )

  // Initialise Redis (FalkorDB) eagerly so misconfiguration fails fast.
  getRedis()

  registerSessionTools()
  registerMemoryTools()
  registerSwiggyTools()

  const adapters = buildEnabledAdapters()
  await Promise.all(adapters.map((a) => a.start()))

  await startWorkers()

  // Health endpoint — Bun.serve
  const server = Bun.serve({
    port: config.PORT,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json" },
        })
      }
      return new Response("Not found", { status: 404 })
    },
  })

  log.info({ port: server.port }, "health endpoint listening")

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down")
    server.stop()
    await stopWorkers()
    await Promise.all(adapters.map((a) => a.stop()))
    await closeMcpClients()
    await closeRedis()
    process.exit(0)
  }

  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal:", err)
  process.exit(1)
})
