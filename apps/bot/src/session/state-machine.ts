import { SessionStateError } from "@/lib/errors"
import type { SessionState } from "@supper-bot/types"

export const LEGAL_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  idle: ["browsing", "cancelled"],
  browsing: ["collecting", "cancelled"],
  collecting: ["voting", "cancelled"],
  voting: ["placing", "collecting", "cancelled"],
  placing: ["complete", "cancelled"],
  complete: [],
  cancelled: [],
}

export const TERMINAL_STATES: ReadonlySet<SessionState> = new Set(["complete", "cancelled"])

export function canTransition(from: SessionState, to: SessionState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: SessionState, to: SessionState): void {
  if (!canTransition(from, to)) {
    throw new SessionStateError(`illegal transition: ${from} -> ${to}`)
  }
}
