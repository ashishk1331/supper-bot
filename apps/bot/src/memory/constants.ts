export const KnownMemoryKeys = {
  // user scope
  DIETARY_RESTRICTION: "dietary.restriction",
  DIETARY_PREFERENCE: "dietary.preference",
  SPICE_LEVEL: "order.spice_level",
  ORDER_TIMING: "order.timing",
  PAYMENT_BEHAVIOR: "payment.behavior",
  ADDRESS_HOME: "address.home",
  ADDRESS_WORK: "address.work",
  CUISINE_LIKED: "cuisine.liked",
  CUISINE_DISLIKED: "cuisine.disliked",

  // group scope
  ORDER_PATTERN: "order.pattern",
  DEFAULT_ADDRESS: "address.default",
  DEFAULT_LEADER: "group.default_leader",
  CONFLICT_HISTORY: "group.conflict_history",
  BUDGET_PREFERENCE: "group.budget",

  // session scope
  STATED_BUDGET: "session.budget",
  DELIVERY_URGENCY: "session.urgency",
} as const

export const KnownNodeLabels = {
  USER: "User",
  DISH: "Dish",
  RESTAURANT: "Restaurant",
  GROUP: "Group",
  CUISINE: "Cuisine",
  TAG: "Tag",
  ORDER: "Order",
  TIME_SLOT: "TimeSlot",
} as const

export const KnownEdgeLabels = {
  LIKES: "LIKES",
  DISLIKES: "DISLIKES",
  PREFERS: "PREFERS",
  AVOIDS: "AVOIDS",
  ORDERS_WITH: "ORDERS_WITH",
  MEMBER_OF: "MEMBER_OF",
  LED_ORDER: "LED_ORDER",
  INTRODUCED_TO: "INTRODUCED_TO",
  FROM: "FROM",
  SERVES: "SERVES",
  TAGGED: "TAGGED",
  SIMILAR_TO: "SIMILAR_TO",
  USUALLY_ORDERS_FROM: "USUALLY_ORDERS_FROM",
  ORDERED_FROM: "ORDERED_FROM",
  HAD_CONFLICT_OVER: "HAD_CONFLICT_OVER",
  ORDERS_DURING: "ORDERS_DURING",
} as const

export const KnownReactionMappings = {
  CONFIRM: ["✅", "👍", "white_check_mark", "+1"],
  OPT_OUT: ["❌", "👎", "x", "-1"],
  UPVOTE: ["🔥", "❤️", "heart", "fire"],
  DOWNVOTE: ["😐", "thumbsdown"],
} as const

export const AlwaysPreserveEvents = [
  "order_placement",
  "party_leader_change",
  "member_opt_out",
  "address_confirmed",
  "restaurant_locked",
  "vote_result",
] as const

export const DefaultTokenBudget = {
  total: 180_000,
  reserved: {
    systemPrompt: 1_000,
    sessionState: 1_500,
    userContext: 800,
    groupContext: 800,
    ambientContext: 500,
    toolSchemas: 2_000,
    responseBuffer: 4_000,
  },
  availableForHistory: 169_400,
} as const
