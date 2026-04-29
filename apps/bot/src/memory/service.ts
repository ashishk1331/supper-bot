import {
  getArchivedSession,
  recentArchivedByGroup,
  recentArchivedByUser,
} from "@/memory/archive-store"
import { extractFromSession } from "@/memory/extraction-engine"
import * as factStore from "@/memory/fact-store"
import { setFact } from "@/memory/fact-store"
import * as graphStore from "@/memory/graph-store"
import * as workingMemory from "@/memory/working-memory"
import type {
  ActiveChatWindow,
  ArchivedSession,
  ChatMessage,
  ExtractionResult,
  GraphEdge,
  GraphNode,
  GroupContext,
  MemoryFact,
  MemoryScope,
  MemorySource,
  NodeLabel,
  OrderSession,
  Platform,
  Suggestion,
  UserContext,
} from "@supper-bot/types"

export interface MemoryService {
  // Fact store (Postgres)
  setFact(
    scope: MemoryScope,
    scopeId: string,
    key: string,
    value: unknown,
    options?: { source?: MemorySource; confidence?: number; expiresAt?: Date },
  ): Promise<MemoryFact>
  getFact(scope: MemoryScope, scopeId: string, key: string): Promise<MemoryFact | null>
  getFacts(scope: MemoryScope, scopeId: string, keyPrefix?: string): Promise<MemoryFact[]>
  deleteFact(scope: MemoryScope, scopeId: string, key?: string): Promise<void>

  // Graph store (FalkorDB)
  upsertNode(label: NodeLabel, id: string, props: Record<string, unknown>): Promise<void>
  upsertEdge(edge: GraphEdge): Promise<void>
  deleteEdge(from: GraphNode, rel: string, to: GraphNode): Promise<void>

  // Working memory
  getSession(platform: Platform, groupId: string): Promise<OrderSession | null>
  setSession(session: OrderSession): Promise<void>
  deleteSession(platform: Platform, groupId: string): Promise<void>
  getChatWindow(sessionId: string): Promise<ActiveChatWindow | null>
  appendMessage(sessionId: string, groupId: string, message: ChatMessage): Promise<void>

  // Aggregated context
  getUserContext(userId: string, displayName?: string): Promise<UserContext>
  getGroupContext(platform: Platform, groupId: string): Promise<GroupContext>
  getSuggestions(groupId: string): Promise<Suggestion[]>

  // Archive + extraction
  getArchivedSession(sessionId: string): Promise<ArchivedSession | null>
  extractAndPersist(session: ArchivedSession): Promise<ExtractionResult>

  // Privacy
  forgetUser(userId: string): Promise<void>
  exportUser(userId: string): Promise<{ facts: MemoryFact[]; sessions: ArchivedSession[] }>
}

class DefaultMemoryService implements MemoryService {
  setFact(
    scope: MemoryScope,
    scopeId: string,
    key: string,
    value: unknown,
    options?: { source?: MemorySource; confidence?: number; expiresAt?: Date },
  ) {
    return factStore.setFact(scope, scopeId, key, value, options)
  }
  getFact(scope: MemoryScope, scopeId: string, key: string) {
    return factStore.getFact(scope, scopeId, key)
  }
  getFacts(scope: MemoryScope, scopeId: string, keyPrefix?: string) {
    return factStore.getFacts(scope, scopeId, keyPrefix)
  }
  deleteFact(scope: MemoryScope, scopeId: string, key?: string) {
    return factStore.deleteFact(scope, scopeId, key)
  }

  upsertNode(label: NodeLabel, id: string, props: Record<string, unknown>) {
    return graphStore.upsertNode(label, id, props)
  }
  upsertEdge(edge: GraphEdge) {
    return graphStore.upsertEdge(edge)
  }
  deleteEdge(from: GraphNode, rel: string, to: GraphNode) {
    return graphStore.deleteEdge(from, rel, to)
  }

  getSession(platform: Platform, groupId: string) {
    return workingMemory.getSession(platform, groupId)
  }
  async setSession(session: OrderSession) {
    await workingMemory.setSession(session)
  }
  deleteSession(platform: Platform, groupId: string) {
    return workingMemory.deleteSession(platform, groupId)
  }
  getChatWindow(sessionId: string) {
    return workingMemory.getChatWindow(sessionId)
  }
  async appendMessage(sessionId: string, groupId: string, message: ChatMessage) {
    await workingMemory.appendMessage(sessionId, groupId, message)
  }

  async getUserContext(userId: string, displayName = userId): Promise<UserContext> {
    const [facts, recentOrders] = await Promise.all([
      factStore.getFacts("user", userId),
      recentArchivedByUser(userId, 5),
    ])
    return {
      userId,
      displayName,
      facts,
      likedDishes: [],
      dislikedDishes: [],
      preferredRestaurants: [],
      frequentOrderPartners: [],
      recentOrders,
    }
  }

  async getGroupContext(platform: Platform, groupId: string): Promise<GroupContext> {
    const [facts, recentSessions] = await Promise.all([
      factStore.getFacts("group", groupId),
      recentArchivedByGroup(groupId, 5),
    ])
    return {
      groupId,
      platform,
      facts,
      members: [],
      usualRestaurants: [],
      sharedAffinities: [],
      knownConflicts: [],
      recentSessions,
    }
  }

  async getSuggestions(_groupId: string): Promise<Suggestion[]> {
    // Layer-6 graph queries land here.
    return []
  }

  getArchivedSession(sessionId: string) {
    return getArchivedSession(sessionId)
  }

  async extractAndPersist(session: ArchivedSession): Promise<ExtractionResult> {
    const result = await extractFromSession(session)
    for (const f of result.userFacts) {
      await setFact("user", f.scopeId, f.key, f.value, {
        source: f.source,
        confidence: f.confidence,
        reinforce: f.shouldReinforce,
        sessionId: session.sessionId,
      })
    }
    for (const f of result.groupFacts) {
      await setFact("group", f.scopeId, f.key, f.value, {
        source: f.source,
        confidence: f.confidence,
        reinforce: f.shouldReinforce,
        sessionId: session.sessionId,
      })
    }
    for (const u of result.graphUpdates) {
      if (u.operation === "upsert") {
        await graphStore.upsertNode(u.from.label, u.from.id, u.from.props)
        await graphStore.upsertNode(u.to.label, u.to.id, u.to.props)
        await graphStore.upsertEdge({
          from: u.from,
          rel: u.rel,
          to: u.to,
          ...(u.props ? { props: u.props } : {}),
        })
      } else {
        await graphStore.deleteEdge(u.from, u.rel, u.to)
      }
    }
    return result
  }

  async forgetUser(userId: string): Promise<void> {
    await factStore.deleteAllByUser(userId)
  }

  async exportUser(userId: string) {
    const [facts, sessions] = await Promise.all([
      factStore.exportByUser(userId),
      recentArchivedByUser(userId, 100),
    ])
    return { facts, sessions }
  }
}

let cached: MemoryService | null = null

export function getMemoryService(): MemoryService {
  if (cached) return cached
  cached = new DefaultMemoryService()
  return cached
}

export function setMemoryService(svc: MemoryService): void {
  cached = svc
}
