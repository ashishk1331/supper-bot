# supper-bot

> A self-hostable group food ordering agent that lives inside your team chat. Drop it into Slack, Discord, or Telegram and it handles the entire ordering lifecycle — browsing menus, collecting items from each member, resolving preferences, running a confirmation vote, and placing a single consolidated Swiggy order.

![Banner for supper bot repo](assets/banner.webp)

> **Status:** Slack vertical slice is working end-to-end. The orchestrator runs the real Anthropic tool-loop with the live Swiggy Food MCP catalogue, sessions persist through FalkorDB, archived sessions land in Postgres, and ✅/❌ reactions on tracked messages drive the cart without an extra LLM round-trip. Discord and Telegram adapters are wired but less battle-tested. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design.

## Why

Group ordering in chat is a coordination tax: scrolling menus, tallying votes, chasing the one person who hasn't confirmed, juggling carts. Supper turns the chat itself into the interface. No commands, no separate app — just `@supper let's get lunch`.

## Features

- **Natural language ordering** — no slash commands.
- **Collaborative carts** — every member adds their own items in the same thread.
- **Party leader system** — one person pays and receives the order; the bot tracks who.
- **Per-user memory** — dietary restrictions, favourites, past orders.
- **Per-group memory** — usual restaurants, ordering patterns, conflicts to avoid.
- **Graph-based relationship memory** — who orders with whom, dish affinities.
- **Reactions as votes** — ✅ to confirm, ❌ to opt out, no LLM round-trip needed.
- **Human-readable order IDs** — reference an order in chat as `#swift-mango-lands`.

## Supported platforms

| Platform | Connection | Public URL needed? |
|---|---|---|
| Slack | Socket Mode (WebSocket) | No |
| Discord | Gateway (WebSocket) | No |
| Telegram | Long polling (default) or webhook | No (polling) / Yes (webhook) |

`docker compose up` is enough — no domain, no reverse proxy.

## Tech stack

