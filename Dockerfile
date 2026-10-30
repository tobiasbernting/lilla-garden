# syntax=docker/dockerfile:1
# The game server, shipping the game (packages/clientljs, drawn with LittleJS).

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/clientljs/package.json packages/clientljs/
COPY packages/arcade/package.json packages/arcade/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r run typecheck && pnpm -r run test && pnpm --filter @lilla-garden/server --filter @lilla-garden/clientljs run build
# Production node_modules for the server only
RUN pnpm --filter @lilla-garden/server deploy --prod --legacy /out/server

FROM node:24-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /out/server/node_modules ./node_modules
COPY --from=build /app/packages/server/dist ./dist
COPY --from=build /app/packages/server/drizzle ./drizzle
COPY --from=build /app/packages/clientljs/dist ./client
ENV CLIENT_DIST=/app/client MIGRATIONS_DIR=/app/drizzle
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
USER node
CMD ["node", "dist/server/src/main.js"]
