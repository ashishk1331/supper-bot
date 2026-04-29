import type { Platform } from "@supper-bot/types"

/**
 * Per-(platform, groupId) interrupt + coalesce: when a new triggered message
 * arrives while a previous LLM turn is still running for the same group, we
 * abort the in-flight Anthropic call, append the new user message to the
 * chat window, wait a short jitter window, then re-run. Mid-jitter, an even
 * newer message can preempt us, so a burst of N messages collapses into one
 * surviving LLM call that sees all N user messages in context.
 *
 * Process-local. Multi-instance deployments would need a Redis-backed
 * variant keyed by `coalesce:{platform}:{groupId}` with a fencing token.
 */

const inflight = new Map<string, AbortController>()

export const COALESCE_JITTER_BASE_MS = 250
export const COALESCE_JITTER_RANGE_MS = 250

const key = (p: Platform, g: string) => `${p}:${g}`

export type CoalesceResult<T> =
  | { ran: true; value: T }
  | { ran: false; reason: "preempted" | "aborted_before_run" }

export async function coalesce<T>(
  platform: Platform,
  groupId: string,
  fn: (signal: AbortSignal) => Promise<T>,
  jitter: { baseMs: number; rangeMs: number } = {
    baseMs: COALESCE_JITTER_BASE_MS,
    rangeMs: COALESCE_JITTER_RANGE_MS,
  },
): Promise<CoalesceResult<T>> {
  const k = key(platform, groupId)
  const previous = inflight.get(k)
  const controller = new AbortController()
  inflight.set(k, controller)

  if (previous) {
    previous.abort()
    const wait = jitter.baseMs + Math.random() * jitter.rangeMs
    await sleepUntilAborted(wait, controller.signal)
    if (inflight.get(k) !== controller || controller.signal.aborted) {
      // A newer message took our slot during jitter — let it carry the response.
      return { ran: false, reason: "preempted" }
    }
  }

  try {
    if (controller.signal.aborted) return { ran: false, reason: "aborted_before_run" }
    const value = await fn(controller.signal)
    return { ran: true, value }
  } finally {
    if (inflight.get(k) === controller) inflight.delete(k)
  }
}

function sleepUntilAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

// Test helper.
export function __resetCoalescer(): void {
  for (const c of inflight.values()) c.abort()
  inflight.clear()
}
