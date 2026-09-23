FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 APP_ENV=production
WORKDIR /srv

COPY pyproject.toml ./
COPY app ./app
RUN pip install . && useradd --system --uid 10001 app
COPY alembic.ini ./
COPY migrations ./migrations

USER app
EXPOSE 8000
# Migrations are a separate, explicit release step: `docker run <image> alembic upgrade head`
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
