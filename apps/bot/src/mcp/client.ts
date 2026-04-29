import { loadConfig } from "@/lib/config"
import { getLogger } from "@/lib/logger"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

export type SwiggyMcpKind = "food" | "instamart" | "dineout"

const clients = new Map<SwiggyMcpKind, Client>()
const pending = new Map<SwiggyMcpKind, Promise<Client>>()

function urlFor(kind: SwiggyMcpKind): string {
  const config = loadConfig()
  switch (kind) {
    case "food":
      return config.SWIGGY_MCP_FOOD_URL
    case "instamart":
      return config.SWIGGY_MCP_INSTAMART_URL
    case "dineout":
      return config.SWIGGY_MCP_DINEOUT_URL
  }
}

async function connect(kind: SwiggyMcpKind): Promise<Client> {
  const config = loadConfig()
  const log = getLogger()
  const headers: Record<string, string> = {}
  if (config.SWIGGY_API_TOKEN) {
    headers.Authorization = `Bearer ${config.SWIGGY_API_TOKEN}`
  }
  const transport = new StreamableHTTPClientTransport(new URL(urlFor(kind)), {
    requestInit: { headers },
  })
  const client = new Client({ name: "supper-bot", version: "0.0.0" }, { capabilities: {} })
  await client.connect(transport)
  log.info({ kind }, "swiggy mcp client connected")
  return client
}

export async function getMcpClient(kind: SwiggyMcpKind): Promise<Client> {
  const existing = clients.get(kind)
  if (existing) return existing
  const inflight = pending.get(kind)
  if (inflight) return inflight

  const promise = connect(kind)
    .then((c) => {
      clients.set(kind, c)
      pending.delete(kind)
      return c
    })
    .catch((err) => {
      pending.delete(kind)
      throw err
    })
  pending.set(kind, promise)
  return promise
}

export async function closeMcpClients(): Promise<void> {
  const all = Array.from(clients.values())
  clients.clear()
  pending.clear()
  await Promise.all(all.map((c) => c.close().catch(() => undefined)))
}
