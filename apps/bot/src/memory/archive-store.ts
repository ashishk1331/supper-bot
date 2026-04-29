import { getDb, schema } from "@/db/client"
import type { ArchivedParticipant, ArchivedSession } from "@supper-bot/types"
import { desc, eq } from "drizzle-orm"

type SessionRow = typeof schema.archivedSessions.$inferSelect
type ParticipantRow = typeof schema.archivedParticipants.$inferSelect

function rowToSession(row: SessionRow, participants: ArchivedParticipant[]): ArchivedSession {
  return {
    sessionId: row.sessionId,
    orderId: row.orderId,
    groupId: row.groupId,
    platform: row.platform as ArchivedSession["platform"],
    partyLeaderId: row.partyLeaderId,
    ...(row.restaurantId ? { restaurantId: row.restaurantId } : {}),
    ...(row.restaurantName ? { restaurantName: row.restaurantName } : {}),
    participants,
    ...(row.totalAmount != null ? { totalAmount: row.totalAmount } : {}),
    ...(row.deliveryAddress
      ? { deliveryAddress: row.deliveryAddress as Record<string, unknown> }
      : {}),
    ...(row.swiggyOrderId ? { swiggyOrderId: row.swiggyOrderId } : {}),
    status: row.status as ArchivedSession["status"],
    chatHistory: (row.chatHistory ?? []) as ArchivedSession["chatHistory"],
    ...(row.chatSummary ? { chatSummary: row.chatSummary } : {}),
    ...(row.placedAt ? { placedAt: row.placedAt } : {}),
    createdAt: row.createdAt,
  }
}

function rowToParticipant(row: ParticipantRow): ArchivedParticipant {
  return {
    userId: row.userId,
    displayName: row.displayName,
    items: (row.items ?? []) as ArchivedParticipant["items"],
    subtotal: row.subtotal,
  }
}

export async function persistArchivedSession(session: ArchivedSession): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.archivedSessions)
      .values({
        sessionId: session.sessionId,
        orderId: session.orderId,
        groupId: session.groupId,
        platform: session.platform,
        partyLeaderId: session.partyLeaderId,
        restaurantId: session.restaurantId ?? null,
        restaurantName: session.restaurantName ?? null,
        totalAmount: session.totalAmount ?? null,
        deliveryAddress: (session.deliveryAddress ?? null) as never,
        swiggyOrderId: session.swiggyOrderId ?? null,
        status: session.status,
        chatHistory: session.chatHistory as never,
        chatSummary: session.chatSummary ?? null,
        placedAt: session.placedAt ?? null,
        createdAt: session.createdAt,
      })
      .onConflictDoNothing({ target: schema.archivedSessions.sessionId })
    if (session.participants.length > 0) {
      await tx.insert(schema.archivedParticipants).values(
        session.participants.map((p) => ({
          sessionId: session.sessionId,
          userId: p.userId,
          displayName: p.displayName,
          items: p.items as never,
          subtotal: p.subtotal,
        })),
      )
    }
  })
}

export async function getArchivedSession(sessionId: string): Promise<ArchivedSession | null> {
  const db = getDb()
  const sessions = await db
    .select()
    .from(schema.archivedSessions)
    .where(eq(schema.archivedSessions.sessionId, sessionId))
    .limit(1)
  const row = sessions[0]
  if (!row) return null
  const parts = await db
    .select()
    .from(schema.archivedParticipants)
    .where(eq(schema.archivedParticipants.sessionId, sessionId))
  return rowToSession(row, parts.map(rowToParticipant))
}

export async function recentArchivedByGroup(
  groupId: string,
  limit = 10,
): Promise<ArchivedSession[]> {
  const db = getDb()
  const sessions = await db
    .select()
    .from(schema.archivedSessions)
    .where(eq(schema.archivedSessions.groupId, groupId))
    .orderBy(desc(schema.archivedSessions.createdAt))
    .limit(limit)
  if (sessions.length === 0) return []
  const ids = sessions.map((s) => s.sessionId)
  const parts = await db.select().from(schema.archivedParticipants)
  const byId = new Map<string, ParticipantRow[]>()
  for (const p of parts) {
    if (!ids.includes(p.sessionId)) continue
    const arr = byId.get(p.sessionId) ?? []
    arr.push(p)
    byId.set(p.sessionId, arr)
  }
  return sessions.map((s) => rowToSession(s, (byId.get(s.sessionId) ?? []).map(rowToParticipant)))
}

export async function recentArchivedByUser(userId: string, limit = 10): Promise<ArchivedSession[]> {
  const db = getDb()
  const parts = await db
    .select()
    .from(schema.archivedParticipants)
    .where(eq(schema.archivedParticipants.userId, userId))
    .limit(limit * 4)
  if (parts.length === 0) return []
  const ids = Array.from(new Set(parts.map((p) => p.sessionId))).slice(0, limit)
  const out: ArchivedSession[] = []
  for (const id of ids) {
    const s = await getArchivedSession(id)
    if (s) out.push(s)
  }
  return out
}
