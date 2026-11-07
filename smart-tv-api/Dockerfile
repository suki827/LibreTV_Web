FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json eslint.config.mjs vitest.config.ts ./
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts
COPY migrations ./migrations
RUN npm run typecheck && npm run lint && npm test && npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8081 DATABASE_PATH=/app/data/smart-tv.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=35s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8081/health',{signal:AbortSignal.timeout(32000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
