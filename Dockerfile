# syntax=docker/dockerfile:1
# CLIENT picks the game client the server ships: `clientljs` (2D, Lilla Gården, drawn with LittleJS), `client3d`
# (3D, Lilla Gården v2) or `client` (the earlier 2D client, Phaser, kept as a fallback).
ARG CLIENT=clientljs

FROM node:24-alpine AS build
ARG CLIENT
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/client3d/package.json packages/client3d/
COPY packages/clientljs/package.json packages/clientljs/
COPY packages/arcade/package.json packages/arcade/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r run typecheck && pnpm -r run test && pnpm --filter @lilla-garden/server --filter "@lilla-garden/${CLIENT}" run build
# Production node_modules for the server only
RUN pnpm --filter @lilla-garden/server deploy --prod --legacy /out/server

FROM node:24-alpine
ARG CLIENT
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /out/server/node_modules ./node_modules
COPY --from=build /app/packages/server/dist ./dist
COPY --from=build /app/packages/server/drizzle ./drizzle
COPY --from=build /app/packages/${CLIENT}/dist ./client
ENV CLIENT_DIST=/app/client MIGRATIONS_DIR=/app/drizzle
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
USER node
CMD ["node", "dist/server/src/main.js"]
