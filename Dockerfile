# Multi-stage Dockerfile for OmniCat
# Stage 1: Base
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

# Stage 2: Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 3: Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm prisma generate
RUN pnpm build

# Stage 4: Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Jakarta
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HOME=/home/nextjs
ENV NODE_PATH="/usr/local/lib/node_modules"

# Install Chromium, fonts, and required tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install prisma and tsx globally so CLI tools work directly in terminal & entrypoint
RUN npm install -g prisma@7.10.1 tsx@4.23.15

# Create dedicated home directory and non-root user
RUN mkdir -p /home/nextjs /pnpm && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs --ingroup nodejs nextjs && \
    chown -R nextjs:nodejs /home/nextjs /pnpm

# Create uploads directory and set permissions
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data && chmod -R 775 /data

# Copy full node_modules from deps stage so tsx seed, prisma CLI, and Next.js
# runtime can resolve all production modules (adapter-pg, pg, argon2, pino, etc.)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy source and prisma configuration files needed for migrations, seeding, and CLI commands
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown nextjs:nodejs ./docker-entrypoint.sh

# Copy public & standalone assets (overwrites server.js and .next/ from standalone)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
