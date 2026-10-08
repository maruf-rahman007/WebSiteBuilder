# syntax=docker/dockerfile:1.7
# One image serving the API and the built web app from the same origin, so
# cross-origin isolation headers and /api calls need no extra proxy setup.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
# TRUST_PROXY=1: hosts like Render/Fly/Railway put one proxy in front of the
# container; without it every visitor shares the proxy's IP and one rate limit.
# Set TRUST_PROXY=0 if you expose the container directly to the internet.
ENV NODE_ENV=production \
    PORT=8787 \
    TRUST_PROXY=1 \
    SERVE_STATIC_DIR=/app/public
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @wb/server --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./public

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "apps/server/dist/index.js"]
