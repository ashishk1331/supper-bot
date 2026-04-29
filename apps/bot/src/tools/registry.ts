import type { MemoryService } from "@/memory/service"
import type { OrderSession, Platform } from "@supper-bot/types"
import type { ZodSchema } from "zod"

export interface ToolContext {
  session: OrderSession
  userId: string
  groupId: string
  platform: Platform
  memoryService: MemoryService
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  inputSchema: ZodSchema<TInput>
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>
}

const registry = new Map<string, ToolDefinition>()

export function registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
  if (registry.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`)
  }
  registry.set(tool.name, tool as ToolDefinition)
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name)
}

export function listTools(): ToolDefinition[] {
  return Array.from(registry.values())
}

export function clearRegistry(): void {
  registry.clear()
}
