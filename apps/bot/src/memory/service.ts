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
  query<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<T[]>

  // Working memory (FalkorDB / Redis)
  getSession(platform: Platform, groupId: string): Promise<OrderSession | null>
  setSession(session: OrderSession): Promise<void>
  deleteSession(platform: Platform, groupId: string): Promise<void>
  getChatWindow(sessionId: string): Promise<ActiveChatWindow>
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>

  // Aggregated context
  getUserContext(userId: string): Promise<UserContext>
  getGroupContext(groupId: string): Promise<GroupContext>
  getSuggestions(groupId: string): Promise<Suggestion[]>

  // Extraction
  extractAndPersist(session: ArchivedSession): Promise<ExtractionResult>

  // Privacy
  forgetUser(userId: string): Promise<void>
  exportUser(userId: string): Promise<unknown>
}
