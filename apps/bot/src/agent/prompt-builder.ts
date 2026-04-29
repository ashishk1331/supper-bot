import type {
  ActiveChatWindow,
  AmbientMessage,
  GroupContext,
  OrderSession,
  Platform,
  UserContext,
} from "@supper-bot/types"

export interface PromptInput {
  platform: Platform
  session: OrderSession
  userContext: UserContext
  groupContext: GroupContext
  ambient: AmbientMessage[]
  chatWindow: ActiveChatWindow
}

const RULES = `Rules:
- Always confirm the full order before placing.
- Surface dietary conflicts proactively.
- Keep messages concise — this is a chat, not an essay.
- Use @mentions when addressing specific people. Reference orders as #order-id.
- Simple confirmations (reactions) do not need a text response.
- Address-first flow: call get_addresses and let the user pick an addressId before any other Swiggy tool.
- Cart is server-side. After update_food_cart, always call get_food_cart to render state.
- Confirm with the user before place_food_order; honour any constraints stated in that tool's description.
- Keep the OrderSession in sync with Swiggy's cart via the session_* tools (set_restaurant, add_item, etc.).`

function fmtFacts(ctx: { facts: { key: string; value: unknown }[] }, max = 8): string {
  if (ctx.facts.length === 0) return "(none)"
  return ctx.facts
    .slice(0, max)
    .map((f) => `- ${f.key} = ${typeof f.value === "string" ? f.value : JSON.stringify(f.value)}`)
    .join("\n")
}

function fmtAmbient(ambient: AmbientMessage[]): string {
  if (ambient.length === 0) return "(empty)"
  return ambient
    .slice(-10)
    .map((m) => `[${m.timestamp.toISOString()}] ${m.displayName}: ${m.content}`)
    .join("\n")
}

const PROMPT_MEMBER_CAP = 30

function fmtSession(s: OrderSession): string {
  const all = Object.values(s.members)
  const truncated = all.length > PROMPT_MEMBER_CAP
  const visible = truncated ? all.slice(0, PROMPT_MEMBER_CAP) : all
  const members = visible.map((m) => ({
    user: m.displayName,
    items: m.items.length,
    confirmed: m.confirmed,
    optedOut: m.optedOut,
  }))
  return JSON.stringify(
    {
      sessionId: s.sessionId,
      orderId: s.orderId,
      state: s.state,
      partyLeader: s.partyLeader.displayName,
      restaurant: s.restaurant?.name,
      address: s.deliveryAddress?.raw,
      members,
      ...(truncated
        ? { membersTruncated: all.length - PROMPT_MEMBER_CAP, totalMembers: all.length }
        : {}),
    },
    null,
    2,
  )
}

export function buildSystemPrompt(input: PromptInput): string {
  return [
    `You are Supper, a group food ordering agent in a ${input.platform} chat.`,
    "",
    "━━ Current Order Session ━━",
    fmtSession(input.session),
    "",
    "━━ User Who Just Messaged ━━",
    `Name: ${input.userContext.displayName}`,
    "Facts:",
    fmtFacts(input.userContext),
    "",
    "━━ Group Context ━━",
    `Members tracked: ${input.groupContext.members.length}`,
    "Group facts:",
    fmtFacts(input.groupContext),
    "",
    "━━ Recent Channel Context ━━",
    fmtAmbient(input.ambient),
    "",
    RULES,
  ].join("\n")
}
