# Multi-stage build: compile the RSC bundle, then ship a slim runtime image.
# The panel downloads its own JDKs into the persistent /data volume at first use.
FROM node:26-bookworm-slim AS build
ENV PNPM_VERSION=12.14.0
RUN npm install -g pnpm@$PNPM_VERSION && pnpm config set store-dir ~/.pnpm-store
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:26-bookworm-slim AS runtime
# The preview runtime is vite itself: it serves the client assets and runs the
# compiled RSC/SSR bundle, so node_modules ships in the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# The runtime compiles the internal metrics agent from these sources on first start.
COPY --from=build /app/agent ./agent
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
USER node
VOLUME /data
ENV PANEL_DATA_DIR=/data
EXPOSE 5173 25565
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:5173/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# exec form so SIGTERM reaches the panel for graceful shutdown of managed Java processes;
# compose sets stop_grace_period to outlast Minecraft's stop timeout.
ENTRYPOINT ["node", "node_modules/vite/bin/vite.js", "preview", "--host", "0.0.0.0", "--port", "5173"]
