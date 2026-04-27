# supper-bot

> A self-hostable group food ordering agent that lives inside your team chat. Drop it into Slack, Discord, or Telegram and it handles the entire ordering lifecycle — browsing menus, collecting items from each member, resolving preferences, running a confirmation vote, and placing a single consolidated Swiggy order.

![Banner for supper bot repo](assets/banner.webp)

> **Status:** early scaffolding. Architecture and types are in place; layers are stubs awaiting implementation. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

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
│       ├── src/
│       │   ├── index.ts           # boot sequence
│       │   ├── adapters/          # slack / discord / telegram channel gateways
│       │   ├── queue/             # BullMQ producer + worker
│       │   ├── agent/             # LLM orchestrator, prompt builder, Anthropic client
│       │   ├── session/           # order session state machine
│       │   ├── memory/            # fact store, graph store, working memory, compaction
│       │   ├── tools/             # session / memory / swiggy tool registrars
│       │   ├── mcp/                # MCP client + Swiggy wrapper
│       │   ├── db/                 # Drizzle schema + migrations
│       │   └── lib/                # config, logger, ids, errors, token counting
│       └── drizzle.config.ts
├── packages/
│   └── types/                     # shared TypeScript types
├── ARCHITECTURE.md
├── biome.json
├── tsconfig.base.json
└── package.json                   # workspace root
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
| `bun run typecheck` | Type-check every workspace |
| `bun run lint` | Biome lint + format check |
| `bun run format` | Biome auto-format the repo |
| `bun run db:generate` | Generate Drizzle migrations from the schema |
| `bun run db:migrate` | Apply pending migrations |

## Configuration reference

Every variable in [`.env.example`](./.env.example) is parsed and validated by Zod at boot ([`apps/bot/src/lib/config.ts`](./apps/bot/src/lib/config.ts)). Notable groups:

- `ANTHROPIC_API_KEY`, `LLM_MODEL`
- `SWIGGY_MCP_*_URL`, `SWIGGY_API_TOKEN`
- `SLACK_*`, `DISCORD_*`, `TELEGRAM_*` — each platform is independently enable-able
- `DATABASE_URL`, `FALKORDB_URL`
- Behaviour: `SESSION_TIMEOUT_MINUTES`, `VOTING_TIMEOUT_MINUTES`, `MEMORY_RETENTION_DAYS`, `AMBIENT_BUFFER_SIZE`
- Workers: `QUEUE_CONCURRENCY`, `QUEUE_ATTEMPTS`

## Privacy

- Memory is per-deployment — never shared between self-hosted instances.
- Every user can wipe their memory or export it via `memory_forget_user` / `memory_export_user` tool calls (or the chat command equivalents).
- No telemetry by default. `SENTRY_DSN` is opt-in.

## Roadmap

The skeleton compiles and boots. The implementation work, in rough dependency order:

1. Working memory (FalkorDB / Redis) + session state machine
2. One platform adapter end-to-end (likely Slack, simplest UI)
3. BullMQ wiring + orchestrator skeleton
4. MCP client + Swiggy tool wrappers
5. Memory service (Postgres facts + FalkorDB graph) + extraction engine
6. Context-window compaction pipeline
7. Remaining adapters (Discord, Telegram)
8. Docker compose / image

## Contributing

Currently a solo build — contributions and issues welcome once the first vertical slice (Slack → Swiggy place_order) is working end-to-end.

## License

[MIT](./LICENSE)
