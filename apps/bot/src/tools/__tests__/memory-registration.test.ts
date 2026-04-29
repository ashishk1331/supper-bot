import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { registerMemoryTools } from "@/tools/memory"
import { clearRegistry, getTool, listTools } from "@/tools/registry"

const EXPECTED = [
  "memory_set_fact",
  "memory_get_user_context",
  "memory_get_group_context",
  "memory_get_suggestions",
  "memory_forget_user",
  "memory_export_user",
] as const

describe("registerMemoryTools", () => {
  beforeEach(() => clearRegistry())
  afterEach(() => clearRegistry())

  test("registers every architecture §8.3 memory tool", () => {
    registerMemoryTools()
    expect(
      listTools()
        .map((t) => t.name)
        .sort(),
    ).toEqual([...EXPECTED].sort())
  })

  test("memory_set_fact rejects empty key and bad scope", () => {
    registerMemoryTools()
    const t = getTool("memory_set_fact")
    expect(t?.inputSchema.safeParse({ scope: "user", scopeId: "u1", key: "" }).success).toBe(false)
    expect(
      t?.inputSchema.safeParse({ scope: "nonsense", scopeId: "u1", key: "k", value: 1 }).success,
    ).toBe(false)
    expect(
      t?.inputSchema.safeParse({
        scope: "user",
        scopeId: "u1",
        key: "dietary.restriction",
        value: "vegetarian",
      }).success,
    ).toBe(true)
  })

  test("memory_forget_user requires userId", () => {
    registerMemoryTools()
    const t = getTool("memory_forget_user")
    expect(t?.inputSchema.safeParse({}).success).toBe(false)
    expect(t?.inputSchema.safeParse({ userId: "u1" }).success).toBe(true)
  })
})
