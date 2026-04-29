import { MemoryError } from "@/lib/errors"
import { getRedis } from "@/lib/redis"
import type { GraphEdge, GraphNode, NodeLabel } from "@supper-bot/types"

const GRAPH_KEY = "supper-graph"

const LABEL_RX = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertSafeLabel(label: string): void {
  if (!LABEL_RX.test(label)) {
    throw new MemoryError(`unsafe graph label/identifier: ${label}`)
  }
}

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function propsToCypher(props: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(props)) {
    assertSafeLabel(k)
    parts.push(`${k}: ${literal(v)}`)
  }
  return `{${parts.join(", ")}}`
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return "null"
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v === "boolean") return v ? "true" : "false"
  if (v instanceof Date) return `'${escapeString(v.toISOString())}'`
  // Fallback: coerce to JSON string and store as a string literal.
  const asString = typeof v === "string" ? v : JSON.stringify(v)
  return `'${escapeString(asString)}'`
}

async function graphCommand(cypher: string): Promise<unknown> {
  const redis = getRedis()
  return (redis as unknown as { call: (...a: unknown[]) => Promise<unknown> }).call(
    "GRAPH.QUERY",
    GRAPH_KEY,
    cypher,
    "--compact",
  )
}

export async function upsertNode(
  label: NodeLabel,
  id: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  assertSafeLabel(label)
  const merged = { id, ...props }
  const idLit = literal(id)
  const propsCypher = propsToCypher(merged)
  // MERGE on id; SET overwrites changed props.
  const cypher = `MERGE (n:${label} {id: ${idLit}}) SET n = ${propsCypher}`
  await graphCommand(cypher)
}

export async function upsertEdge(edge: GraphEdge): Promise<void> {
  assertSafeLabel(edge.from.label)
  assertSafeLabel(edge.to.label)
  assertSafeLabel(edge.rel)
  const fromId = literal(edge.from.id)
  const toId = literal(edge.to.id)
  const setClause = edge.props ? ` SET r = ${propsToCypher(edge.props)}` : ""
  const cypher = `MATCH (a:${edge.from.label} {id: ${fromId}}), (b:${edge.to.label} {id: ${toId}}) MERGE (a)-[r:${edge.rel}]->(b)${setClause}`
  await graphCommand(cypher)
}

export async function deleteEdge(from: GraphNode, rel: string, to: GraphNode): Promise<void> {
  assertSafeLabel(from.label)
  assertSafeLabel(to.label)
  assertSafeLabel(rel)
  const cypher =
    `MATCH (a:${from.label} {id: ${literal(from.id)}})-[r:${rel}]->` +
    `(b:${to.label} {id: ${literal(to.id)}}) DELETE r`
  await graphCommand(cypher)
}

export async function rawQuery(cypher: string): Promise<unknown> {
  return graphCommand(cypher)
}

export const __test = { propsToCypher, literal, assertSafeLabel }
