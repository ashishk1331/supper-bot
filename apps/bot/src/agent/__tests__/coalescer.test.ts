import { afterEach, describe, expect, test } from "bun:test"
import { __resetCoalescer, coalesce } from "@/agent/coalescer"

afterEach(() => __resetCoalescer())

const FAST_JITTER = { baseMs: 5, rangeMs: 5 }

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe("coalesce", () => {
  test("solo call runs immediately", async () => {
    const result = await coalesce("slack", "G1", async () => 42, FAST_JITTER)
    expect(result.ran).toBe(true)
    if (result.ran) expect(result.value).toBe(42)
  })

  test("second call interrupts the first via abort signal", async () => {
    const first = defer<string>()
    const aborted = defer<true>()

    const firstPromise = coalesce(
      "slack",
      "G1",
      async (signal) => {
        signal.addEventListener("abort", () => aborted.resolve(true), { once: true })
        return first.promise
      },
      FAST_JITTER,
    )

    // Yield so the first call registers its slot.
    await new Promise((r) => setTimeout(r, 1))

    const secondPromise = coalesce("slack", "G1", async () => "second", FAST_JITTER)

    expect(await aborted.promise).toBe(true)
    first.resolve("never-sent")

    const firstRes = await firstPromise
    const secondRes = await secondPromise
    expect(firstRes.ran).toBe(true) // first finished — but its result is discarded by caller
    expect(secondRes.ran).toBe(true)
    if (secondRes.ran) expect(secondRes.value).toBe("second")
  })

  test("burst of three collapses: first aborted, second preempted during jitter, third runs", async () => {
    const first = defer<string>()
    const ranThird = { value: false }

    const p1 = coalesce(
      "slack",
      "G1",
      async (signal) => {
        signal.addEventListener("abort", () => first.resolve("aborted"), { once: true })
        return first.promise
      },
      { baseMs: 50, rangeMs: 0 },
    )
    await new Promise((r) => setTimeout(r, 1))

    // Second enters; it will sit in jitter (50ms).
    const p2 = coalesce("slack", "G1", async () => "second-runs", { baseMs: 50, rangeMs: 0 })
    await new Promise((r) => setTimeout(r, 1))

    // Third enters during second's jitter, preempts second.
    const p3 = coalesce(
      "slack",
      "G1",
      async () => {
        ranThird.value = true
        return "third-runs"
      },
      { baseMs: 50, rangeMs: 0 },
    )

    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    expect(r1.ran).toBe(true) // first's promise resolved (with "aborted") after abort
    expect(r2.ran).toBe(false)
    if (!r2.ran) expect(r2.reason).toBe("preempted")
    expect(r3.ran).toBe(true)
    expect(ranThird.value).toBe(true)
  })

  test("different groups do not interfere", async () => {
    const a = defer<string>()
    const pA = coalesce("slack", "GA", async () => a.promise, FAST_JITTER)
    await new Promise((r) => setTimeout(r, 1))
    const pB = coalesce("slack", "GB", async () => "b-ok", FAST_JITTER)
    a.resolve("a-ok")
    const [rA, rB] = await Promise.all([pA, pB])
    expect(rA.ran).toBe(true)
    expect(rB.ran).toBe(true)
    if (rA.ran) expect(rA.value).toBe("a-ok")
    if (rB.ran) expect(rB.value).toBe("b-ok")
  })
})
