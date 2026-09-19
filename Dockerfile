# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1. Dependencies
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# 2. Build
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Opt in to the slim standalone server output.
ENV BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# 3. Runtime
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data

# Unprivileged user. The uid is fixed so a bind-mounted data directory can be
# chowned to 1001 on the host.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# The standalone bundle already contains the minimal node_modules it needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Operational tooling (poll / notify / seed / selftest / MCP). These import the
# app's TypeScript directly and only use Node built-ins, so they run in the
# runtime image without a build step.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/mcp ./mcp
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# The SQLite directory must be owned by the runtime user, otherwise a freshly
# mounted volume is not writable and the first query fails. Any data directory
# that Next traced into the bundle is removed first, so a developer's local
# database can never ship inside the image.
RUN rm -rf /app/data && mkdir -p /app/data && chown -R nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Docker and most PaaS runtimes inject `HOSTNAME=<container-id>` at runtime,
# which overrides the ENV above and makes the standalone server bind to the
# container's own name instead of every interface. Set it at exec time so the
# app is always reachable from outside the container.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 PORT=${PORT:-3000} exec node server.js"]
