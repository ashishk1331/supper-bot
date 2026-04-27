import type { OrderSession, Platform } from "@supper-bot/types"

// TODO: session CRUD + state-machine transitions backed by FalkorDB working memory
export async function loadSession(_platform: Platform, _groupId: string): Promise<OrderSession | null> {
  return null
}

export async function saveSession(_session: OrderSession): Promise<void> {
  // TODO
}
