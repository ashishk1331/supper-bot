import { callSwiggy } from "@/mcp/swiggy"
import { type ToolDefinition, registerTool } from "@/tools/registry"
import { z } from "zod"

// ── Input schemas ─────────────────────────────────────────────────────────
// Mirror the Swiggy Food MCP reference exactly. Auth + coordinates are
// supplied automatically by the MCP session; never pass them here.

const noInput = z.object({}).strict()

const searchRestaurantsInput = z.object({
  addressId: z.string().min(1).describe("Delivery address id from get_addresses"),
  query: z.string().min(1).describe("Restaurant name or cuisine"),
  offset: z.number().int().nonnegative().optional(),
})

const searchMenuInput = z.object({
  addressId: z.string().min(1),
  query: z.string().min(1),
  restaurantIdOfAddedItem: z.string().optional(),
  vegFilter: z.union([z.literal(0), z.literal(1)]).optional(),
  offset: z.number().int().nonnegative().optional(),
})

const fetchCouponsInput = z.object({
  restaurantId: z.string().min(1),
  addressId: z.string().min(1),
  couponCode: z.string().optional(),
})

const applyCouponInput = z.object({
  couponCode: z.string().min(1),
  addressId: z.string().min(1),
  cartId: z.string().optional(),
})

const getCartInput = z.object({
  addressId: z.string().min(1),
  restaurantName: z.string().optional(),
})

const updateCartInput = z.object({
  restaurantId: z.string().min(1),
  addressId: z.string().min(1),
  restaurantName: z.string().optional(),
  cartItems: z
    .array(z.record(z.unknown()))
    .describe(
      "Items array. Each item uses EITHER 'variants' OR 'variantsV2' format — never both. Match the format from search_menu.",
    ),
})

const placeOrderInput = z.object({
  addressId: z.string().min(1),
  paymentMethod: z
    .string()
    .optional()
    .describe("Must come from availablePaymentMethods on get_food_cart"),
})

const orderIdRequired = z.object({ orderId: z.string().min(1) })
const trackOrderInput = z.object({
  orderId: z.string().optional(),
})

const reportErrorInput = z.object({
  tool: z.string().min(1),
  errorMessage: z.string().min(1),
  domain: z.string().optional(),
  flowDescription: z.string().optional(),
  toolContext: z.record(z.unknown()).optional(),
  userNotes: z.string().optional(),
})

function tool<S extends z.ZodTypeAny>(
  name: string,
  description: string,
  inputSchema: S,
  execute: ToolDefinition<z.infer<S>, unknown>["execute"],
): ToolDefinition<z.infer<S>, unknown> {
  return { name, description, inputSchema, execute }
}

export function registerSwiggyTools(): void {
  // ── Discover ─────────────────────────────────────────────────
  registerTool(
    tool(
      "get_addresses",
      "Get all saved delivery addresses for the authenticated Swiggy user, sorted by last order date. Always call this first; the user must pick an addressId before any other Food tool.",
      noInput,
      async () => callSwiggy("food", "get_addresses", {}),
    ),
  )

  registerTool(
    tool(
      "search_restaurants",
      "Search restaurants for delivery. Only recommend restaurants whose availabilityStatus is OPEN.",
      searchRestaurantsInput,
      async (input) => callSwiggy("food", "search_restaurants", input),
    ),
  )

  registerTool(
    tool(
      "search_menu",
      "Search dishes/menu items. Returns full item details with variant + addon ids needed for update_food_cart. Each item uses EITHER variants OR variantsV2; never both.",
      searchMenuInput,
      async (input) => callSwiggy("food", "search_menu", input),
    ),
  )

  // ── Cart ─────────────────────────────────────────────────────
  registerTool(
    tool(
      "fetch_food_coupons",
      "List available coupons for the cart at a restaurant. Filter to coupons valid for the cart's payment method (e.g. COD).",
      fetchCouponsInput,
      async (input) => callSwiggy("food", "fetch_food_coupons", input),
    ),
  )

  registerTool(
    tool(
      "apply_food_coupon",
      "Apply a coupon code; returns updated cart pricing.",
      applyCouponInput,
      async (input) => callSwiggy("food", "apply_food_coupon", input),
    ),
  )

  registerTool(
    tool("flush_food_cart", "Empty the food delivery cart entirely. Mutating.", noInput, async () =>
      callSwiggy("food", "flush_food_cart", {}),
    ),
  )

  registerTool(
    tool(
      "get_food_cart",
      "Read the current cart with items, valid_addons, availablePaymentMethods, and pricing. Always call this after update_food_cart since update_food_cart does not render the cart.",
      getCartInput,
      async (input) => callSwiggy("food", "get_food_cart", input),
    ),
  )

  registerTool(
    tool(
      "update_food_cart",
      "Add or update cart items. Use the variants/variantsV2 format the item already has. After calling this, call get_food_cart to display cart state.",
      updateCartInput,
      async (input) => callSwiggy("food", "update_food_cart", input),
    ),
  )

  registerTool(
    tool(
      "place_food_order",
      "Place the food delivery order. Cart total must be < ₹1000. Requires explicit user confirmation. paymentMethod must come from get_food_cart's availablePaymentMethods. For cancellations, direct users to Swiggy customer care 080-67466729.",
      placeOrderInput,
      async (input) => callSwiggy("food", "place_food_order", input),
    ),
  )

  // ── Track ────────────────────────────────────────────────────
  registerTool(
    tool(
      "get_food_order_details",
      "Get full details (items, pricing, payment, status) for a specific order.",
      orderIdRequired,
      async (input) => callSwiggy("food", "get_food_order_details", input),
    ),
  )

  registerTool(
    tool(
      "track_food_order",
      "Track delivery progress and ETA. Omit orderId to track all active orders.",
      trackOrderInput,
      async (input) => callSwiggy("food", "track_food_order", input),
    ),
  )

  // ── Support ──────────────────────────────────────────────────
  registerTool(
    tool(
      "report_error",
      "Report a failed Swiggy MCP call to the Swiggy team. Always include toolContext with identifiers from the failed call (orderId, restaurantId, addressId, cartId, etc.).",
      reportErrorInput,
      async (input) => callSwiggy("food", "report_error", input),
    ),
  )
}
