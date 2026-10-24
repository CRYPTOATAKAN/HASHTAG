# Lightweight Python runtime
FROM python:3.11-slim

WORKDIR /app

# Sistem bağımlılıkları ve SSL sertifikaları
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Bağımlılıkları kur
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Dosyaları kopyala
COPY . /app

# Kalıcı veri dizini (Northflank Persistent Volume)
VOLUME ["/app/data"]

# Port tanımlaması
ENV PORT=8080
EXPOSE 8080

# Sunucuyu başlat
CMD ["python", "server.py"]
