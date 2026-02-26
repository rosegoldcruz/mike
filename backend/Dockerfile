FROM python:3.11-slim

WORKDIR /app

# System deps for OCR (safe to include; if you don't want OCR, remove later)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libtesseract-dev \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000
CMD ["sh", "-lc", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
