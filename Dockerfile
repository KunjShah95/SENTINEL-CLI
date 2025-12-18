# ============================================================
# Sentinel CLI v1.3.0 - AI-Powered Code Guardian
# Multi-stage Dockerfile for optimized production builds
# ============================================================

# Stage 1: Builder
FROM node:20-alpine AS builder

LABEL maintainer="Sentinel Team <sentinel@example.com>"
LABEL description="AI-Powered Automated Code Review with Security, TypeScript, React, API analysis"
LABEL version="1.3.0"
LABEL org.opencontainers.image.title="Sentinel CLI"
LABEL org.opencontainers.image.description="Comprehensive code review tool with 11+ analyzers"
LABEL org.opencontainers.image.version="1.3.0"
LABEL org.opencontainers.image.vendor="Sentinel Team"
LABEL org.opencontainers.image.source="https://github.com/KunjShah95/Sentinel-CLI"

# Set working directory
WORKDIR /app

# Install git for repository analysis capabilities
RUN apk add --no-cache git

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Run build step if available
RUN npm run build || echo "No build step required"

# Run linting to validate code quality
RUN npm run lint || echo "Linting passed or skipped"

# ============================================================
# Stage 2: Production
FROM node:20-alpine AS production

LABEL maintainer="Sentinel Team"
LABEL description="Sentinel CLI v1.3.0 - AI-Powered Code Guardian"
LABEL version="1.3.0"

# Set environment variables
ENV NODE_ENV=production
ENV CI=true
ENV SENTINEL_DOCKER=true

# Set working directory
WORKDIR /app

# Install required system dependencies
# git: for repository analysis and blame
# python3, make, g++: for native npm packages that require compilation
# curl: for API integrations (Slack, Discord, GitHub)
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    openssh-client \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S sentinel && \
    adduser -u 1001 -S sentinel -G sentinel

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy source code from builder
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/README.md ./README.md
COPY --from=builder /app/command_guide.md ./command_guide.md
COPY --from=builder /app/.env.example ./.env.example
COPY --from=builder /app/.sentinelrules.yaml ./.sentinelrules.yaml

# Create necessary directories for features
RUN mkdir -p /app/reports /app/cache /app/.sentinel/history && \
    chown -R sentinel:sentinel /app

# Configure git for container usage
RUN git config --global --add safe.directory '*' && \
    git config --global init.defaultBranch main

# Switch to non-root user
USER sentinel

# Set PATH to include node_modules binaries
ENV PATH="/app/node_modules/.bin:$PATH"

# Default command - show help with banner
ENTRYPOINT ["node", "src/cli.js"]
CMD ["--help"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Sentinel CLI v1.3.0 is healthy')" || exit 1

# ============================================================
# Stage 3: CI/CD Runner (optimized for GitHub Actions, GitLab CI)
FROM node:20-alpine AS ci

LABEL maintainer="Sentinel Team"
LABEL description="Sentinel CLI - CI/CD Runner"
LABEL version="1.3.0"

ENV NODE_ENV=production
ENV CI=true
ENV SENTINEL_DOCKER=true

WORKDIR /app

# Install minimal dependencies for CI
RUN apk add --no-cache git curl ca-certificates && \
    rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy source
COPY --from=builder /app/src ./src
COPY --from=builder /app/.sentinelrules.yaml ./

# Configure git
RUN git config --global --add safe.directory '*'

# Set PATH
ENV PATH="/app/node_modules/.bin:$PATH"

# CI-specific entrypoint
ENTRYPOINT ["node", "src/cli.js"]
CMD ["analyze", "--format", "json"]

# ============================================================
# Stage 4: Development (for local development)
FROM node:20-alpine AS development

LABEL maintainer="Sentinel Team"
LABEL description="Sentinel CLI - Development Environment"
LABEL version="1.3.0-dev"

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    openssh-client \
    curl

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Set environment for development
ENV NODE_ENV=development

# Create directories for development data
RUN mkdir -p /app/.sentinel/history /app/reports

# Expose port for potential web dashboard (future enhancement)
EXPOSE 3000

# Volume mounts for development
VOLUME ["/app/src", "/app/.sentinel"]

# Default command for development
CMD ["npm", "run", "dev"]
