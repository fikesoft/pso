FROM node:24.20.0-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY eslint.config.mjs ./
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm build
FROM node:24.20.0-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.local/files && chown node:node /app/.local /app/.local/files && chmod 700 /app/.local /app/.local/files
USER node
CMD ["node","--import","tsx","apps/api/src/public-server.ts"]
