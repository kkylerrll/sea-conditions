FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# 建立非 root 使用者
RUN useradd -m appuser
USER appuser

EXPOSE 8000
# 先跑 DB 遷移（alembic upgrade head），再綁 $PORT 起服務
# （$PORT 由 Render 注入；沒設就用 8000 給 Fly / docker-compose / 本機）
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
