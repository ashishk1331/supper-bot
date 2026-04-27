import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1),
    source: text("source").notNull(),
    reinforceCount: integer("reinforce_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index("memory_facts_scope_idx").on(t.scope, t.scopeId),
    keyIdx: index("memory_facts_key_idx").on(t.scope, t.scopeId, t.key),
  }),
)

export const memoryEvents = pgTable(
  "memory_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    memoryId: text("memory_id").notNull(),
    eventType: text("event_type").notNull(),
    prevValue: jsonb("prev_value"),
    nextValue: jsonb("next_value"),
    sessionId: text("session_id"),
    triggeredBy: text("triggered_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memoryIdIdx: index("memory_events_memory_id_idx").on(t.memoryId),
  }),
)

export const archivedSessions = pgTable(
  "archived_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    orderId: text("order_id").notNull(),
    groupId: text("group_id").notNull(),
    platform: text("platform").notNull(),
    partyLeaderId: text("party_leader_id").notNull(),
    restaurantId: text("restaurant_id"),
    restaurantName: text("restaurant_name"),
    totalAmount: doublePrecision("total_amount"),
    deliveryAddress: jsonb("delivery_address"),
    swiggyOrderId: text("swiggy_order_id"),
    status: text("status").notNull(),
    chatHistory: jsonb("chat_history").notNull(),
    chatSummary: text("chat_summary"),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupIdx: index("archived_sessions_group_idx").on(t.groupId),
    orderIdIdx: index("archived_sessions_order_id_idx").on(t.orderId),
  }),
)

export const archivedParticipants = pgTable(
  "archived_participants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: text("session_id")
      .notNull()
      .references(() => archivedSessions.sessionId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    items: jsonb("items").notNull(),
    subtotal: doublePrecision("subtotal").notNull().default(0),
  },
  (t) => ({
    sessionIdx: index("archived_participants_session_idx").on(t.sessionId),
    userIdx: index("archived_participants_user_idx").on(t.userId),
  }),
)

export const trackedUsers = pgTable("tracked_users", {
  userId: text("user_id").primaryKey(),
  platform: text("platform").notNull(),
  displayName: text("display_name").notNull(),
  optOut: boolean("opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
