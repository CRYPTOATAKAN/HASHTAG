#!/bin/bash
# HASHTAG QR Menü Tek Tıkla Başlatıcı
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=========================================="
echo "💨 HASHTAG LOUNGE & HOOKAH QR MENÜ"
echo "=========================================="
echo "Sunucu başlatılıyor..."

# 1 saniye sonra tarayıcıda menüyü ve yönetim panelini otomatik aç
(sleep 1.5 && open "http://localhost:8080" && open "http://localhost:8080/admin") &

# Python sunucusunu çalıştır
/usr/bin/python3 server.py
