#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
import sys

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "menu.json")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

# Ortam değişkeninden gelen Admin PIN (Örn: Northflank Environment Variables)
ENV_ADMIN_PIN = os.environ.get("ADMIN_PIN", None)

class MenuRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def translate_path(self, path):
        clean_path = urllib.parse.unquote(urllib.parse.urlparse(path).path).lstrip('/')
        if clean_path == "" or clean_path == "index.html":
            clean_path = "index.html"
        elif clean_path == "admin" or clean_path == "admin.html":
            clean_path = "admin.html"

        # Arama sıralaması: En güncel olanı bul (public veya root)
        base_cand = os.path.join(BASE_DIR, clean_path)
        public_cand = os.path.join(PUBLIC_DIR, clean_path)

        if os.path.isfile(base_cand) and os.path.isfile(public_cand):
            if os.path.getmtime(base_cand) >= os.path.getmtime(public_cand):
                return base_cand
            return public_cand
        elif os.path.isfile(public_cand):
            return public_cand
        elif os.path.isfile(base_cand):
            return base_cand

        return os.path.join(PUBLIC_DIR, clean_path)

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-PIN")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-PIN")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/menu":
            # Eğer volume yeni bağlanmış ve DATA_FILE henüz yoksa, yerel şablondan otomatik oluştur
            if not os.path.exists(DATA_FILE):
                template_file = os.path.join(BASE_DIR, "data", "menu.json")
                if os.path.exists(template_file):
                    try:
                        os.makedirs(DATA_DIR, exist_ok=True)
                        with open(template_file, "r", encoding="utf-8") as f_in:
                            initial_data = json.load(f_in)
                        with open(DATA_FILE, "w", encoding="utf-8") as f_out:
                            json.dump(initial_data, f_out, ensure_ascii=False, indent=2)
                    except Exception as e:
                        print("Error auto-seeding menu.json:", e)

            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self._send_json(data)
                except Exception as e:
                    self._send_json({"error": str(e)}, status=500)
            else:
                self._send_json({"error": "Data file not found"}, status=404)
            return

        # Sağlık kontrolü (Northflank health check için)
        if path == "/healthz" or path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
            return

        if path == "/admin":
            self.path = "/admin.html"
            return super().do_GET()

        if path == "/" or path == "":
            self.path = "/index.html"
            return super().do_GET()

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ["/api/menu/update", "/api/settings/update"]:
            try:
                # Güvenlik Kontrolü: X-Admin-PIN Doğrulaması
                client_pin = self.headers.get("X-Admin-PIN", "").strip()
                
                # Geçerli PIN'i belirle (Varsa ENV_ADMIN_PIN, yoksa menu.json içindeki PIN)
                valid_pin = ENV_ADMIN_PIN
                if not valid_pin and os.path.exists(DATA_FILE):
                    try:
                        with open(DATA_FILE, "r", encoding="utf-8") as f:
                            cur_data = json.load(f)
                            valid_pin = cur_data.get("settings", {}).get("adminPin", "1234")
                    except Exception:
                        valid_pin = "1234"
                
                if not valid_pin:
                    valid_pin = "1234"

                if client_pin != valid_pin:
                    self._send_json({"status": "error", "message": "Yetkisiz erişim: Geçersiz PIN Kodu!"}, status=401)
                    return

                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                # Güvenlik: Ortam değişkeninden gelen PIN varsa ayarları koru
                if ENV_ADMIN_PIN:
                    payload.setdefault("settings", {})["adminPin"] = ENV_ADMIN_PIN

                os.makedirs(DATA_DIR, exist_ok=True)
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)

                self._send_json({"status": "success", "message": "Menü başarıyla kaydedildi."})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        self._send_json({"error": "Not Found"}, status=404)

def run():
    socketserver.TCPServer.allow_reuse_address = True
    # 0.0.0.0 ile dinleme (Docker & Cloud ortamları için zorunludur)
    with socketserver.TCPServer(("0.0.0.0", PORT), MenuRequestHandler) as httpd:
        print(f"🚀 HASHTAG QR Menü Sunucusu Çalışıyor!")
        print(f"📡 Port: {PORT}")
        print(f"👉 Müşteri Menüsü: http://localhost:{PORT}")
        print(f"👉 Yönetici Paneli: http://localhost:{PORT}/admin")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nSunucu durduruldu.")

if __name__ == "__main__":
    run()
