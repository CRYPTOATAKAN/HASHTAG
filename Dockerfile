# Lightweight Python runtime
FROM python:3.11-slim

WORKDIR /app

# Dosyaları kopyala
COPY . /app

# Kalıcı veri dizini (Northflank Persistent Volume buraya bağlanabilir)
VOLUME ["/app/data"]

# Port tanımlaması
ENV PORT=8080
EXPOSE 8080

# Sunucuyu başlat
CMD ["python", "server.py"]
