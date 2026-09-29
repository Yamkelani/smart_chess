# ── Build stage ──────────────────────────────────────────────
FROM rust:latest AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src/ src/
RUN cargo build --release

# ── Runtime stage ────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

LABEL maintainer="Yamkelani <yamkelani@chess3d.app>" \
      description="3D Chess Engine – high-performance Rust chess engine" \
      version="1.1.0"

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r chess && useradd -r -g chess -d /app chess
WORKDIR /app
RUN mkdir -p /app/data && chown -R chess:chess /app

COPY --from=builder /app/target/release/chess-engine /usr/local/bin/chess-engine

USER chess
EXPOSE 8081
CMD ["chess-engine"]
