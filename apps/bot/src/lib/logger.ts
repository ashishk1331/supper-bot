import pino from "pino"
import { loadConfig } from "./config"

let cached: pino.Logger | null = null

export function getLogger(): pino.Logger {
  if (cached) return cached
  const config = loadConfig()
  cached = pino({
    level: config.LOG_LEVEL,
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
  })
  return cached
}
