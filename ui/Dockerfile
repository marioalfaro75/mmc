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

# The deploy script and Watchtower both need a real readiness signal — "the
# process didn't exit" is not the same as "it is serving".
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
