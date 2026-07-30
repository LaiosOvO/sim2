# ========================================
# Base Stage: Alpine Linux with Bun
# ========================================
FROM oven/bun:1.3.13-alpine AS base

RUN apk add --no-cache libc6-compat curl

# ========================================
# Pruner Stage: Emit a minimal monorepo subset that @sim/realtime depends on
# ========================================
FROM base AS pruner
WORKDIR /app

RUN bun add -g turbo

COPY . .

RUN turbo prune @sim/realtime --docker

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
WORKDIR /app

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock

RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --linker=hoisted --omit=dev --ignore-scripts

# ========================================
# Builder Stage: Emit a Node-targeted Realtime artifact
# ========================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app ./
COPY --from=pruner /app/out/full/ ./

RUN cd apps/realtime && bun run build

# ========================================
# Runner Stage: Run the Socket Server with Node 22
# ========================================
FROM node:22.20.0-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat curl

ENV NODE_ENV=production \
    SIM_RUNTIME_SERVICE=realtime \
    PORT=3002 \
    HOSTNAME="0.0.0.0"

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

COPY --from=deps --chown=nextjs:nodejs /app ./
COPY --from=pruner --chown=nextjs:nodejs /app/out/full/ ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/realtime/dist ./apps/realtime/dist
COPY --from=pruner --chown=nextjs:nodejs /app/scripts/runtime/assert-node-22.mjs ./scripts/runtime/assert-node-22.mjs

USER nextjs

EXPOSE 3002

CMD ["node", "--import", "./scripts/runtime/assert-node-22.mjs", "apps/realtime/dist/bootstrap.js"]
