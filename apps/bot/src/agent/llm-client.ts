import { loadConfig } from "@/lib/config"
import Anthropic from "@anthropic-ai/sdk"

let cached: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (cached) return cached
  const config = loadConfig()
  cached = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  return cached
}
