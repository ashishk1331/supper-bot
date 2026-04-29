import {
  addItem,
  archiveSession,
  confirmMember,
  loadSession,
  optOutMember,
  recordSwiggyOrder,
  removeItem,
  setAddress,
  setPartyLeader,
  setPendingTrackIntent,
  setRestaurant,
  transitionSession,
} from "@/session/manager"
import { type ToolDefinition, registerTool } from "@/tools/registry"
import { z } from "zod"

const cartItemSchema = z.object({
  dishId: z.string().min(1),
  dishName: z.string().min(1),
  qty: z.number().int().positive(),
  price: z.number().nonnegative(),
  customizations: z.record(z.unknown()).optional(),
})

const restaurantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  minOrderValue: z.number().nonnegative().optional(),
  estimatedDelivery: z.number().int().nonnegative().optional(),
})

const addressSchema = z.object({
  raw: z.string().min(1),
  label: z.string().optional(),
  structured: z.record(z.unknown()).optional(),
})

const memberRefSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
})

function tool<S extends z.ZodTypeAny>(
  name: string,
  description: string,
  inputSchema: S,
  execute: ToolDefinition<z.infer<S>, unknown>["execute"],
): ToolDefinition<z.infer<S>, unknown> {
  return { name, description, inputSchema, execute }
}

export function registerSessionTools(): void {
  registerTool(
    tool(
      "session_get_summary",
      "Read the current session: state, restaurant, address, members, and items.",
      z.object({}).strict(),
      async (_input, ctx) => {
        const fresh = await loadSession(ctx.platform, ctx.groupId)
        return fresh ?? ctx.session
      },
    ),
  )

  registerTool(
    tool(
      "session_add_item",
      "Add a dish to a member's cart in the active session. Only valid in browsing/collecting state.",
      z.object({ user: memberRefSchema, item: cartItemSchema }),
      async (input, ctx) =>
        addItem(ctx.platform, ctx.groupId, {
          userId: input.user.userId,
          displayName: input.user.displayName,
          item: input.item,
        }),
    ),
  )

  registerTool(
    tool(
      "session_remove_item",
      "Remove a dish from a member's cart in the active session.",
      z.object({ userId: z.string().min(1), dishId: z.string().min(1) }),
      async (input, ctx) => removeItem(ctx.platform, ctx.groupId, input.userId, input.dishId),
    ),
  )

  registerTool(
    tool(
      "session_set_restaurant",
      "Lock the restaurant for the session. Transitions browsing -> collecting.",
      z.object({ restaurant: restaurantSchema }),
      async (input, ctx) => setRestaurant(ctx.platform, ctx.groupId, input.restaurant),
    ),
  )

  registerTool(
    tool(
      "session_set_address",
      "Set the delivery address on the session.",
      z.object({ address: addressSchema }),
      async (input, ctx) => setAddress(ctx.platform, ctx.groupId, input.address),
    ),
  )

  registerTool(
    tool(
      "session_set_party_leader",
      "Set who pays and receives the order.",
      memberRefSchema,
      async (input, ctx) =>
        setPartyLeader(ctx.platform, ctx.groupId, {
          userId: input.userId,
          displayName: input.displayName,
        }),
    ),
  )

  registerTool(
    tool(
      "session_close_for_voting",
      "Close item collection and move the session to voting.",
      z.object({}).strict(),
      async (_input, ctx) => transitionSession(ctx.platform, ctx.groupId, "voting"),
    ),
  )

  registerTool(
    tool(
      "session_confirm_member",
      "Mark a member as having confirmed their cart.",
      memberRefSchema,
      async (input, ctx) =>
        confirmMember(ctx.platform, ctx.groupId, input.userId, input.displayName),
    ),
  )

  registerTool(
    tool(
      "session_opt_out_member",
      "Mark a member as opting out of this order.",
      memberRefSchema,
      async (input, ctx) =>
        optOutMember(ctx.platform, ctx.groupId, input.userId, input.displayName),
    ),
  )

  registerTool(
    tool(
      "session_track_next_response",
      "Declare that the assistant's NEXT outbound chat message should be tracked, so reactions on it (✅ confirm / ❌ opt-out) drive the session without an LLM round-trip. Use intent='voting_summary' for the cart-confirmation post, 'order_summary' for the placement summary, 'dish_suggestion' for poll-style messages, or 'general' otherwise.",
      z.object({
        intent: z.enum(["voting_summary", "dish_suggestion", "order_summary", "general"]),
      }),
      async (input, ctx) => setPendingTrackIntent(ctx.platform, ctx.groupId, input.intent),
    ),
  )

  registerTool(
    tool(
      "session_record_swiggy_order",
      "Record the Swiggy order id on the session and transition to placing/complete in one atomic step.",
      z.object({
        swiggyOrderId: z.string().min(1),
        state: z.enum(["placing", "complete"]).default("complete"),
      }),
      async (input, ctx) =>
        recordSwiggyOrder(ctx.platform, ctx.groupId, input.swiggyOrderId, input.state),
    ),
  )

  registerTool(
    tool(
      "session_cancel",
      "Cancel the active session. Terminal.",
      z.object({}).strict(),
      async (_input, ctx) => transitionSession(ctx.platform, ctx.groupId, "cancelled"),
    ),
  )

  registerTool(
    tool(
      "session_archive",
      "Persist the closed session to Postgres and clear FalkorDB keys. Only valid in terminal state.",
      z.object({}).strict(),
      async (_input, ctx) => archiveSession(ctx.platform, ctx.groupId),
    ),
  )
}
