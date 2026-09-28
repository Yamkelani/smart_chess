# ── Build stage ──────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

LABEL maintainer="Yamkelani <yamkelani@chess3d.app>" \
      description="3D Chess Frontend – Three.js 3D chess interface" \
      version="1.1.0"

RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -f http://localhost:80/ || exit 1
