import { loadConfig } from "@/lib/config"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

let cachedClient: ReturnType<typeof postgres> | null = null
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (cachedDb) return cachedDb
  const config = loadConfig()
  cachedClient = postgres(config.DATABASE_URL, { max: 10 })
  cachedDb = drizzle(cachedClient, { schema })
  return cachedDb
}

export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end()
    cachedClient = null
    cachedDb = null
  }
}

export { schema }
