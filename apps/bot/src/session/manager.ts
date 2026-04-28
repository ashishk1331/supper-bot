import { loadConfig } from "@/lib/config"
import { SessionStateError } from "@/lib/errors"
import { newHumanId } from "@/lib/id"
import { sessionLockKey } from "@/memory/keys"
import { withLock } from "@/memory/locks"
import {
  getChatWindow,
  deleteSession as wmDeleteSession,
  getSession as wmGetSession,
  setSession as wmSetSession,
} from "@/memory/working-memory"
import { TERMINAL_STATES, assertTransition } from "@/session/state-machine"
import type {
  ArchivedParticipant,
  ArchivedSession,
  CartItem,
  MemberCart,
  OrderSession,
  Platform,
  SessionState,
} from "@supper-bot/types"

export interface NewSessionInput {
  platform: Platform
  groupId: string
  partyLeader: { userId: string; displayName: string }
}

function sessionExpiresAt(): Date {
  const minutes = loadConfig().SESSION_TIMEOUT_MINUTES
  return new Date(Date.now() + minutes * 60 * 1000)
}

export async function createSession(input: NewSessionInput): Promise<OrderSession> {
  const existing = await wmGetSession(input.platform, input.groupId)
  if (existing && !TERMINAL_STATES.has(existing.state)) {
    throw new SessionStateError(
      `active session ${existing.sessionId} already exists for ${input.platform}:${input.groupId}`,
    )
  }
  const now = new Date()
  const session: OrderSession = {
    sessionId: newHumanId(),
    orderId: newHumanId(),
    platform: input.platform,
    groupId: input.groupId,
    state: "browsing",
    partyLeader: input.partyLeader,
    members: {
      [input.partyLeader.userId]: {
        userId: input.partyLeader.userId,
        displayName: input.partyLeader.displayName,
        items: [],
        confirmed: false,
        optedOut: false,
        lastActiveAt: now,
      },
    },
    trackedMessages: {},
    idempotencyKey: "",
    createdAt: now,
    updatedAt: now,
    expiresAt: sessionExpiresAt(),
  }
  await wmSetSession(session)
  return session
}

export async function loadSession(
  platform: Platform,
  groupId: string,
): Promise<OrderSession | null> {
  return wmGetSession(platform, groupId)
}

export async function saveSession(session: OrderSession): Promise<void> {
  session.updatedAt = new Date()
  await wmSetSession(session)
}

async function withSessionLock<T>(
  session: Pick<OrderSession, "sessionId">,
  fn: () => Promise<T>,
): Promise<T> {
  return withLock(sessionLockKey(session.sessionId), fn)
}

async function mutateSession(
  platform: Platform,
  groupId: string,
  fn: (s: OrderSession) => void | Promise<void>,
): Promise<OrderSession> {
  const loaded = await wmGetSession(platform, groupId)
  if (!loaded) throw new SessionStateError(`no session for ${platform}:${groupId}`)
  return withSessionLock(loaded, async () => {
    const fresh = (await wmGetSession(platform, groupId)) ?? loaded
    await fn(fresh)
    fresh.updatedAt = new Date()
    await wmSetSession(fresh)
    return fresh
  })
}

export async function transitionSession(
  platform: Platform,
  groupId: string,
  next: SessionState,
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    assertTransition(s.state, next)
    s.state = next
    if (next === "placing" && !s.idempotencyKey) {
      s.idempotencyKey = newHumanId()
    }
    if (TERMINAL_STATES.has(next)) {
      s.closedAt = new Date()
    }
  })
}

export interface AddItemInput {
  userId: string
  displayName: string
  item: CartItem
}

function ensureMember(s: OrderSession, userId: string, displayName: string): MemberCart {
  let member = s.members[userId]
  if (!member) {
    member = {
      userId,
      displayName,
      items: [],
      confirmed: false,
      optedOut: false,
      lastActiveAt: new Date(),
    }
    s.members[userId] = member
  }
  return member
}

