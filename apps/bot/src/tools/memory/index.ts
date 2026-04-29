import { type ToolDefinition, registerTool } from "@/tools/registry"
import { z } from "zod"

const ScopeSchema = z.enum(["user", "group", "session", "global"])

const setFactInput = z.object({
  scope: ScopeSchema,
  scopeId: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["explicit", "inferred", "observed"]).optional(),
  reinforce: z.boolean().optional(),
})

const getUserContextInput = z.object({
  userId: z.string().min(1),
  displayName: z.string().optional(),
})

const getGroupContextInput = z.object({})

const getSuggestionsInput = z.object({
  groupId: z.string().optional(),
})

const forgetUserInput = z.object({
  userId: z.string().min(1),
})

const exportUserInput = z.object({
  userId: z.string().min(1),
})

function tool<S extends z.ZodTypeAny>(
  name: string,
  description: string,
  inputSchema: S,
  execute: ToolDefinition<z.infer<S>, unknown>["execute"],
): ToolDefinition<z.infer<S>, unknown> {
  return { name, description, inputSchema, execute }
}

export function registerMemoryTools(): void {
  registerTool(
    tool(
      "memory_set_fact",
      "Persist a scoped key-value fact (user/group/session/global). Pass reinforce=true when re-observing an existing fact.",
      setFactInput,
      async (input, ctx) =>
        ctx.memoryService.setFact(input.scope, input.scopeId, input.key, input.value, {
          ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
          ...(input.source ? { source: input.source } : {}),
        }),
    ),
  )

  registerTool(
    tool(
      "memory_get_user_context",
      "Fetch facts, liked dishes, and recent orders for a user.",
      getUserContextInput,
      async (input, ctx) => ctx.memoryService.getUserContext(input.userId, input.displayName),
    ),
  )

  registerTool(
    tool(
      "memory_get_group_context",
      "Fetch facts, usual restaurants, and recent sessions for the current group.",
      getGroupContextInput,
      async (_input, ctx) => ctx.memoryService.getGroupContext(ctx.platform, ctx.groupId),
    ),
  )

  registerTool(
    tool(
      "memory_get_suggestions",
      "Suggest dishes, restaurants, or reorders that fit the group's known preferences.",
      getSuggestionsInput,
      async (input, ctx) => ctx.memoryService.getSuggestions(input.groupId ?? ctx.groupId),
    ),
  )

  registerTool(
    tool(
      "memory_forget_user",
      "Wipe all stored facts for a specific user (privacy / GDPR-style erasure).",
      forgetUserInput,
      async (input, ctx) => {
        await ctx.memoryService.forgetUser(input.userId)
        return { ok: true }
      },
    ),
  )

  registerTool(
    tool(
      "memory_export_user",
      "Export everything stored about a user (facts + archived sessions they participated in).",
      exportUserInput,
      async (input, ctx) => ctx.memoryService.exportUser(input.userId),
    ),
  )
}