- **Runtime:** [Bun](https://bun.sh) + TypeScript
- **LLM:** Claude (Anthropic SDK) with tool use
- **Ordering backend:** Swiggy via [MCP](https://modelcontextprotocol.io) (food, instamart, dineout)
- **Platform SDKs:** `@slack/bolt`, `discord.js`, `grammy`
- **Storage:** PostgreSQL (facts, archived sessions) + FalkorDB (graph + Redis-compatible cache + queue)
- **Queue:** BullMQ on FalkorDB's Redis interface
- **ORM:** Drizzle
- **Validation:** Zod
- **Logging:** Pino
- **Linting/formatting:** Biome
- **Monorepo:** Bun workspaces (`apps/bot`, `packages/types`)

Full rationale and layer-by-layer design: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Repository layout

```
supper-bot/
├── apps/
│   └── bot/                       # main service
│       ├── Dockerfile             # multi-stage Bun image
│       ├── src/
│       │   ├── index.ts           # boot sequence
│       │   ├── adapters/          # slack / discord / telegram channel gateways
│       │   ├── queue/             # BullMQ producer + worker (FalkorDB-backed)
│       │   ├── agent/             # orchestrator, tool-loop, prompt builder, coalescer
│       │   ├── session/           # state machine + reaction handler
│       │   ├── memory/            # fact / graph / archive / working memory + compaction
│       │   ├── tools/             # session / memory / swiggy tool registrars + JSON-Schema
│       │   ├── mcp/                # MCP SDK client + Swiggy wrapper
│       │   ├── db/                 # Drizzle schema + migrations
│       │   └── lib/                # config, logger, ids, errors, redis, token counting
│       └── drizzle.config.ts
├── packages/
│   └── types/                     # shared TypeScript types
├── docker-compose.yml             # bot + postgres + falkordb
├── ARCHITECTURE.md
├── biome.json
├── tsconfig.base.json
└── package.json                   # bun workspace root
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2
- PostgreSQL 16+ (local or remote)
- FalkorDB (or any Redis-compatible server with the Graph module)

### Setup

```bash
git clone https://github.com/ashishk1331/supper-bot.git
cd supper-bot
cp .env.example .env
# fill in ANTHROPIC_API_KEY, SWIGGY_API_TOKEN, and at least one platform's tokens

bun install
bun run db:generate    # generate Drizzle migrations from the schema
bun run db:migrate     # apply migrations
bun run dev            # boots with --watch
```

`bun run dev` exposes `/health` on `PORT` (default `3000`) and connects every enabled platform adapter.

### Enable a platform

In `.env`, flip the relevant `*_ENABLED` flag and provide the tokens:

```env
SLACK_ENABLED=true
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

The bot crashes fast at startup if any required token is missing for an enabled platform — no silent misconfiguration.

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `bun run dev` | Start the bot in watch mode |
| `bun run start` | Start the bot once |
| `bun test` | Run the Bun test suite |
| `bun run typecheck` | Type-check every workspace |
| `bun run lint` | Biome lint + format check |
| `bun run format` | Biome auto-format the repo |
| `bun run db:generate` | Generate Drizzle migrations from the schema |
| `bun run db:migrate` | Apply pending migrations |
| `bun run docker:build` | `docker compose build` |
| `bun run docker:up` | `docker compose up -d` |
| `bun run docker:down` | `docker compose down` |
| `bun run docker:logs` | `docker compose logs -f bot` |

### One-command self-host

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY, SWIGGY_API_TOKEN, and at least one platform's tokens
bun run docker:up
```

Compose brings up the bot, PostgreSQL, and FalkorDB, runs Drizzle migrations on startup, and overrides `DATABASE_URL` / `FALKORDB_URL` to point at the service hostnames. `/health` becomes available on `PORT` (default `3000`) once the worker pool is ready.

## Configuration reference

Every variable in [`.env.example`](./.env.example) is parsed and validated by Zod at boot ([`apps/bot/src/lib/config.ts`](./apps/bot/src/lib/config.ts)). Notable groups:

- `ANTHROPIC_API_KEY`, `LLM_MODEL`
- `SWIGGY_MCP_*_URL`, `SWIGGY_API_TOKEN`
- `SLACK_*`, `DISCORD_*`, `TELEGRAM_*` — each platform is independently enable-able
- `DATABASE_URL`, `FALKORDB_URL`
- Behaviour: `SESSION_TIMEOUT_MINUTES`, `VOTING_TIMEOUT_MINUTES`, `MEMORY_RETENTION_DAYS`, `AMBIENT_BUFFER_SIZE`, `AMBIENT_BUFFER_TTL_MINUTES`
- Workers: `QUEUE_CONCURRENCY`, `QUEUE_ATTEMPTS` (BullMQ retries with exponential backoff, base 1 s)

## Privacy

- Memory is per-deployment — never shared between self-hosted instances.
- Every user can wipe their memory or export it via `memory_forget_user` / `memory_export_user` tool calls (or the chat command equivalents).
- No telemetry by default. `SENTRY_DSN` is opt-in.

## How it works (short version)

1. **Adapter** parses a platform event (Slack/Discord/Telegram). Every message goes into a per-group ambient buffer in FalkorDB; only triggered messages (mention/reply/thread/order_ref/dm) are dispatched.
2. **BullMQ** (running on FalkorDB's Redis interface) queues the `UnifiedEvent` and retries with exponential backoff on failure.
3. **Orchestrator** loads or creates the per-group `OrderSession`, appends the user message to the chat window, and enters the per-group **coalescer** — bursts of trigger messages collapse into one surviving LLM turn so a flurry of "wait, also add X" doesn't fan out into multiple replies.
4. **Tool-loop** calls Claude with the registered tool catalogue (Swiggy MCP + session + memory). Each tool call validates against its Zod schema, executes, and feeds the result back. Up to 8 iterations.
5. **Adapter** sends the final response. If the LLM declared `session_track_next_response`, the orchestrator records the just-sent message id so future ✅/❌ reactions on it drive the cart **without** re-invoking the LLM.
6. **Compaction** runs if the chat window crosses 85 % of the budget — three-stage pipeline (tool-trim → summarise → truncate). Summaries land on the session for the post-archive memory-extraction pass.
7. On terminal state, the session is archived to Postgres and FalkorDB keys are released; extraction runs async to feed user/group facts and the relationship graph.

## Roadmap

Implemented:
- ✅ Working memory + session state machine
- ✅ Slack adapter end-to-end (Discord/Telegram wired, less battle-tested)
- ✅ BullMQ + orchestrator with interrupt-style coalescer
- ✅ Swiggy Food MCP wrappers (12 live tools)
- ✅ Memory service (Postgres facts + FalkorDB graph + archive store)
- ✅ Compaction pipeline
- ✅ Docker compose / image

Not yet:
- LLM-driven memory extraction pass (currently a no-op stub; facts only come in via explicit `memory_set_fact` calls)
- Cypher-backed `UserContext.likedDishes` / `GroupContext.usualRestaurants` etc. (returned `[]` until graph queries land)
- Slack interactive button click → orchestrator routing
- Voting-timeout auto-placement
- Telegram Bot API 7.0 reaction events (allowed_updates wiring)

## Contributing

Contributions and issues welcome.

## License

[MIT](./LICENSE)