export async function addItem(
  platform: Platform,
  groupId: string,
  input: AddItemInput,
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    if (s.state !== "collecting" && s.state !== "browsing") {
      throw new SessionStateError(`cannot add items in state ${s.state}`)
    }
    const member = ensureMember(s, input.userId, input.displayName)
    member.items.push(input.item)
    member.confirmed = false
    member.lastActiveAt = new Date()
  })
}

export async function removeItem(
  platform: Platform,
  groupId: string,
  userId: string,
  dishId: string,
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    const member = s.members[userId]
    if (!member) throw new SessionStateError(`no member ${userId}`)
    member.items = member.items.filter((i) => i.dishId !== dishId)
    member.confirmed = false
    member.lastActiveAt = new Date()
  })
}

export async function setRestaurant(
  platform: Platform,
  groupId: string,
  restaurant: NonNullable<OrderSession["restaurant"]>,
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    s.restaurant = restaurant
    if (s.state === "browsing") s.state = "collecting"
  })
}

export async function setAddress(
  platform: Platform,
  groupId: string,
  address: NonNullable<OrderSession["deliveryAddress"]>,
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    s.deliveryAddress = address
  })
}

export async function setPartyLeader(
  platform: Platform,
  groupId: string,
  leader: OrderSession["partyLeader"],
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    s.partyLeader = leader
    ensureMember(s, leader.userId, leader.displayName)
  })
}

export async function confirmMember(
  platform: Platform,
  groupId: string,
  userId: string,
  displayName: string,
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    const member = ensureMember(s, userId, displayName)
    member.confirmed = true
    member.optedOut = false
    member.lastActiveAt = new Date()
  })
}

export async function optOutMember(
  platform: Platform,
  groupId: string,
  userId: string,
  displayName: string,
): Promise<OrderSession> {
  return mutateSession(platform, groupId, (s) => {
    const member = ensureMember(s, userId, displayName)
    member.optedOut = true
    member.confirmed = false
    member.lastActiveAt = new Date()
  })
}

export function allActiveMembersConfirmed(s: OrderSession): boolean {
  const active = Object.values(s.members).filter((m) => !m.optedOut && m.items.length > 0)
  return active.length > 0 && active.every((m) => m.confirmed)
}

export async function archiveSession(
  platform: Platform,
  groupId: string,
): Promise<ArchivedSession | null> {
  const session = await wmGetSession(platform, groupId)
  if (!session) return null
  if (!TERMINAL_STATES.has(session.state)) {
    throw new SessionStateError(`cannot archive non-terminal session in state ${session.state}`)
  }
  const window = await getChatWindow(session.sessionId)
  const participants: ArchivedParticipant[] = Object.values(session.members)
    .filter((m) => !m.optedOut && m.items.length > 0)
    .map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      items: m.items,
      subtotal: m.items.reduce((acc, i) => acc + i.qty * i.price, 0),
    }))

  const archived: ArchivedSession = {
    sessionId: session.sessionId,
    orderId: session.orderId,
    groupId: session.groupId,
    platform: session.platform,
    partyLeaderId: session.partyLeader.userId,
    ...(session.restaurant?.id ? { restaurantId: session.restaurant.id } : {}),
    ...(session.restaurant?.name ? { restaurantName: session.restaurant.name } : {}),
    participants,
    totalAmount: participants.reduce((acc, p) => acc + p.subtotal, 0),
    ...(session.deliveryAddress ? { deliveryAddress: session.deliveryAddress } : {}),
    ...(session.swiggyOrderId ? { swiggyOrderId: session.swiggyOrderId } : {}),
    status: session.state === "complete" ? "complete" : "cancelled",
    chatHistory: (window?.messages ?? []).filter(
      (m): m is import("@supper-bot/types").ChatMessage =>
        (m as { type?: string }).type === undefined,
    ),
    ...(session.closedAt ? { placedAt: session.closedAt } : {}),
    createdAt: session.createdAt,
  }

  // Persistence to Postgres lands in Layer 5; we still clean up the FalkorDB keys.
  await wmDeleteSession(platform, groupId)
  return archived
}
