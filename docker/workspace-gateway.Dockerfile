FROM node:22.20.0-bookworm-slim AS builder

WORKDIR /app

RUN npm install --global bun@1.3.13

COPY . .
RUN bun install --frozen-lockfile --ignore-scripts

ENV SIM_NEXT_BASE_URL=same-origin
RUN bun run build:workspace:vite

FROM nginx:1.27-alpine

COPY docker/workspace-gateway.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/workspace-web/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_FILTER=WORKSPACE_NEXT_FALLBACK
ENV WORKSPACE_NEXT_FALLBACK=1

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
