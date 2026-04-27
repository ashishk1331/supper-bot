import { buildEnabledAdapters } from "@/adapters"
import { startWorkers, stopWorkers } from "@/queue/worker"
import { registerSessionTools } from "@/tools/session"
import { registerMemoryTools } from "@/tools/memory"
import { registerSwiggyTools } from "@/tools/swiggy"
import { loadConfig } from "@/lib/config"
import { getLogger } from "@/lib/logger"

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
