import { ToolError } from "@/lib/errors"
import { type SwiggyMcpKind, getMcpClient } from "@/mcp/client"

/**
 * Thin pass-through wrapper around `Client.callTool`. Each high-level Swiggy
 * tool registered in `tools/swiggy/` calls this with a fixed `(kind, name)`
 * pair plus user-supplied arguments. Returns the raw structured content from
 * the MCP server — caller is responsible for shaping it for the LLM.
 */
export async function callSwiggy(
  kind: SwiggyMcpKind,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = await getMcpClient(kind)
  const result = await client.callTool({ name, arguments: args })
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content
          .map((c) => (c.type === "text" ? c.text : ""))
          .join("\n")
          .trim()
      : "unknown MCP error"
    throw new ToolError(`swiggy_${name}`, `Swiggy ${kind} MCP error: ${text || "unknown"}`)
  }
  return result.structuredContent ?? result.content
}
