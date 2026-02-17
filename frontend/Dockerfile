# ============================================
# Frontend Dockerfile - Multi-stage Build
# ============================================
# Stage 1: Install dependencies
# Stage 2: Build Next.js
# Stage 3: Production image (standalone)
# ============================================

# --- Stage 1: Dependencies ---
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# --- Stage 2: Build ---
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env variable for API URL
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Enable standalone output for Docker
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage 3: Production (standalone) ---
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone output (includes server.js + minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN chown -R node:node /app
USER node

EXPOSE 3000

# Next.js standalone server
CMD ["node", "server.js"]
