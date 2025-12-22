# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/bash nodejs

# Copy package files and install all dependencies (vite is needed at runtime)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy vite config and client files needed at runtime
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/client ./client
COPY --from=builder /app/attached_assets ./attached_assets

# Create uploads directory
RUN mkdir -p uploads && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:5000/api/health || exit 1

# Start the application
ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/index.js"]
