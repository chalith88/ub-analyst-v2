# Multi-stage Dockerfile for UB Scraper (Bank Rate Scraper)
# Builds frontend (React+Vite) and bundles backend with Playwright+Chromium
# Note: Backend runs via ts-node due to intentional type flexibility in scraper code

# ============================================================================
# Stage 1: Builder - Build frontend and prepare backend
# ============================================================================
FROM node:20-bookworm AS builder

WORKDIR /app

# Copy package files for both root and client
COPY package*.json ./
COPY client/package*.json ./client/

# Install root dependencies (include dev deps for ts-node at runtime)
RUN npm ci --legacy-peer-deps

# Install client dependencies
WORKDIR /app/client
RUN npm ci

# Copy placeholder JSON files needed for client TypeScript compilation
# These are imported by rate-combank.ts and rate-seylan.ts
WORKDIR /app
COPY output/combank.json ./output/combank.json
COPY output/seylan.json ./output/seylan.json

# Build client (React + Vite -> client/dist)
WORKDIR /app/client
COPY client/ ./
RUN npm run build

# Copy backend source (will run via ts-node at runtime)
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src

# ============================================================================
# Stage 2: Runtime - Playwright base image with Chromium + system deps
# ============================================================================
FROM mcr.microsoft.com/playwright:v1.55.1-noble AS runtime

# Install Node.js 20 and system dependencies for canvas package
RUN apt-get update && apt-get install -y \
    curl \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for ts-node)
# This is intentional - the project uses ts-node in production for type flexibility
RUN npm ci --legacy-peer-deps && \
    npx playwright install chromium --with-deps && \
    npm cache clean --force

# Copy backend source and config
COPY tsconfig.json ./
COPY src ./src

# Copy built client from builder
COPY --from=builder /app/client/dist ./client/dist

# Create output directories for data persistence
RUN mkdir -p /app/output/history && chmod 777 /app/output

# Copy pre-scraped market share data for Railway deployment
COPY output/market-share-aggregated.json ./output/
COPY output/*-market-share-ocr.json ./output/

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server using ts-node (bypasses type checking, mirrors dev workflow)
CMD ["npx", "ts-node", "-T", "src/server.ts"]

