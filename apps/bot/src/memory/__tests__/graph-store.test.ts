import { describe, expect, test } from "bun:test"
import { MemoryError } from "@/lib/errors"
import { __test } from "@/memory/graph-store"

describe("graph-store cypher generation", () => {
  test("literal escapes single quotes and backslashes", () => {
    expect(__test.literal("o'reilly")).toBe("'o\\'reilly'")
    expect(__test.literal("a\\b")).toBe("'a\\\\b'")
  })

  test("literal handles primitives", () => {
    expect(__test.literal(42)).toBe("42")
    expect(__test.literal(true)).toBe("true")
    expect(__test.literal(null)).toBe("null")
  })

  test("propsToCypher emits sanitised key:value pairs", () => {
    const out = __test.propsToCypher({ id: "u1", name: "Rahul", age: 30 })
    expect(out).toBe("{id: 'u1', name: 'Rahul', age: 30}")
  })

  test("rejects unsafe identifiers", () => {
    expect(() => __test.assertSafeLabel("User; DROP")).toThrow(MemoryError)
    expect(() => __test.propsToCypher({ "bad-key": 1 })).toThrow(MemoryError)
  })
})
