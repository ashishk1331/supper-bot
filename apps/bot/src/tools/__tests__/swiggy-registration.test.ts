import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { clearRegistry, getTool, listTools } from "@/tools/registry"
import { registerSwiggyTools } from "@/tools/swiggy"

// Swiggy Food MCP tools we expose to the agent. `get_restaurant_menu` is
// dropped in favour of `search_menu` (which returns full ordering details);
// `get_food_orders` is dropped in favour of `track_food_order` with no
// orderId argument (returns all active orders).
const EXPECTED = [
  "get_addresses",
  "search_restaurants",
  "search_menu",
  "fetch_food_coupons",
  "apply_food_coupon",
  "flush_food_cart",
  "get_food_cart",
  "update_food_cart",
  "place_food_order",
  "get_food_order_details",
  "track_food_order",
  "report_error",
] as const

describe("registerSwiggyTools", () => {
  beforeEach(() => clearRegistry())
  afterEach(() => clearRegistry())

  test("registers every Swiggy Food MCP tool", () => {
    registerSwiggyTools()
    expect(
      listTools()
        .map((t) => t.name)
        .sort(),
    ).toEqual([...EXPECTED].sort())
  })

  test("each tool has an inputSchema and description", () => {
    registerSwiggyTools()
    for (const name of EXPECTED) {
      const t = getTool(name)
      expect(t).toBeDefined()
      expect(t?.description).toBeTruthy()
      expect(t?.inputSchema).toBeDefined()
    }
  })

  test("search_restaurants requires addressId + query", () => {
    registerSwiggyTools()
    const t = getTool("search_restaurants")
    expect(t?.inputSchema.safeParse({ query: "pizza" }).success).toBe(false)
    expect(t?.inputSchema.safeParse({ addressId: "A1", query: "" }).success).toBe(false)
    expect(t?.inputSchema.safeParse({ addressId: "A1", query: "pizza" }).success).toBe(true)
  })

  test("place_food_order requires only addressId", () => {
    registerSwiggyTools()
    const t = getTool("place_food_order")
    expect(t?.inputSchema.safeParse({}).success).toBe(false)
    expect(t?.inputSchema.safeParse({ addressId: "A1" }).success).toBe(true)
    expect(t?.inputSchema.safeParse({ addressId: "A1", paymentMethod: "COD" }).success).toBe(true)
  })

  test("update_food_cart requires restaurantId, addressId, cartItems", () => {
    registerSwiggyTools()
    const t = getTool("update_food_cart")
    expect(t?.inputSchema.safeParse({ restaurantId: "R1", addressId: "A1" }).success).toBe(false)
    expect(
      t?.inputSchema.safeParse({
        restaurantId: "R1",
        addressId: "A1",
        cartItems: [{ menu_item_id: "M1", quantity: 1 }],
      }).success,
    ).toBe(true)
  })
})
