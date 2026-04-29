import type { z } from "zod"

export interface JsonSchema {
  type?: string | string[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: unknown[]
  anyOf?: JsonSchema[]
  minimum?: number
  maximum?: number
  minLength?: number
  default?: unknown
}

/**
 * Convert a Zod schema into a JSON Schema fragment suitable for the
 * Anthropic Messages tools `input_schema` field. Supports the subset of Zod
 * used by supper-bot tool inputs: object, string, number, boolean, literal,
 * enum, union, array, record, optional, default, describe.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = (schema as { _def: { typeName: string } })._def
  const description = (schema as { description?: string }).description

  const wrap = (s: JsonSchema): JsonSchema => (description ? { ...s, description } : s)

  switch (def.typeName) {
    case "ZodString": {
      const checks =
        (def as unknown as { checks?: Array<{ kind: string; value?: number }> }).checks ?? []
      const minCheck = checks.find((c) => c.kind === "min")
      return wrap({
        type: "string",
        ...(minCheck?.value !== undefined ? { minLength: minCheck.value } : {}),
      })
    }
    case "ZodNumber": {
      const checks =
        (def as unknown as { checks?: Array<{ kind: string; value?: number }> }).checks ?? []
      const min = checks.find((c) => c.kind === "min")
      const max = checks.find((c) => c.kind === "max")
      return wrap({
        type: "number",
        ...(min?.value !== undefined ? { minimum: min.value } : {}),
        ...(max?.value !== undefined ? { maximum: max.value } : {}),
      })
    }
    case "ZodBoolean":
      return wrap({ type: "boolean" })
    case "ZodLiteral": {
      const value = (def as unknown as { value: unknown }).value
      return wrap({ enum: [value] })
    }
    case "ZodEnum": {
      const values = (def as unknown as { values: string[] }).values
      return wrap({ type: "string", enum: values })
    }
    case "ZodUnion": {
      const options = (def as unknown as { options: z.ZodTypeAny[] }).options
      return wrap({ anyOf: options.map(zodToJsonSchema) })
    }
    case "ZodArray": {
      const inner = (def as unknown as { type: z.ZodTypeAny }).type
      return wrap({ type: "array", items: zodToJsonSchema(inner) })
    }
    case "ZodObject": {
      const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape
      const properties: Record<string, JsonSchema> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value)
        if (!value.isOptional()) required.push(key)
      }
      return wrap({
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      })
    }
    case "ZodRecord": {
      return wrap({ type: "object", additionalProperties: true })
    }
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable": {
      const inner = (def as unknown as { innerType: z.ZodTypeAny }).innerType
      return wrap(zodToJsonSchema(inner))
    }
    case "ZodUnknown":
    case "ZodAny":
      return wrap({})
    default:
      return wrap({})
  }
}
