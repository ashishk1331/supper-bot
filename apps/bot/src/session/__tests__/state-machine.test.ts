import { describe, expect, test } from "bun:test"
import { SessionStateError } from "@/lib/errors"
import {
  LEGAL_TRANSITIONS,
  TERMINAL_STATES,
  assertTransition,
  canTransition,
} from "@/session/state-machine"
import type { SessionState } from "@supper-bot/types"

const ALL_STATES: SessionState[] = [
  "idle",
  "browsing",
  "collecting",
  "voting",
  "placing",
  "complete",
  "cancelled",
]

describe("state machine", () => {
  test("legal transitions match the architecture diagram", () => {
    expect(LEGAL_TRANSITIONS.idle).toEqual(["browsing", "cancelled"])
    expect(LEGAL_TRANSITIONS.browsing).toEqual(["collecting", "cancelled"])
    expect(LEGAL_TRANSITIONS.collecting).toEqual(["voting", "cancelled"])
    expect(LEGAL_TRANSITIONS.voting).toEqual(["placing", "collecting", "cancelled"])
    expect(LEGAL_TRANSITIONS.placing).toEqual(["complete", "cancelled"])
    expect(LEGAL_TRANSITIONS.complete).toEqual([])
    expect(LEGAL_TRANSITIONS.cancelled).toEqual([])
  })

  test("terminal states have no outgoing transitions", () => {
    for (const t of TERMINAL_STATES) {
      expect(LEGAL_TRANSITIONS[t]).toEqual([])
    }
  })

  test("canTransition returns true for legal moves and false otherwise", () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const expected = LEGAL_TRANSITIONS[from].includes(to)
        expect(canTransition(from, to)).toBe(expected)
      }
    }
  })

  test("assertTransition throws SessionStateError on illegal moves", () => {
    expect(() => assertTransition("idle", "placing")).toThrow(SessionStateError)
    expect(() => assertTransition("complete", "browsing")).toThrow(SessionStateError)
    expect(() => assertTransition("voting", "browsing")).toThrow(SessionStateError)
  })

  test("assertTransition is silent on legal moves", () => {
    expect(() => assertTransition("collecting", "voting")).not.toThrow()
    expect(() => assertTransition("voting", "placing")).not.toThrow()
    expect(() => assertTransition("placing", "complete")).not.toThrow()
  })
})
