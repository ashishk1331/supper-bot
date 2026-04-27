import type { Platform, TrackedMessage } from "./events"

export type SessionState =
  | "idle"
  | "browsing"
  | "collecting"
  | "voting"
  | "placing"
  | "complete"
  | "cancelled"

export interface CartItem {
  dishId: string
  dishName: string
  qty: number
  price: number
  customizations?: Record<string, unknown>
}

export interface MemberCart {
  userId: string
  displayName: string
  items: CartItem[]
  confirmed: boolean
  optedOut: boolean
  lastActiveAt: Date
}

export interface OrderSession {
  sessionId: string
  orderId: string
  platform: Platform
  groupId: string
  state: SessionState

  partyLeader: {
    userId: string
    displayName: string
  }

  restaurant?: {
    id: string
    name: string
    minOrderValue?: number
    estimatedDelivery?: number
  }

  deliveryAddress?: {
    label?: string
    raw: string
    structured?: Record<string, unknown>
  }

  members: Record<string, MemberCart>
  trackedMessages: Record<string, TrackedMessage>

  idempotencyKey: string
  swiggyOrderId?: string

  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  closedAt?: Date
}

export interface ArchivedParticipant {
  userId: string
  displayName: string
  items: CartItem[]
  subtotal: number
}

export interface ArchivedSession {
  sessionId: string
  orderId: string
  groupId: string
  platform: Platform
  partyLeaderId: string
  restaurantId?: string
  restaurantName?: string
  participants: ArchivedParticipant[]
  totalAmount?: number
  deliveryAddress?: Record<string, unknown>
  swiggyOrderId?: string
  status: "complete" | "cancelled"
  chatHistory: ChatMessage[]
  chatSummary?: string
  placedAt?: Date
  createdAt: Date
}

export type MessageRole = "user" | "assistant" | "tool_call" | "tool_result"

export interface ChatMessage {
  id: string
  role: MessageRole
  userId?: string
  displayName?: string
  content: string
  toolName?: string
  toolPayload?: Record<string, unknown>
  timestamp: Date
}

export interface ChatSummaryBlock {
  type: "summary"
  covers: { from: Date; to: Date; messageCount: number }
  content: string
  keyFacts: string[]
  preservedMessages: ChatMessage[]
}

export interface GapMarker {
  type: "gap"
  droppedMessageCount: number
  from: Date
  to: Date
  reason: "truncation"
}

export interface CompactionResult {
  strategy: Array<"tool_trim" | "summarise" | "truncate">
  messagesBefore: number
  messagesAfter: number
  tokensBefore: number
  tokensAfter: number
  summaryGenerated?: string
  compactedAt: Date
}

export interface ActiveChatWindow {
  sessionId: string
  groupId: string
  messages: Array<ChatMessage | ChatSummaryBlock | GapMarker>
  tokenEstimate: number
  lastCompactedAt?: Date
  compactionHistory: CompactionResult[]
  summaries: ChatSummaryBlock[]
}
