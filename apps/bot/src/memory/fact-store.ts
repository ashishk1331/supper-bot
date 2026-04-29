import { getDb, schema } from "@/db/client"
import { newHumanId } from "@/lib/id"
import type { MemoryEvent, MemoryFact, MemoryScope, MemorySource } from "@supper-bot/types"
import { and, desc, eq, like } from "drizzle-orm"

type FactRow = typeof schema.memoryFacts.$inferSelect

function rowToFact(row: FactRow): MemoryFact {
  return {
    id: row.id,
    scope: row.scope as MemoryScope,
    scopeId: row.scopeId,
    key: row.key,
    value: row.value,
    confidence: row.confidence,
    source: row.source as MemorySource,
    reinforceCount: row.reinforceCount,
    ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export interface SetFactOptions {
  source?: MemorySource
  confidence?: number
  expiresAt?: Date
  reinforce?: boolean
  triggeredBy?: MemoryEvent["triggeredBy"]
  sessionId?: string
}

export async function setFact(
  scope: MemoryScope,
  scopeId: string,
  key: string,
  value: unknown,
  options: SetFactOptions = {},
): Promise<MemoryFact> {
  const db = getDb()
  const now = new Date()
  const existing = await getFact(scope, scopeId, key)

  if (existing) {
    const nextReinforceCount = options.reinforce
      ? existing.reinforceCount + 1
      : existing.reinforceCount
    const updated = await db
      .update(schema.memoryFacts)
      .set({
        value: value as never,
        confidence: options.confidence ?? existing.confidence,
        source: options.source ?? existing.source,
        reinforceCount: nextReinforceCount,
        expiresAt: options.expiresAt ?? existing.expiresAt ?? null,
        updatedAt: now,
      })
      .where(eq(schema.memoryFacts.id, existing.id))
      .returning()
    await db.insert(schema.memoryEvents).values({
      memoryId: existing.id,
      eventType: options.reinforce ? "reinforced" : "updated",
      prevValue: existing.value as never,
      nextValue: value as never,
      sessionId: options.sessionId ?? null,
      triggeredBy: options.triggeredBy ?? "agent",
    })
    return rowToFact(updated[0] as FactRow)
  }

  const id = newHumanId()
  const inserted = await db
    .insert(schema.memoryFacts)
    .values({
      id,
      scope,
      scopeId,
      key,
      value: value as never,
      confidence: options.confidence ?? 1,
      source: options.source ?? "explicit",
      reinforceCount: 0,
      expiresAt: options.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  await db.insert(schema.memoryEvents).values({
    memoryId: id,
    eventType: "created",
    nextValue: value as never,
    sessionId: options.sessionId ?? null,
    triggeredBy: options.triggeredBy ?? "agent",
  })
  return rowToFact(inserted[0] as FactRow)
}

export async function getFact(
  scope: MemoryScope,
  scopeId: string,
  key: string,
): Promise<MemoryFact | null> {
  const rows = await getDb()
    .select()
    .from(schema.memoryFacts)
    .where(
      and(
        eq(schema.memoryFacts.scope, scope),
        eq(schema.memoryFacts.scopeId, scopeId),
        eq(schema.memoryFacts.key, key),
      ),
    )
    .limit(1)
  return rows[0] ? rowToFact(rows[0]) : null
}

export async function getFacts(
  scope: MemoryScope,
  scopeId: string,
  keyPrefix?: string,
): Promise<MemoryFact[]> {
  const conds = [eq(schema.memoryFacts.scope, scope), eq(schema.memoryFacts.scopeId, scopeId)]
  if (keyPrefix) conds.push(like(schema.memoryFacts.key, `${keyPrefix}%`))
  const rows = await getDb()
    .select()
    .from(schema.memoryFacts)
    .where(and(...conds))
    .orderBy(desc(schema.memoryFacts.updatedAt))
  return rows.map(rowToFact)
}

export async function deleteFact(scope: MemoryScope, scopeId: string, key?: string): Promise<void> {
  const db = getDb()
  const conds = [eq(schema.memoryFacts.scope, scope), eq(schema.memoryFacts.scopeId, scopeId)]
  if (key) conds.push(eq(schema.memoryFacts.key, key))
  const removed = await db
    .delete(schema.memoryFacts)
    .where(and(...conds))
    .returning({ id: schema.memoryFacts.id })
  if (removed.length === 0) return
  await db.insert(schema.memoryEvents).values(
    removed.map((r) => ({
      memoryId: r.id,
      eventType: "deleted" as const,
      triggeredBy: "agent" as const,
    })),
  )
}

export async function deleteAllByUser(userId: string): Promise<void> {
  await deleteFact("user", userId)
}

export async function exportByUser(userId: string): Promise<MemoryFact[]> {
  return getFacts("user", userId)
}
