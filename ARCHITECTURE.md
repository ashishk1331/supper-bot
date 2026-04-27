## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Design Principles](#2-design-principles)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Channel Gateway Layer](#4-channel-gateway-layer)
5. [Message Queue](#5-message-queue)
6. [Session Layer](#6-session-layer)
7. [Agent Orchestrator](#7-agent-orchestrator)
8. [Tool Layer](#8-tool-layer)
9. [Memory Layer](#9-memory-layer)
10. [Context Window & Compaction](#10-context-window--compaction)
11. [Swiggy MCP Integration](#11-swiggy-mcp-integration)
12. [Data Flow](#12-data-flow)
13. [ID Strategy](#13-id-strategy)
14. [Docker & Self-Hosting](#14-docker--self-hosting)
15. [Project Structure](#15-project-structure)
16. [Tech Stack](#16-tech-stack)

---

## 1. Project Overview

supper-bot is a self-hostable group food ordering agent that lives inside team chat platforms. Drop it into any group, and it handles the entire ordering lifecycle — browsing menus, collecting individual items, resolving preferences, running a confirmation vote, and placing a single consolidated Swiggy order.

**Supported platforms:** Slack, Discord, Telegram

**Core capabilities:**

- Natural language ordering — no commands needed
- Collaborative multi-user cart building
- Party leader system for payment and delivery
- Per-user memory — dietary preferences, favorites, past orders
- Per-group memory — usual restaurants, ordering patterns, shared preferences
- Graph-based relationship memory — who orders with whom, dish affinities
- Reactions as votes and confirmations
- Order tracking via human-readable IDs (`#swift-mango-lands`)

---

## 2. Design Principles

**Single command deploy.** `docker compose up` gives a fully working bot. No external setup wizards, no manual DB migrations beyond what the container handles.

**BYO credentials.** Users bring their own Anthropic API key, Swiggy token, and platform bot tokens via `.env`. Nothing is hardcoded.

**Stateless app, stateful stores.** The bot container is horizontally scalable. All state lives in Postgres and FalkorDB. Multiple bot instances can run behind a load balancer safely.

**Open-ended memory.** No rigid schemas for what the agent is allowed to remember. Both the fact store and graph store accept arbitrary keys, values, node labels, and edge types. Shipped constants guide the agent without constraining it.

**Transparent compaction.** Context window management is automatic and visible to the agent — it receives explicit summary blocks and gap markers rather than silently truncated history.

**Privacy first.** Every user can wipe their memory or export it. Memory is per-deployment — never shared across self-hosted instances.

---

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Chat Platforms                                 │
│   ┌───────────┐         ┌───────────┐         ┌───────────┐          │
│   │   Slack   │         │  Discord  │         │ Telegram  │          │
│   └─────┬─────┘         └─────┬─────┘         └─────┬─────┘          │
└─────────┼───────────────────  ┼ ─────────────────────┼───────────────┘
          │ Socket Mode         │ Gateway              │ Long-poll/Webhook
          ▼                     ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Channel Gateway Layer                             │
│                                                                       │
│   TriggerDetector → Normaliser → AmbientBuffer → UnifiedEvent        │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
                  ┌────────────────────────┐
                  │      Message Queue      │
                  │   BullMQ / FalkorDB    │
                  └────────────┬───────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Agent Orchestrator                               │
│                                                                       │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────────────┐     │
│  │   Session   │   │    Memory    │   │     LLM Engine        │     │
│  │   Manager   │   │   Service    │   │  Claude + Tool Use    │     │
│  └─────────────┘   └──────────────┘   └───────────────────────┘     │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
                  ┌────────────────────────┐
                  │       Tool Layer        │
                  └────────────┬───────────┘
                               │
          ┌────────────────────┴──────────────────┐
          ▼                                        ▼
 ┌─────────────────┐                   ┌───────────────────────┐
 │   Swiggy MCP    │                   │    Internal Tools     │
 │ Food/Instamart  │                   │ session, memory, util │
 │    /Dineout     │                   └───────────────────────┘
 └─────────────────┘

 Persistence
 ┌──────────────────┐    ┌──────────────────────────────────────┐
 │   PostgreSQL     │    │   FalkorDB                           │
 │                  │    │   (Redis-compatible graph DB)        │
 │  Fact store      │    │                                      │
 │  Archived orders │    │   Entity graph + BullMQ queue        │
 │  Chat history    │    │   Active sessions + chat windows     │
 │  User/group data │    │   Ambient buffers + rate limits      │
 └──────────────────┘    └──────────────────────────────────────┘
```

---

## 4. Channel Gateway Layer

The gateway is the only layer that knows about platform differences. Everything downstream works with normalised types.

### 4.1 Trigger Types

The bot wakes up in response to seven trigger types. All other messages are silently captured into the ambient buffer only.

```typescript
type TriggerType =
  | "mention"       // @supper in message text
  | "reply"         // replied directly to a bot message
  | "quote"         // quoted / forwarded a bot message
  | "thread"        // message in a thread the bot is participating in
  | "reaction"      // reacted to a tracked bot message
  | "order_ref"     // message contains a #human-id order reference
  | "dm"            // direct message (Telegram / Discord)
```

Trigger detection runs in priority order — first match wins. If no trigger matches, the message goes into the ambient buffer only and the bot stays silent.

```typescript
interface TriggerCheck {
  type: TriggerType
  detect: (event: RawPlatformEvent, botMeta: BotMeta) => boolean
}

const triggerChecks: TriggerCheck[] = [
  { type: "reaction",   detect: (e)      => e.isReactionEvent && isTrackedMessage(e.targetMessageId) },
  { type: "reply",      detect: (e, bot) => e.replyToUserId === bot.userId },
  { type: "quote",      detect: (e, bot) => e.quotedUserId === bot.userId },
  { type: "thread",     detect: (e, bot) => e.threadId !== undefined && isBotInThread(e.threadId) },
  { type: "mention",    detect: (e, bot) => e.text.includes(bot.mentionString) },
  { type: "order_ref",  detect: (e)      => ORDER_REF_PATTERN.test(e.text) },
  { type: "dm",         detect: (e)      => e.isDirect },
]
```

### 4.2 Platform Connection Methods

| Platform | Connection | Auth tokens |
|---|---|---|
| Slack | Socket Mode (WebSocket — no public URL needed) | `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` |
| Discord | Gateway (WebSocket) | `DISCORD_BOT_TOKEN` |
| Telegram | Long polling (default) or webhook (optional) | `TELEGRAM_BOT_TOKEN` |

Socket Mode for Slack and Gateway for Discord mean self-hosters need no public HTTPS endpoint or domain — `docker compose up` is enough.

### 4.3 Unified Event Types

```typescript
type UnifiedEvent = UnifiedMessage | UnifiedReaction

interface UnifiedMessage {
  type: "message"
  platform: "slack" | "discord" | "telegram"
  groupId: string
  threadId?: string
  userId: string
  displayName: string
  text: string
  trigger: TriggerType
  triggerMessageId?: string       // bot message that was replied to / quoted
  replyTo?: string
  orderRefs: string[]             // extracted #human-ids
  mentions: string[]
  ambientContext: AmbientMessage[]
  timestamp: Date
  rawEvent: unknown
}

interface UnifiedReaction {
  type: "reaction"
  platform: "slack" | "discord" | "telegram"
  groupId: string
  userId: string
  displayName: string
  emoji: string
  action: "added" | "removed"
  targetMessageId: string
  trigger: "reaction"
  timestamp: Date
  rawEvent: unknown
}
```

### 4.4 Adapter Contract

Each platform implements this interface. The rest of the system never imports platform SDKs directly.

```typescript
interface ChannelAdapter {
  platform: "slack" | "discord" | "telegram"

  parseIncoming(event: unknown): UnifiedEvent | null
  sendMessage(target: ChannelTarget, content: AgentResponse): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

interface AgentResponse {
  text: string
  blocks?: RichBlock[]            // adapter renders per platform (Block Kit / Embeds / etc.)
  buttons?: Button[]
}
```

### 4.5 Ambient Buffer

Every message — whether it triggers the bot or not — is captured into a rolling ambient buffer per group. This gives the agent context for what people were discussing before tagging it.

```typescript
interface AmbientMessage {
  messageId: string
  userId: string
  displayName: string
  content: string
  timestamp: Date
  replyTo?: string
}

interface AmbientBuffer {
  groupId: string
  platform: string
  messages: AmbientMessage[]      // last 20 messages, sliding window
}
```

Stored in FalkorDB (Redis) with a short TTL. Evicted after inactivity.

### 4.6 Reaction Intent Resolution

Reactions are meaningful only on messages the bot is tracking. Tracked messages are stored alongside the session.

```typescript
type ReactionIntent =
  | "confirm_order"
  | "opt_out"
  | "upvote_dish"
  | "downvote_dish"
  | "unknown"

interface TrackedMessage {
  messageId: string
  sessionId: string
  intent: "voting_summary" | "dish_suggestion" | "order_summary" | "general"
}

// Well-known emoji mappings — self-hosters can override
const KnownReactionMappings = {
  CONFIRM:  ["✅", "👍", "white_check_mark", "+1"],
  OPT_OUT:  ["❌", "👎", "x", "-1"],
  UPVOTE:   ["🔥", "❤️", "heart", "fire"],
  DOWNVOTE: ["😐", "thumbsdown"],
} as const
```

Simple reactions — confirm / opt-out — are handled directly by the session manager without invoking the LLM, saving tokens on high-frequency interactions.

### 4.7 Silence Rules

```typescript
interface SilenceRules {
  ignoreOtherBots: true
  ignoreUntrackedReactions: true
  ignoreBurstFromSameUser: true     // handled by rate limiter (3+ msgs, no reply yet)
}
```

### 4.8 Platform Feature Matrix

| Feature | Slack | Discord | Telegram |
|---|---|---|---|
| Mention syntax | `<@BOTID>` | `<@BOTID>` | `@botusername` |
| Thread support | ✅ native threads | ✅ threads | ✅ topics (if enabled) |
| Reaction events | `reaction_added/removed` | `messageReactionAdd/Remove` | `message_reaction` (Bot API 7.0+) |
| Quote/forward | Forwarded attachments | Quote reply | Forward message |
| Rich UI | Block Kit | Embeds + Buttons | Inline keyboards |
| DM support | ✗ (group agent) | ✅ | ✅ |

---

## 5. Message Queue

All incoming events are pushed into BullMQ immediately after parsing. This decouples the gateway from the agent.

```
Gateway receives event
        ↓
Parse → UnifiedEvent
        ↓
Push to BullMQ queue "incoming-events"
        ↓
Return 200 to platform (Slack times out at 3s — this must be instant)

Meanwhile:
BullMQ Worker pool pulls from queue
        ↓
Route to Agent Orchestrator
        ↓
Process (5–30s depending on complexity)
        ↓
Send response via adapter
```

BullMQ runs on top of FalkorDB's Redis-compatible interface — no separate Redis service needed.

**Worker configuration:**

```typescript
interface QueueConfig {
  concurrency: number               // parallel workers, default: 5
  attempts: number                  // retry on failure, default: 3
  backoff: {
    type: "exponential"
    delay: number                   // ms, default: 1000
  }
  removeOnComplete: number          // keep last N completed jobs
  removeOnFail: number
}
```

---

## 6. Session Layer

### 6.1 Session State Machine

One active session per group at a time. Starting a new order while one is active prompts the agent to ask about cancelling.

```
       ┌──────┐
       │ IDLE │ ← no active order
       └──┬───┘
          │ user starts an order
          ▼
    ┌──────────┐
    │ BROWSING │ ← picking restaurant
    └─────┬────┘
          │ restaurant locked in
          ▼
    ┌────────────┐
    │ COLLECTING │ ← members adding items
    └──────┬─────┘
           │ leader closes order
           ▼
     ┌─────────┐
     │ VOTING  │ ← waiting for member confirmations
     └────┬────┘
          │ all confirmed or timeout
          ▼
     ┌─────────┐
     │ PLACING │ ← calling Swiggy API
     └────┬────┘
          │
    ┌─────┴──────┐
    ▼            ▼
┌────────┐  ┌──────────┐
│COMPLETE│  │CANCELLED │
└────────┘  └──────────┘
```

### 6.2 Session Types

```typescript
type SessionState =
  | "idle"
  | "browsing"
  | "collecting"
  | "voting"
  | "placing"
  | "complete"
  | "cancelled"

interface OrderSession {
  sessionId: string                 // human-id: "swift-mango-lands"
  orderId: string                   // human-id: shown to users for tracking
  platform: "slack" | "discord" | "telegram"
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
    estimatedDelivery?: number      // minutes
  }

  deliveryAddress?: {
    label?: string
    raw: string
    structured?: Record<string, unknown>
  }

  members: Record<string, MemberCart>

  trackedMessages: Record<string, TrackedMessage>

  idempotencyKey: string            // generated at PLACING, prevents double-orders
  swiggyOrderId?: string

  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  closedAt?: Date
}

interface MemberCart {
  userId: string
  displayName: string
  items: CartItem[]
  confirmed: boolean
  optedOut: boolean
  lastActiveAt: Date
}

interface CartItem {
  dishId: string
  dishName: string
  qty: number
  price: number
  customizations?: Record<string, unknown>
}
```

### 6.3 Session Storage Keys (FalkorDB / Redis)

```
session:active:{platform}:{groupId}     → OrderSession          TTL: 2h
session:chat:{sessionId}                → ActiveChatWindow       TTL: 2h
session:threads:{groupId}               → ActiveThreads          TTL: 2h
session:lock:{sessionId}                → Mutex for writes       TTL: 5s
ambient:{platform}:{groupId}            → AmbientBuffer          TTL: 30m
ratelimit:{platform}:{userId}           → Sliding counter        TTL: 1m
memory:cache:{scope}:{scopeId}          → UserContext/GroupCtx   TTL: 5m
```

---

## 7. Agent Orchestrator

### 7.1 Per-Message Processing Flow

```
Incoming UnifiedEvent
        ↓
1. Load OrderSession from FalkorDB
2. Load ActiveChatWindow from FalkorDB
3. Load UserContext (Postgres facts + FalkorDB graph)
4. Load GroupContext (Postgres facts + FalkorDB graph)
5. Check if reaction → handle directly (no LLM) → done
6. Build AgentInput from all of the above
7. Call Claude with tool use enabled
8. Tool call loop:
   └─ LLM calls tool → execute → feed result back → repeat
9. LLM produces final text response
10. Send via ChannelAdapter
11. Append to ActiveChatWindow
12. Update OrderSession if state changed
13. Write both back to FalkorDB
14. If session COMPLETE or CANCELLED:
    └─ Archive to Postgres
    └─ Run memory extraction (async)
    └─ Delete FalkorDB keys
```

### 7.2 Agent Input Type

```typescript
interface AgentInput {
  trigger: UnifiedEvent
  session: OrderSession
  chatWindow: ActiveChatWindow
  userContext: UserContext
  groupContext: GroupContext
  availableTools: ToolDefinition[]
}
```

### 7.3 System Prompt Structure

```
You are Supper, a group food ordering agent in a {platform} chat.

━━ Current Order Session ━━
{session_json}

━━ User Who Just Messaged ━━
Name: {displayName}
Dietary facts: {dietary_facts}
Recent favorites: {top_5_favorites}

━━ Group Context ━━
Members: {member_list}
Frequently orders from: {usual_restaurants}
Default address: {address}
Known conflicts: {conflict_history}

━━ Recent Channel Context ━━
{ambient_messages}

━━ Available Tools ━━
{tool_list}

━━ Rules ━━
- Always confirm the full order before placing
- Surface dietary conflicts proactively
- Keep messages concise — this is a chat, not an essay
- Use @mentions when addressing specific people
- Reference orders as #order-id
- Simple confirmations (reactions) do not need a text response
```

---

## 8. Tool Layer

All tools are defined in a central registry with Zod schemas. The LLM never calls platform SDKs or database clients directly.

### 8.1 Swiggy MCP Tools

Thin wrappers around the Swiggy MCP servers via `@modelcontextprotocol/sdk`.

```typescript
type SwiggyTool =
  | "swiggy_search_restaurants"
  | "swiggy_get_menu"
  | "swiggy_get_dish_details"
  | "swiggy_check_availability"
  | "swiggy_apply_coupon"
  | "swiggy_place_order"
  | "swiggy_track_order"
```

### 8.2 Session Tools

```typescript
type SessionTool =
  | "session_add_item"
  | "session_remove_item"
  | "session_set_restaurant"
  | "session_set_address"
  | "session_set_party_leader"
  | "session_close_for_voting"
  | "session_confirm_member"
  | "session_opt_out_member"
  | "session_get_summary"
  | "session_cancel"
```

### 8.3 Memory Tools

```typescript
type MemoryTool =
  | "memory_get_user_context"
  | "memory_get_group_context"
  | "memory_set_fact"
  | "memory_get_suggestions"
  | "memory_forget_user"
  | "memory_export_user"
```

### 8.4 Tool Definition Type

```typescript
interface ToolDefinition {
  name: string
  description: string
  inputSchema: ZodSchema
  execute: (input: unknown, context: ToolContext) => Promise<unknown>
}

interface ToolContext {
  session: OrderSession
  userId: string
  groupId: string
  platform: string
  memoryService: MemoryService
}
```

---

## 9. Memory Layer

The memory system is split across three stores, each serving a different access pattern. A single `MemoryService` interface abstracts all three.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Memory Layer                                  │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │   Fact Store    │  │   Graph Store    │  │ Working Memory  │    │
│  │  (PostgreSQL)   │  │   (FalkorDB)     │  │  (FalkorDB)     │    │
│  │                 │  │                  │  │                  │    │
│  │ Scoped generic  │  │ Entities and     │  │ Active sessions  │    │
│  │ key-value facts │  │ relationships    │  │ Chat windows     │    │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬─────────┘    │
│           │                   │                      │               │
│           └───────────────────┴──────────────────────┘               │
│                               │                                       │
│                      ┌────────┴────────┐                             │
│                      │  MemoryService  │                             │
│                      └────────┬────────┘                             │
│                               │                                       │
│                      ┌────────┴────────┐                             │
│                      │  Extraction     │                             │
│                      │  Engine         │                             │
│                      └─────────────────┘                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 9.1 Fact Store (PostgreSQL)

Generic scoped key-value memory. No predefined columns for what can be remembered.

```typescript
type MemoryScope  = "user" | "group" | "session" | "global"
type MemorySource = "explicit" | "inferred" | "observed"

interface MemoryFact {
  id: string                          // human-id
  scope: MemoryScope
  scopeId: string                     // userId, groupId, sessionId, or "global"
  key: string                         // open dot-namespaced string
  value: unknown                      // agent decides shape entirely
  confidence: number                  // 0.0 – 1.0
  source: MemorySource
  reinforceCount: number              // incremented each time re-observed
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

interface MemoryEvent {
  id: string                          // uuid, internal audit only
  memoryId: string
  eventType: "created" | "updated" | "reinforced" | "contradicted" | "expired" | "deleted"
  prevValue?: unknown
  nextValue?: unknown
  sessionId?: string
  triggeredBy: "agent" | "user" | "system"
  createdAt: Date
}
```

**Well-known memory keys** — shipped as constants to guide the agent. Not enforced as types.

```typescript
const KnownMemoryKeys = {
  // user scope
  DIETARY_RESTRICTION:  "dietary.restriction",
  DIETARY_PREFERENCE:   "dietary.preference",
  SPICE_LEVEL:          "order.spice_level",
  ORDER_TIMING:         "order.timing",
  PAYMENT_BEHAVIOR:     "payment.behavior",
  ADDRESS_HOME:         "address.home",
  ADDRESS_WORK:         "address.work",
  CUISINE_LIKED:        "cuisine.liked",
  CUISINE_DISLIKED:     "cuisine.disliked",

  // group scope
  ORDER_PATTERN:        "order.pattern",
  DEFAULT_ADDRESS:      "address.default",
  DEFAULT_LEADER:       "group.default_leader",
  CONFLICT_HISTORY:     "group.conflict_history",
  BUDGET_PREFERENCE:    "group.budget",

  // session scope
  STATED_BUDGET:        "session.budget",
  DELIVERY_URGENCY:     "session.urgency",
} as const
```

### 9.2 Graph Store (FalkorDB)

Stores entities and their relationships. Open node and edge labels — the agent invents new ones as needed. Shipped constants provide guidance.

```typescript
type NodeLabel = string               // open — agent decides
type EdgeLabel = string               // open — agent decides

interface GraphNode {
  id: string
  label: NodeLabel
  props: Record<string, unknown>
}

interface GraphEdge {
  from: GraphNode
  rel: EdgeLabel
  to: GraphNode
  props?: Record<string, unknown>
}

// Well-known node labels — guidance only
const KnownNodeLabels = {
  USER:       "User",
  DISH:       "Dish",
  RESTAURANT: "Restaurant",
  GROUP:      "Group",
  CUISINE:    "Cuisine",
  TAG:        "Tag",
  ORDER:      "Order",
  TIME_SLOT:  "TimeSlot",           // "friday-afternoon", "weekday-lunch"
} as const

// Well-known edge labels — guidance only
const KnownEdgeLabels = {
  LIKES:               "LIKES",
  DISLIKES:            "DISLIKES",
  PREFERS:             "PREFERS",
  AVOIDS:              "AVOIDS",
  ORDERS_WITH:         "ORDERS_WITH",
  MEMBER_OF:           "MEMBER_OF",
  LED_ORDER:           "LED_ORDER",
  INTRODUCED_TO:       "INTRODUCED_TO",
  FROM:                "FROM",
  SERVES:              "SERVES",
  TAGGED:              "TAGGED",
  SIMILAR_TO:          "SIMILAR_TO",
  USUALLY_ORDERS_FROM: "USUALLY_ORDERS_FROM",
  ORDERED_FROM:        "ORDERED_FROM",
  HAD_CONFLICT_OVER:   "HAD_CONFLICT_OVER",
  ORDERS_DURING:       "ORDERS_DURING",
} as const
```

**Example graph queries enabled by this structure:**

Find dishes that work for everyone in a group:
```cypher
MATCH (g:Group {id: $groupId})-[:MEMBER_OF]->(u:User)
WITH collect(u) as members
MATCH (d:Dish)
WHERE ALL(u IN members WHERE (u)-[:LIKES]->(d) OR NOT (u)-[:DISLIKES]->(d))
RETURN d
```

Suggest a new restaurant based on cuisine affinity:
```cypher
MATCH (g:Group {id: $groupId})-[:MEMBER_OF]->(u:User)-[:PREFERS]->(r:Restaurant)-[:SERVES]->(c:Cuisine)
WITH c, count(*) as score
MATCH (newR:Restaurant)-[:SERVES]->(c)
WHERE NOT (g)-[:USUALLY_ORDERS_FROM]->(newR)
RETURN newR, sum(score) as fit ORDER BY fit DESC
```

### 9.3 Working Memory (FalkorDB / Redis Interface)

Fast ephemeral state for active sessions.

```typescript
interface ActiveChatWindow {
  sessionId: string
  groupId: string
  messages: Array<ChatMessage | ChatSummaryBlock | GapMarker>
  tokenEstimate: number
  lastCompactedAt?: Date
  compactionHistory: CompactionResult[]
  summaries: ChatSummaryBlock[]       // fed to extraction engine on session end
}

type MessageRole = "user" | "assistant" | "tool_call" | "tool_result"

interface ChatMessage {
  id: string                          // uuid, internal
  role: MessageRole
  userId?: string
  displayName?: string
  content: string
  toolName?: string
  toolPayload?: Record<string, unknown>
  timestamp: Date
}
```

### 9.4 Aggregated Context Types

Compiled views of both stores, served to the agent before every LLM call.

```typescript
interface UserContext {
  userId: string
  displayName: string
  facts: MemoryFact[]
  likedDishes: GraphNode[]
  dislikedDishes: GraphNode[]
  preferredRestaurants: GraphNode[]
  frequentOrderPartners: GraphNode[]
  recentOrders: ArchivedSession[]
}

interface GroupContext {
  groupId: string
  platform: string
  facts: MemoryFact[]
  members: GraphNode[]
  usualRestaurants: GraphNode[]
  sharedAffinities: GraphNode[]
  knownConflicts: GraphNode[]
  recentSessions: ArchivedSession[]
}

interface Suggestion {
  type: "restaurant" | "dish" | "reorder"
  entity: GraphNode
  reason: string
  score: number
}
```

### 9.5 Archived Session (PostgreSQL)

After a session ends, the full record is persisted to Postgres for long-term storage and memory extraction.

```typescript
interface ArchivedSession {
  sessionId: string                   // human-id
  orderId: string                     // human-id
  groupId: string
  platform: string
  partyLeaderId: string
  restaurantId?: string
  restaurantName?: string
  participants: ArchivedParticipant[]
  totalAmount?: number
  deliveryAddress?: Record<string, unknown>
  swiggyOrderId?: string
  status: "complete" | "cancelled"
  chatHistory: ChatMessage[]
  chatSummary?: string                // LLM-generated after session ends
  placedAt?: Date
  createdAt: Date
}

interface ArchivedParticipant {
  userId: string
  displayName: string
  items: CartItem[]
  subtotal: number
}
```

### 9.6 Memory Extraction Engine

Runs asynchronously after every session is archived. A focused second LLM pass over the transcript extracts learnings into both stores.

```typescript
interface ExtractionInput {
  session: ArchivedSession
  existingUserFacts: Record<string, MemoryFact[]>
  existingGroupFacts: MemoryFact[]
  existingGraphEdges: GraphEdge[]
}

interface ExtractionResult {
  userFacts: ExtractionFact[]
  groupFacts: ExtractionFact[]
  graphUpdates: GraphUpdate[]
}

interface ExtractionFact {
  scopeId: string
  key: string
  value: unknown
  confidence: number
  source: MemorySource
  shouldReinforce: boolean            // bump reinforceCount if fact exists
  shouldContradict: boolean           // flag conflict with existing fact
}

interface GraphUpdate {
  operation: "upsert" | "delete"
  from: GraphNode
  rel: EdgeLabel
  to: GraphNode
  props?: Record<string, unknown>
}
```

### 9.7 Memory Service Interface

The single interface the agent uses — never touches stores directly.

```typescript
interface MemoryService {
  // Fact store (Postgres)
  setFact(scope: MemoryScope, scopeId: string, key: string, value: unknown, options?: {
    source?: MemorySource
    confidence?: number
    expiresAt?: Date
  }): Promise<MemoryFact>

  getFact(scope: MemoryScope, scopeId: string, key: string): Promise<MemoryFact | null>
  getFacts(scope: MemoryScope, scopeId: string, keyPrefix?: string): Promise<MemoryFact[]>
  deleteFact(scope: MemoryScope, scopeId: string, key?: string): Promise<void>

  // Graph store (FalkorDB)
  upsertNode(label: NodeLabel, id: string, props: Record<string, unknown>): Promise<void>
  upsertEdge(edge: GraphEdge): Promise<void>
  deleteEdge(from: GraphNode, rel: EdgeLabel, to: GraphNode): Promise<void>
  query<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<T[]>

  // Working memory (FalkorDB / Redis)
  getSession(platform: string, groupId: string): Promise<OrderSession | null>
  setSession(session: OrderSession): Promise<void>
  deleteSession(platform: string, groupId: string): Promise<void>
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
```

### 9.8 Store Responsibility Summary

| Question | Store |
|---|---|
| What are Rahul's dietary preferences? | Postgres (scope=user, key=dietary.*) |
| Who orders with whom? | FalkorDB graph |
| What did this group last order? | Postgres (scope=group, key=last_order) |
| What dish fits everyone? | FalkorDB (intersection query) |
| When does this group usually order? | Postgres (scope=group, key=order.pattern) |
| What's the current cart? | FalkorDB / Redis (OrderSession) |
| What was said in the last 20 messages? | FalkorDB / Redis (AmbientBuffer) |
| Full order history for a session | Postgres (ArchivedSession) |

---

## 10. Context Window & Compaction

### 10.1 Token Budget

```typescript
interface TokenBudget {
  total: number
  reserved: {
    systemPrompt:   number
    sessionState:   number
    userContext:    number
    groupContext:   number
    ambientContext: number
    toolSchemas:    number
    responseBuffer: number
  }
  availableForHistory: number
}

const DefaultTokenBudget: TokenBudget = {
  total: 180_000,
  reserved: {
    systemPrompt:   1_000,
    sessionState:   1_500,
    userContext:      800,
    groupContext:     800,
    ambientContext:   500,
    toolSchemas:    2_000,
    responseBuffer: 4_000,
  },
  availableForHistory: 169_400
}
```

### 10.2 Compaction Pipeline

```
appendMessage → estimate tokens
                      ↓
              below 85% threshold? ──yes──→ proceed normally
                      ↓ no
         ┌────────────────────────────┐
         │   Layer 1: Tool Trim       │  cheap, no LLM
         │   Trim old tool results    │  recovers ~40-60%
         └────────────┬───────────────┘
                      ↓ still over?
         ┌────────────────────────────┐
         │   Layer 2: Summarise       │  one cheap LLM call
         │   Compress oldest N msgs   │  → feeds memory extraction
         └────────────┬───────────────┘
                      ↓ still over?
         ┌────────────────────────────┐
         │   Layer 3: Truncate        │  last resort, no LLM
         │   Drop middle, keep ends   │  inject GapMarker
         └────────────────────────────┘
```

### 10.3 Compaction Types

```typescript
interface CompactionConfig {
  triggerThreshold: number            // 0.85 — compact at 85% full
  targetAfterCompaction: number       // 0.50 — compact down to 50%
  maxToolResultTokens: number         // trim individual tool results beyond this
  alwaysKeepLastN: number             // always preserve last N messages verbatim
  summaryModel: string
  summaryMaxTokens: number
}

// Layer 1 — rules per tool
interface ToolTrimRule {
  keepVerbatimFor: number             // keep full result for N subsequent messages
  afterThat: "summarise" | "drop" | "keep_keys"
  keysToKeep?: string[]
  summariseAs?: string                // static template: "Menu for {restaurant} fetched"
}

const DefaultToolTrimRules: Record<string, ToolTrimRule> = {
  swiggy_get_menu:           { keepVerbatimFor: 2, afterThat: "summarise",  summariseAs: "Menu for {restaurant} fetched ({itemCount} items)" },
  swiggy_search_restaurants: { keepVerbatimFor: 2, afterThat: "keep_keys",  keysToKeep: ["id", "name", "cuisine", "rating"] },
  swiggy_get_dish_details:   { keepVerbatimFor: 3, afterThat: "summarise",  summariseAs: "{dishName} details fetched (₹{price})" },
  session_get_summary:       { keepVerbatimFor: 1, afterThat: "drop" },
}

// Layer 2 — summary block replaces compressed messages
interface ChatSummaryBlock {
  type: "summary"
  covers: { from: Date; to: Date; messageCount: number }
  content: string
  keyFacts: string[]
  preservedMessages: ChatMessage[]  // verbatim messages preserved within range
}

// Layer 3 — gap marker tells agent history is incomplete
interface GapMarker {
  type: "gap"
  droppedMessageCount: number
  from: Date
  to: Date
  reason: "truncation"
}

// Always preserve these message types regardless of compaction strategy
type AlwaysPreserveEvent =
  | "order_placement"
  | "party_leader_change"
  | "member_opt_out"
  | "address_confirmed"
  | "restaurant_locked"
  | "vote_result"
```

### 10.4 Compaction Result

```typescript
interface CompactionResult {
  strategy: Array<"tool_trim" | "summarise" | "truncate">
  messagesBefore: number
  messagesAfter: number
  tokensBefore: number
  tokensAfter: number
  summaryGenerated?: string
  compactedAt: Date
}
```

Summaries generated during compaction are stored on `ActiveChatWindow.summaries` and fed into the extraction engine when the session ends — no separate pass needed. Compaction and memory building share the same artefacts.

---

## 11. Swiggy MCP Integration

Connected via `@modelcontextprotocol/sdk` pointing at three MCP servers.

```typescript
interface SwiggyMCPConfig {
  food: {
    url: string                       // SWIGGY_MCP_FOOD_URL
    token: string
  }
  instamart: {
    url: string
    token: string
  }
  dineout: {
    url: string
    token: string
  }
}
```

**Core ordering flow:**

```
Browse:  search_restaurants → get_menu → get_dish_details
Cart:    build_cart → check_availability → apply_coupon
Order:   place_order (with idempotency key) → track_order
```

**Idempotency on placement:**

The `idempotencyKey` field on `OrderSession` is generated once when the session transitions to `PLACING`. It is passed to Swiggy on every order attempt. Retries on network failure use the same key — no double orders.

---

## 12. Data Flow

### 12.1 Incoming Message

```
Platform sends event
        ↓
ChannelAdapter.parseIncoming()
        ↓
TriggerDetector — match trigger type
        ↓
No trigger match? → write to AmbientBuffer only → done
        ↓ trigger matched
Normalise to UnifiedEvent
        ↓
Push to BullMQ queue
        ↓ (async, platform already ACK'd)
Worker picks up job
        ↓
Load: OrderSession + ActiveChatWindow + UserContext + GroupContext
        ↓
Reaction event? → SessionManager.handleReaction() → send response → done
        ↓ message event
Build AgentInput
        ↓
CompactionManager.prepare() — ensure chat window fits budget
        ↓
Claude API call with tools
        ↓
Tool call loop (0 to N iterations)
        ↓
Final text response → ChannelAdapter.sendMessage()
        ↓
appendMessage + setSession → FalkorDB
        ↓
Session COMPLETE or CANCELLED?
  No  → done
  Yes → archive to Postgres
        → extractAndPersist(session) async
        → delete FalkorDB keys
```

### 12.2 Memory Extraction (Async Post-Session)

```
ArchivedSession
        ↓
Load existing facts + graph edges for all participants
        ↓
LLM extraction pass (focused prompt, cheap model)
        ↓
ExtractionResult
        ↓
For each userFact:
  shouldReinforce? → increment reinforceCount + update value
  shouldContradict? → flag old fact + create new one + emit MemoryEvent
  new? → create MemoryFact
        ↓
For each graphUpdate:
  upsert → FalkorDB MERGE
  delete → FalkorDB DELETE
        ↓
Invalidate memory cache keys in FalkorDB
```

---

## 13. ID Strategy

Human-readable IDs are used wherever users might reference something in chat.

```typescript
import { humanId } from "human-id"

// Usage
const sessionId = humanId({ separator: "-", capitalize: false })
// → "swift-mango-lands"

// Order references in chat
const ORDER_REF_PATTERN = /#([a-z]+-[a-z]+-[a-z]+)/g
// Matches #swift-mango-lands anywhere in a message

interface IDStrategy {
  session:     string   // human-id — the order name shown in chat
  order:       string   // human-id — Swiggy order reference
  memoryFact:  string   // human-id — useful for debugging
  chatMessage: string   // uuid     — internal only, never surfaced
  memoryEvent: string   // uuid     — internal audit trail only
}
```

**Referencing an order in chat:**

```
@supper what's the status of #swift-mango-lands?
@supper add garlic naan to #swift-mango-lands
@supper who hasn't confirmed on #swift-mango-lands?
```

---

## 14. Docker & Self-Hosting

### 14.1 docker-compose.yml

```yaml
services:

  bot:
    image: supper-bot/bot:latest
    build:
      context: .
      dockerfile: apps/bot/Dockerfile
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      falkordb:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB:       ${DB_NAME:-supper_bot}
      POSTGRES_USER:     ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  falkordb:
    image: falkordb/falkordb:latest
    volumes:
      - falkordata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  falkordata:
```

FalkorDB replaces plain Redis entirely — it exposes the same Redis-compatible interface so BullMQ, session storage, and ambient buffers all connect to it without modification.

### 14.2 Bot Dockerfile

```dockerfile
FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run DB migrations on startup, then start the bot
CMD ["sh", "-c", "bun run db:migrate && bun run apps/bot/src/index.ts"]
```

### 14.3 .env.example

```env
# ── LLM ──────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-20250514

# ── Swiggy ───────────────────────────────────────────
SWIGGY_MCP_FOOD_URL=https://mcp.swiggy.com/food
SWIGGY_MCP_INSTAMART_URL=https://mcp.swiggy.com/instamart
SWIGGY_MCP_DINEOUT_URL=https://mcp.swiggy.com/dineout
SWIGGY_API_TOKEN=

# ── Platforms (enable any subset) ───────────────────
SLACK_ENABLED=true
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

DISCORD_ENABLED=true
DISCORD_BOT_TOKEN=

TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=
TELEGRAM_USE_WEBHOOK=false          # true if you have a public HTTPS URL
TELEGRAM_WEBHOOK_URL=               # only needed if USE_WEBHOOK=true

# ── Storage ──────────────────────────────────────────
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
FALKORDB_URL=redis://falkordb:6379
DB_USER=supper
DB_PASSWORD=changeme
DB_NAME=supper_bot

# ── Behaviour ────────────────────────────────────────
SESSION_TIMEOUT_MINUTES=120
VOTING_TIMEOUT_MINUTES=10
MEMORY_RETENTION_DAYS=365
AMBIENT_BUFFER_SIZE=20
DEFAULT_TIMEZONE=Asia/Kolkata
PORT=3000

# ── Workers ──────────────────────────────────────────
QUEUE_CONCURRENCY=5
QUEUE_ATTEMPTS=3

# ── Optional ─────────────────────────────────────────
LOG_LEVEL=info
SENTRY_DSN=
```

### 14.4 Startup Behaviour

On `docker compose up`:

1. Postgres starts and waits for health check
2. FalkorDB starts and waits for health check
3. Bot container starts
4. `bun run db:migrate` runs Drizzle migrations against Postgres
5. Bot initialises — validates all env vars via Zod, crashes fast on missing required vars
6. Active platform adapters connect (Socket Mode / Gateway / polling)
7. BullMQ workers start
8. `/health` endpoint becomes available

### 14.5 Scaling

For teams with high message volume, run multiple bot containers:

```yaml
  bot:
    deploy:
      replicas: 3
```

This is safe because all state lives in Postgres and FalkorDB. Session locks (`session:lock:{sessionId}` with 5s TTL) prevent concurrent writes to the same session from multiple workers.

---

## 15. Project Structure

```
supper-bot/
│
├── apps/
│   └── bot/
│       ├── src/
│       │   ├── index.ts                    # entry point, startup sequence
│       │   │
│       │   ├── adapters/                   # channel gateway layer
│       │   │   ├── index.ts                # adapter registry
│       │   │   ├── base.ts                 # ChannelAdapter interface
│       │   │   ├── slack/
│       │   │   │   ├── index.ts
│       │   │   │   ├── trigger-detector.ts
│       │   │   │   └── renderer.ts         # AgentResponse → Block Kit
│       │   │   ├── discord/
│       │   │   │   ├── index.ts
│       │   │   │   ├── trigger-detector.ts
│       │   │   │   └── renderer.ts         # AgentResponse → Embeds
│       │   │   └── telegram/
│       │   │       ├── index.ts
│       │   │       ├── trigger-detector.ts
│       │   │       └── renderer.ts         # AgentResponse → Inline keyboards
│       │   │
│       │   ├── queue/
│       │   │   ├── producer.ts             # push to BullMQ
│       │   │   └── worker.ts               # pull + route to orchestrator
│       │   │
│       │   ├── agent/
│       │   │   ├── orchestrator.ts         # main per-message flow
│       │   │   ├── prompt-builder.ts       # builds system prompt + context
│       │   │   └── llm-client.ts           # Anthropic SDK wrapper
│       │   │
│       │   ├── session/
│       │   │   ├── manager.ts              # session CRUD + state transitions
│       │   │   ├── reaction-handler.ts     # handles reactions without LLM
│       │   │   └── types.ts
│       │   │
│       │   ├── memory/
│       │   │   ├── service.ts              # MemoryService implementation
│       │   │   ├── fact-store.ts           # Postgres fact operations
│       │   │   ├── graph-store.ts          # FalkorDB graph operations
│       │   │   ├── working-memory.ts       # Redis session + chat window
│       │   │   ├── extraction-engine.ts    # post-session LLM extraction
│       │   │   ├── compaction-manager.ts   # context window management
│       │   │   └── constants.ts            # KnownMemoryKeys, KnownNodeLabels etc.
│       │   │
│       │   ├── tools/
│       │   │   ├── registry.ts             # central tool registry
│       │   │   ├── session/                # session tools
│       │   │   ├── memory/                 # memory tools
│       │   │   └── swiggy/                 # Swiggy MCP wrappers
│       │   │
│       │   ├── mcp/
│       │   │   ├── client.ts               # MCP SDK client setup
│       │   │   └── swiggy.ts               # typed Swiggy MCP wrapper
│       │   │
│       │   ├── db/
│       │   │   ├── schema.ts               # Drizzle schema definitions
│       │   │   ├── migrations/             # generated SQL migrations
│       │   │   └── client.ts               # Drizzle client setup
│       │   │
│       │   └── lib/
│       │       ├── config.ts               # Zod env validation
│       │       ├── logger.ts               # Pino setup
│       │       ├── token-counter.ts        # token estimation utilities
│       │       ├── id.ts                   # human-id + uuid helpers
│       │       └── errors.ts               # typed error classes
│       │
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── types/                              # shared TypeScript types
│       ├── src/
│       │   ├── events.ts                   # UnifiedEvent, UnifiedMessage etc.
│       │   ├── session.ts                  # OrderSession, CartItem etc.
│       │   ├── memory.ts                   # MemoryFact, GraphNode etc.
│       │   ├── agent.ts                    # AgentInput, AgentResponse etc.
│       │   └── index.ts
│       └── package.json
│
├── docs/
│   ├── architecture.md                     # this document
│   ├── self-hosting.md
│   └── platform-setup/
│       ├── slack.md
│       ├── discord.md
│       └── telegram.md
│
├── docker-compose.yml                      # development + self-hosting
├── docker-compose.prod.yml                 # production overrides
├── .env.example
├── package.json                            # pnpm workspace root
├── bun.lockb
├── biome.json
├── tsconfig.base.json
├── LICENSE                                 # MIT
└── README.md
```

---

## 16. Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Bun (latest stable) | Fast cold starts, native TS, smaller images |
| Language | TypeScript 5.x | Best SDK coverage across all platforms; migrate to TS 7 when stable |
| Platform SDKs | `@slack/bolt`, `discord.js`, `grammy` | First-class TS support |
| LLM | `@anthropic-ai/sdk` | Tool use, long context |
| MCP | `@modelcontextprotocol/sdk` | Official SDK, TS-native |
| ORM | Drizzle + drizzle-kit | Bun-native, SQL-first, lightweight |
| Relational DB | PostgreSQL 16 | Fact store, archived sessions |
| Graph + Cache | FalkorDB | Redis-compatible graph DB, replaces Redis entirely |
| Queue | BullMQ | Runs on FalkorDB's Redis interface |
| Validation | Zod | Env vars, tool schemas, API inputs |
| IDs | `human-id` (orders/sessions) + `uuid` (internal) | Human-readable order references |
| Logging | Pino | Structured JSON, low overhead |
| Testing | `bun test` | Built-in, zero config |
| Linting | Biome | Replaces ESLint + Prettier |
| Container | `oven/bun:1-alpine` | Small image, single binary |
| Monorepo | pnpm workspaces | `apps/bot` + `packages/types` |
