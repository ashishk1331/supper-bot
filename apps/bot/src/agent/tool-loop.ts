import { getAnthropic } from "@/agent/llm-client"
import { loadConfig } from "@/lib/config"
import { newUuid } from "@/lib/id"
import { getLogger } from "@/lib/logger"
import { zodToJsonSchema } from "@/tools/json-schema"
import { listTools } from "@/tools/registry"
import type { ToolContext } from "@/tools/registry"
import type Anthropic from "@anthropic-ai/sdk"
import type { ChatMessage } from "@supper-bot/types"

interface RunOptions {
  systemPrompt: string
  history: ChatMessage[]
  userMessage: string
  toolContext: ToolContext
  maxIterations?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface RunResult {
  text: string
  newMessages: ChatMessage[]
}

const DEFAULT_MAX_ITERATIONS = 8
const DEFAULT_MAX_TOKENS = 1024

function chatToAnthropic(msg: ChatMessage): Anthropic.MessageParam | null {
  // Map our internal ChatMessage stream onto Anthropic's user/assistant turns.
  // Tool-call/tool-result interleaving from earlier turns is not replayed — we
  // only carry the user-visible text history; the current turn's tool loop is
  // assembled fresh below.
  if (msg.role === "user") {
    return {
      role: "user",
      content: msg.displayName ? `${msg.displayName}: ${msg.content}` : msg.content,
    }
  }
  if (msg.role === "assistant") {
    return { role: "assistant", content: msg.content }
  }
  return null
}

export async function runToolLoop(opts: RunOptions): Promise<RunResult> {
  const log = getLogger()
  const config = loadConfig()
  const client = getAnthropic()

  const tools = listTools().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.inputSchema) as unknown as Record<string, unknown>,
  }))

  const priorTurns = opts.history
    .map(chatToAnthropic)
    .filter((m): m is Anthropic.MessageParam => m !== null)

  const messages: Anthropic.MessageParam[] = [
    ...priorTurns,
    { role: "user", content: opts.userMessage },
  ]

  const newMessages: ChatMessage[] = []
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS

  let finalText = ""

  for (let iter = 0; iter < maxIterations; iter++) {
    if (opts.signal?.aborted) break
    const response = await client.messages.create(
      {
        model: config.LLM_MODEL,
        max_tokens: maxTokens,
        system: opts.systemPrompt,
        tools: tools as unknown as Anthropic.Messages.Tool[],
        messages,
      },
      opts.signal ? { signal: opts.signal } : undefined,
    )

    messages.push({ role: "assistant", content: response.content })

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    )
    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    )

    if (textBlocks.length > 0) {
      const text = textBlocks
        .map((b) => b.text)
        .join("\n")
        .trim()
      if (text) {
        newMessages.push({
          id: newUuid(),
          role: "assistant",
          content: text,
          timestamp: new Date(),
        })
        finalText = text
      }
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      break
    }

    // Execute tools and feed results back as a single user message.
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const def = listTools().find((t) => t.name === tu.name)
      if (!def) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: `Unknown tool: ${tu.name}`,
        })
        continue
      }
      let resultText: string
      let isError = false
      try {
        const parsed = def.inputSchema.safeParse(tu.input)
        if (!parsed.success) {
          isError = true
          resultText = `Input validation failed: ${parsed.error.message}`
        } else {
          const out = await def.execute(parsed.data, opts.toolContext)
          resultText = typeof out === "string" ? out : JSON.stringify(out)
        }
      } catch (err) {
        isError = true
        resultText = err instanceof Error ? err.message : String(err)
        log.error({ err, tool: tu.name }, "tool execution failed")
      }
      newMessages.push({
        id: newUuid(),
        role: "tool_call",
        content: JSON.stringify(tu.input),
        toolName: tu.name,
        toolPayload: tu.input as Record<string, unknown>,
        timestamp: new Date(),
      })
      newMessages.push({
        id: newUuid(),
        role: "tool_result",
        content: resultText,
        toolName: tu.name,
        timestamp: new Date(),
      })
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        is_error: isError,
        content: resultText.slice(0, 100_000),
      })
    }
    messages.push({ role: "user", content: toolResults })
  }

  if (!finalText) finalText = "(no response)"
  return { text: finalText, newMessages }
}
