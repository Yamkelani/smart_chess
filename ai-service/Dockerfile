# ── AI Service ───────────────────────────────────────────────
FROM python:3.12-slim

LABEL maintainer="Yamkelani <yamkelani@chess3d.app>" \
      description="3D Chess AI Service – AlphaZero-style neural network" \
      version="1.1.0"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

# Copy application code
COPY app/ app/

# Create data directories
RUN groupadd -r chess && useradd -r -g chess -d /app chess \
    && mkdir -p models training_data data \
    && chown -R chess:chess /app

USER chess
EXPOSE 8082

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8082/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8082", "--workers", "1"]
