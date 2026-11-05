# OMNICAT ENTERPRISE - PRODUCTION DOCKERFILE
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim AS runner

WORKDIR /app

COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

COPY backend/ backend/
COPY database/ database/
COPY data/migrated_omnicat_seed.json data/migrated_omnicat_seed.json
COPY frontend/ frontend/
COPY scripts/init_db_from_seed.py scripts/init_db_from_seed.py

# Initialize database from seed on image build
RUN python scripts/init_db_from_seed.py

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

