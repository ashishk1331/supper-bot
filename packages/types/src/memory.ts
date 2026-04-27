import type { ArchivedSession } from "./session"

export type MemoryScope = "user" | "group" | "session" | "global"
export type MemorySource = "explicit" | "inferred" | "observed"

export interface MemoryFact {
  id: string
  scope: MemoryScope
  scopeId: string
  key: string
  value: unknown
  confidence: number
  source: MemorySource
  reinforceCount: number
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface MemoryEvent {
  id: string
  memoryId: string
  eventType: "created" | "updated" | "reinforced" | "contradicted" | "expired" | "deleted"
  prevValue?: unknown
  nextValue?: unknown
  sessionId?: string
  triggeredBy: "agent" | "user" | "system"
  createdAt: Date
}

export type NodeLabel = string
export type EdgeLabel = string

export interface GraphNode {
  id: string
  label: NodeLabel
  props: Record<string, unknown>
}

export interface GraphEdge {
  from: GraphNode
  rel: EdgeLabel
  to: GraphNode
  props?: Record<string, unknown>
}

export interface UserContext {
  userId: string
  displayName: string
  facts: MemoryFact[]
  likedDishes: GraphNode[]
  dislikedDishes: GraphNode[]
  preferredRestaurants: GraphNode[]
  frequentOrderPartners: GraphNode[]
  recentOrders: ArchivedSession[]
}

export interface GroupContext {
  groupId: string
  platform: string
  facts: MemoryFact[]
  members: GraphNode[]
  usualRestaurants: GraphNode[]
  sharedAffinities: GraphNode[]
  knownConflicts: GraphNode[]
  recentSessions: ArchivedSession[]
}

export interface Suggestion {
  type: "restaurant" | "dish" | "reorder"
  entity: GraphNode
  reason: string
  score: number
}

export interface ExtractionFact {
  scopeId: string
  key: string
  value: unknown
  confidence: number
  source: MemorySource
  shouldReinforce: boolean
  shouldContradict: boolean
}

export interface GraphUpdate {
  operation: "upsert" | "delete"
  from: GraphNode
  rel: EdgeLabel
  to: GraphNode
  props?: Record<string, unknown>
}

export interface ExtractionInput {
  session: ArchivedSession
  existingUserFacts: Record<string, MemoryFact[]>
  existingGroupFacts: MemoryFact[]
  existingGraphEdges: GraphEdge[]
}

export interface ExtractionResult {
  userFacts: ExtractionFact[]
  groupFacts: ExtractionFact[]
  graphUpdates: GraphUpdate[]
}
