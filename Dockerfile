FROM node:22-alpine

# Install dependencies for native modules (sharp, better-sqlite3)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    vips-dev \
    build-base \
    sqlite \
    curl \
    && pip3 install --no-cache-dir --upgrade pip setuptools wheel

# Create app directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --include=dev --no-optional=false

# Copy source code
COPY . .

# Create data directories
RUN mkdir -p /app/data /app/tokens

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run in development mode
CMD ["npm", "run", "dev"]