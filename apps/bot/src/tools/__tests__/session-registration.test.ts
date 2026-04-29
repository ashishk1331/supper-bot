import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { clearRegistry, getTool, listTools } from "@/tools/registry"
import { registerSessionTools } from "@/tools/session"

const EXPECTED = [
  "session_get_summary",
  "session_add_item",
  "session_remove_item",
  "session_set_restaurant",
  "session_set_address",
  "session_set_party_leader",
  "session_close_for_voting",
  "session_confirm_member",
  "session_opt_out_member",
  "session_track_next_response",
  "session_record_swiggy_order",
  "session_cancel",
  "session_archive",
] as const

describe("registerSessionTools", () => {
  beforeEach(() => clearRegistry())
  afterEach(() => clearRegistry())

  test("registers every architecture §8.2 session tool", () => {
    registerSessionTools()
    expect(
      listTools()
        .map((t) => t.name)
        .sort(),
    ).toEqual([...EXPECTED].sort())
  })

  test("session_add_item validates structured cart item", () => {
    registerSessionTools()
    const t = getTool("session_add_item")
    expect(t?.inputSchema.safeParse({ user: { userId: "U1" } }).success).toBe(false)
    expect(
      t?.inputSchema.safeParse({
        user: { userId: "U1", displayName: "Rahul" },
        item: { dishId: "D1", dishName: "Biryani", qty: 1, price: 250 },
      }).success,
    ).toBe(true)
  })
})
