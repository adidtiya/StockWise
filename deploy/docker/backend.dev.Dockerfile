FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY src/backend /app

RUN pip install --no-cache-dir -e .

ARG USER_ID=1000
ARG GROUP_ID=1000

RUN addgroup --system --gid ${GROUP_ID} appgroup && \
    adduser --system --uid ${USER_ID} --ingroup appgroup appuser

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--reload", \
     "--reload-dir", "/app"]

