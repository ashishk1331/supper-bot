// Rough token estimator. Real implementation should use Anthropic's count-tokens
// endpoint or a tokenizer library. For now: ~4 chars per token heuristic.
const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateJsonTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value))
}
