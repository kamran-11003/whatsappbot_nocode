FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY worker.py .
COPY start-worker.sh .
RUN chmod +x start-worker.sh

ENV PYTHONUNBUFFERED=1
# Cloud Run sets $PORT; default to 8000 for local/docker-compose use
ENV PORT=8000

# Shell form so $PORT is expanded at runtime
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 4
