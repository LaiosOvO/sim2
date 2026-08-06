FROM oven/bun:1.3.13-slim AS builder

ARG SIM_SERVICE
WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run --cwd "apps/${SIM_SERVICE}" build

FROM node:22.20.0-bookworm-slim

ARG SIM_SERVICE
ENV NODE_ENV=production
ENV SIM_SERVICE=${SIM_SERVICE}
WORKDIR /app

COPY --from=builder "/app/apps/${SIM_SERVICE}/dist" /app/service
COPY scripts/runtime /app/scripts/runtime

CMD ["sh", "-c", "SIM_RUNTIME_SERVICE=${SIM_SERVICE} node --import /app/scripts/runtime/assert-node-22.mjs /app/service/index.js"]
