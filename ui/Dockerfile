# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
RUN apk add --no-cache bash curl docker-cli docker-cli-compose git nfs-utils rsync samba-client tzdata
WORKDIR /app
ENV NODE_ENV=production

# Set by CI from the release tag (or the short SHA for edge builds) so the
# running container can report which build it is. Defaults to "dev" for local
# builds via docker-compose.build.yml.
ARG MMC_VERSION=dev
ENV MMC_VERSION=${MMC_VERSION}

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000

# Liveness, not stack health. /api/health fans out to eight services and
# waits for all of them, so a single unreachable one (a stopped SABnzbd)
# pushed it past the probe timeout and marked this container unhealthy while
# it was serving fine. /api/health/live answers immediately and touches
# nothing, which is the actual question a healthcheck asks.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health/live || exit 1

CMD ["node", "server.js"]
