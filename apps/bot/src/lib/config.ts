import { z } from "zod"

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"))

const ConfigSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().default("claude-sonnet-4-20250514"),

    SWIGGY_MCP_FOOD_URL: z.string().url(),
    SWIGGY_MCP_INSTAMART_URL: z.string().url(),
    SWIGGY_MCP_DINEOUT_URL: z.string().url(),
    SWIGGY_API_TOKEN: z.string().optional().default(""),

    SLACK_ENABLED: boolFromString.default(false),
    SLACK_BOT_TOKEN: z.string().optional().default(""),
    SLACK_APP_TOKEN: z.string().optional().default(""),

    DISCORD_ENABLED: boolFromString.default(false),
    DISCORD_BOT_TOKEN: z.string().optional().default(""),

    TELEGRAM_ENABLED: boolFromString.default(false),
    TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
    TELEGRAM_USE_WEBHOOK: boolFromString.default(false),
    TELEGRAM_WEBHOOK_URL: z.string().optional().default(""),

    DATABASE_URL: z.string().min(1),
    FALKORDB_URL: z.string().min(1),
    DB_USER: z.string().optional().default(""),
    DB_PASSWORD: z.string().optional().default(""),
    DB_NAME: z.string().optional().default(""),

    SESSION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(120),
    VOTING_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
    MEMORY_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
    AMBIENT_BUFFER_SIZE: z.coerce.number().int().positive().default(20),
    AMBIENT_BUFFER_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    DEFAULT_TIMEZONE: z.string().default("Asia/Kolkata"),
    PORT: z.coerce.number().int().positive().default(3000),

    QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
    QUEUE_ATTEMPTS: z.coerce.number().int().positive().default(3),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    SENTRY_DSN: z.string().optional().default(""),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.SLACK_ENABLED && (!cfg.SLACK_BOT_TOKEN || !cfg.SLACK_APP_TOKEN)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SLACK_BOT_TOKEN and SLACK_APP_TOKEN required when SLACK_ENABLED=true",
      })
    }
    if (cfg.DISCORD_ENABLED && !cfg.DISCORD_BOT_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DISCORD_BOT_TOKEN required when DISCORD_ENABLED=true",
      })
    }
    if (cfg.TELEGRAM_ENABLED && !cfg.TELEGRAM_BOT_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TELEGRAM_BOT_TOKEN required when TELEGRAM_ENABLED=true",
      })
    }
    if (cfg.TELEGRAM_USE_WEBHOOK && !cfg.TELEGRAM_WEBHOOK_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TELEGRAM_WEBHOOK_URL required when TELEGRAM_USE_WEBHOOK=true",
      })
    }
  })

export type Config = z.infer<typeof ConfigSchema>

let cached: Config | null = null

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n")
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  cached = parsed.data
  return cached
}
