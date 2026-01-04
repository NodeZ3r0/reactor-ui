# REACTOR UI - Production Dockerfile with Caddy
# Multi-stage build for optimized image

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}


# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build for production
RUN npm run build

# Stage 2: Production with Caddy
FROM caddy:2-alpine

# Copy built assets
COPY --from=builder /app/dist /srv

# Create Caddyfile
RUN echo 'http:// {' > /etc/caddy/Caddyfile && \
    echo '    root * /srv' >> /etc/caddy/Caddyfile && \
    echo '    file_server' >> /etc/caddy/Caddyfile && \
    echo '    try_files {path} /index.html' >> /etc/caddy/Caddyfile && \
    echo '    encode gzip' >> /etc/caddy/Caddyfile && \
    echo '}' >> /etc/caddy/Caddyfile

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Run Caddy
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
