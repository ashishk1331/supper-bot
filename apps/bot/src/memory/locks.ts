import { randomUUID } from "node:crypto"
import { MemoryError } from "@/lib/errors"
import { getRedis } from "@/lib/redis"

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`

export async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const token = randomUUID()
  const redis = getRedis()
  const res = await redis.set(key, token, "PX", ttlMs, "NX")
  return res === "OK" ? token : null
}

export async function releaseLock(key: string, token: string): Promise<boolean> {
  const redis = getRedis()
  const res = (await redis.eval(RELEASE_LUA, 1, key, token)) as number
  return res === 1
}

export interface WithLockOptions {
  ttlMs?: number
  retryDelayMs?: number
  maxAttempts?: number
}

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts: WithLockOptions = {},
): Promise<T> {
  const ttlMs = opts.ttlMs ?? 5_000
  const retryDelayMs = opts.retryDelayMs ?? 50
  const maxAttempts = opts.maxAttempts ?? 40 // ~2s default

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = await acquireLock(key, ttlMs)
    if (token) {
      try {
        return await fn()
      } finally {
        await releaseLock(key, token).catch(() => undefined)
      }
    }
    await new Promise((r) => setTimeout(r, retryDelayMs))
  }
  throw new MemoryError(`failed to acquire lock for ${key} after ${maxAttempts} attempts`)
}
