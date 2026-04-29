import { describe, expect, test } from "bun:test"
import { zodToJsonSchema } from "@/tools/json-schema"
import { z } from "zod"

describe("zodToJsonSchema", () => {
  test("primitive strings + numbers + booleans", () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: "string" })
    expect(zodToJsonSchema(z.number().int().positive())).toEqual({
      type: "number",
      minimum: 0,
    })
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: "boolean" })
  })

  test("object with required + optional fields", () => {
    const schema = z.object({
      addressId: z.string().min(1).describe("delivery id"),
      offset: z.number().int().nonnegative().optional(),
    })
    const out = zodToJsonSchema(schema)
    expect(out.type).toBe("object")
    expect(out.required).toEqual(["addressId"])
    expect(out.properties?.addressId).toMatchObject({ type: "string", description: "delivery id" })
    expect(out.additionalProperties).toBe(false)
  })

  test("array + enum + literal", () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: "array",
      items: { type: "string" },
    })
    expect(zodToJsonSchema(z.enum(["a", "b"]))).toEqual({ type: "string", enum: ["a", "b"] })
    expect(zodToJsonSchema(z.literal(1))).toEqual({ enum: [1] })
  })

  test("union maps to anyOf", () => {
    const out = zodToJsonSchema(z.union([z.literal(0), z.literal(1)]))
    expect(out.anyOf).toBeDefined()
    expect(out.anyOf?.length).toBe(2)
  })
})
