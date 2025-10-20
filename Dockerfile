# Multi-stage build for optimized production image

# Stage 1: Dependencies
FROM node:22-alpine AS dependencies

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    vips-dev \
    build-base \
    sqlite \
    && pip3 install --no-cache-dir --upgrade pip setuptools wheel

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for building)
RUN npm ci --include=dev

# Stage 2: Builder
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Stage 3: Production runtime
FROM node:22-alpine AS production

# Install only runtime dependencies
RUN apk add --no-cache \
    sqlite \
    curl \
    dumb-init \
    tini

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Create data directories with proper permissions
RUN mkdir -p /app/data /app/tokens /app/logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Run production server
CMD ["node", "dist/server.js"]

# Stage 4: Development
FROM node:22-alpine AS development

# Install all dependencies including Chromium for WhatsApp
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    vips-dev \
    build-base \
    sqlite \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Create data directories
RUN mkdir -p /app/data /app/tokens /app/logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

# Run development server
CMD ["npm", "run", "dev"]