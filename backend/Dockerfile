# ============================================
# Backend Dockerfile - Multi-stage Build
# ============================================
# Stage 1: Install dependencies
# Stage 2: Build TypeScript
# Stage 3: Production image (slim)
# ============================================

# --- Stage 1: Dependencies ---
FROM node:20-slim AS deps
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# --- Stage 2: Build ---
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# --- Stage 3: Production ---
FROM node:20-slim AS runner
WORKDIR /app

# Install OpenSSL (required by Prisma at runtime)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# Create storage directory
RUN mkdir -p storage/uploads && chown -R node:node /app

USER node

EXPOSE 3001

# Startup: Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
