# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ─── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# AUTH_SECRET/DATABASE_URL are only needed at runtime; placeholder keeps build hermetic
ENV AUTH_SECRET=build-time-placeholder-value-32chars
RUN npm run build

# ─── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Writable location for the local storage driver when STORAGE_DRIVER=local
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx next start -H 0.0.0.0 -p ${PORT}"]
