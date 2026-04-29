FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────
# Install workspace deps using lockfile + manifests only, so dependency
# resolution is cached across source-only changes.
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/types/package.json ./packages/types/
RUN bun install --frozen-lockfile

# ── Runner ───────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY . .

EXPOSE 3000

# Run pending Drizzle migrations, then start the bot.
CMD ["sh", "-c", "bun run db:migrate && bun run --cwd apps/bot start"]
