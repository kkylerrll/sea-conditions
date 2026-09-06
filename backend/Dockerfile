FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# 建立非 root 使用者
RUN useradd -m appuser
USER appuser

EXPOSE 8000
# 綁 $PORT（Render 會注入）；沒設就用 8000（Fly / docker-compose / 本機）
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
