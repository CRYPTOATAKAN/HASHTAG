#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
import sys
import time

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "menu.json")
CALLS_FILE = os.path.join(DATA_DIR, "calls.json")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

# Ortam değişkeninden gelen Admin PIN (Örn: Northflank Environment Variables)
ENV_ADMIN_PIN = os.environ.get("ADMIN_PIN", None)

def get_auth_info():
    admin_pin = ENV_ADMIN_PIN or "1234"
    staff_pin = "5555"
    staff_permissions = {
        "allowStockToggle": True,
        "allowPriceEdit": False,
        "allowCallsView": True
    }
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                cur_data = json.load(f)
                s = cur_data.get("settings", {})
                if not ENV_ADMIN_PIN:
                    admin_pin = str(s.get("adminPin", "1234"))
                staff_pin = str(s.get("staffPin", "5555"))
                staff_permissions = s.get("staffPermissions", staff_permissions)
        except Exception as e:
            print("Error reading settings for auth:", e)
    return admin_pin, staff_pin, staff_permissions

def load_calls():
    if os.path.exists(CALLS_FILE):
        try:
            with open(CALLS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "calls" in data:
                    return data
                elif isinstance(data, list):
                    return {"calls": data}
        except Exception as e:
            print("Error loading calls.json:", e)
    return {"calls": []}

def save_calls(calls_data):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        # Sadece son 150 çağrıyı tut (şişmeyi önle)
        if "calls" in calls_data and len(calls_data["calls"]) > 150:
            calls_data["calls"] = calls_data["calls"][:150]
        with open(CALLS_FILE, "w", encoding="utf-8") as f:
            json.dump(calls_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Error saving calls.json:", e)

class MenuRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def translate_path(self, path):
        clean_path = urllib.parse.unquote(urllib.parse.urlparse(path).path).lstrip('/')
        if clean_path == "" or clean_path == "index.html":
            clean_path = "index.html"
        elif clean_path in ["admin", "admin.html"]:
            clean_path = "admin.html"
        elif clean_path in ["staff", "staff.html", "personel", "personel.html"]:
            clean_path = "staff.html"

        # Akıllı Dosya & Görsel Çözümleyici (Root, Images veya Public klasörlerinde otomatik arar)
        filename = os.path.basename(clean_path)
        candidates = [
            os.path.join(BASE_DIR, clean_path),
            os.path.join(PUBLIC_DIR, clean_path),
            os.path.join(BASE_DIR, filename),
            os.path.join(PUBLIC_DIR, filename),
            os.path.join(BASE_DIR, "images", filename),
            os.path.join(PUBLIC_DIR, "images", filename)
        ]

        for cand in candidates:
            if os.path.isfile(cand):
                return cand

        return os.path.join(PUBLIC_DIR, clean_path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-PIN, X-Staff-PIN")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-PIN, X-Staff-PIN")
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

        # Masa Çağrıları Listesi (Personel & Admin Paneli İçin)
        if path == "/api/calls":
            calls_data = load_calls()
            calls_list = calls_data.get("calls", [])
            pending_count = sum(1 for c in calls_list if c.get("status") == "pending")
            in_progress_count = sum(1 for c in calls_list if c.get("status") == "in_progress")
            self._send_json({
                "status": "success",
                "calls": calls_list,
                "pendingCount": pending_count,
                "inProgressCount": in_progress_count,
                "serverTime": int(time.time())
            })
            return

        # Sağlık kontrolü (Northflank health check için)
        if path == "/healthz" or path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
            return

        if path in ["/admin", "/admin/"]:
            self.path = "/admin.html"
            return super().do_GET()

        if path in ["/staff", "/staff/", "/personel", "/personel/"]:
            self.path = "/staff.html"
            return super().do_GET()

        if path == "/" or path == "":
            self.path = "/index.html"
            return super().do_GET()

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. Müşteri Tarafından Yeni Çağrı Oluşturma (Köz İste / Garson Çağır / Hesap İste)
        if path == "/api/calls":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                table = str(payload.get("table", "")).strip()
                call_type = str(payload.get("type", "waiter")).strip() # coal, waiter, bill
                note = str(payload.get("note", "")).strip()

                if not table:
                    self._send_json({"status": "error", "message": "Masa numarası belirtilmedi!"}, status=400)
                    return

                calls_data = load_calls()
                calls_list = calls_data.setdefault("calls", [])

                # Anti-Spam: Son 15 saniyede aynı masa aynı çağrıyı yapmışsa duplicate oluşturma
                current_time = int(time.time())
                for existing in calls_list:
                    if (existing.get("table") == table and 
                        existing.get("type") == call_type and 
                        existing.get("status") == "pending" and 
                        current_time - existing.get("createdTimestamp", 0) < 15):
                        self._send_json({
                            "status": "success", 
                            "message": "Talebiniz zaten personele iletildi, yoldayız!",
                            "call": existing
                        })
                        return

                type_titles = {
                    "coal": "Köz Değişimi",
                    "waiter": "Garson Çağrısı",
                    "bill": "Hesap Talebi"
                }
                type_icons = {
                    "coal": "flame",
                    "waiter": "bell",
                    "bill": "credit-card"
                }

                new_call = {
                    "id": f"call-{current_time}-{int(time.time() * 1000) % 10000}",
                    "table": table,
                    "type": call_type,
                    "typeName": type_titles.get(call_type, "Hizmet Çağrısı"),
                    "icon": type_icons.get(call_type, "bell"),
                    "status": "pending", # pending, in_progress, completed, cancelled
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "createdTimestamp": current_time,
                    "handler": "",
                    "note": note
                }

                # En yeni çağrıyı listenin başına ekle
                calls_list.insert(0, new_call)
                save_calls(calls_data)

                self._send_json({
                    "status": "success",
                    "message": f"{new_call['typeName']} personel paneline iletildi.",
                    "call": new_call
                })
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 2. Personel Çağrı Durumunu Güncelleme (Yoldayım / Tamamlandı / İptal)
        if path == "/api/calls/status":
            try:
                admin_pin, staff_pin, _ = get_auth_info()
                client_pin = self.headers.get("X-Staff-PIN", "").strip() or self.headers.get("X-Admin-PIN", "").strip()

                if client_pin != staff_pin and client_pin != admin_pin:
                    self._send_json({"status": "error", "message": "Yetkisiz erişim: Geçersiz PIN Kodu!"}, status=401)
                    return

                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                call_id = payload.get("callId")
                new_status = payload.get("status") # in_progress, completed, cancelled
                handler = payload.get("handler", "")

                calls_data = load_calls()
                updated = False
                matched_call = None

                for call in calls_data.get("calls", []):
                    if call.get("id") == call_id:
                        call["status"] = new_status
                        if handler:
                            call["handler"] = handler
                        if new_status == "completed":
                            call["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                        elif new_status == "in_progress":
                            call["inProgressAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                        matched_call = call
                        updated = True
                        break

                if updated:
                    save_calls(calls_data)
                    self._send_json({"status": "success", "call": matched_call})
                else:
                    self._send_json({"status": "error", "message": "Çağrı bulunamadı"}, status=404)
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 3. Tamamlanan Çağrıları Temizleme
        if path == "/api/calls/clear":
            try:
                admin_pin, staff_pin, _ = get_auth_info()
                client_pin = self.headers.get("X-Staff-PIN", "").strip() or self.headers.get("X-Admin-PIN", "").strip()

                if client_pin != staff_pin and client_pin != admin_pin:
                    self._send_json({"status": "error", "message": "Yetkisiz erişim!"}, status=401)
                    return

                calls_data = load_calls()
                # Sadece aktif (pending, in_progress) olanları koru, tamamlananları temizle
                calls_data["calls"] = [c for c in calls_data.get("calls", []) if c.get("status") in ["pending", "in_progress"]]
                save_calls(calls_data)
                self._send_json({"status": "success", "message": "Tamamlanan çağrılar temizlendi."})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 4. Personel Tarafından Ürün Stok Durumu Değiştirme (Tükendi / Mevcut) - Fiyat Asla Değişemez!
        if path == "/api/staff/toggle-stock":
            try:
                admin_pin, staff_pin, permissions = get_auth_info()
                client_pin = self.headers.get("X-Staff-PIN", "").strip() or self.headers.get("X-Admin-PIN", "").strip()

                if client_pin != staff_pin and client_pin != admin_pin:
                    self._send_json({"status": "error", "message": "Yetkisiz erişim: Geçersiz PIN Kodu!"}, status=401)
                    return

                # Eğer admin personelin stok değiştirme yetkisini kapatmışsa engelle
                if client_pin == staff_pin and not permissions.get("allowStockToggle", True):
                    self._send_json({"status": "error", "message": "Stok durumu değiştirme yetkiniz kapalıdır!"}, status=403)
                    return

                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                item_id = payload.get("itemId")
                is_available = payload.get("isAvailable")

                if not os.path.exists(DATA_FILE):
                    self._send_json({"status": "error", "message": "Menü dosyası bulunamadı."}, status=404)
                    return

                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    menu_obj = json.load(f)

                found = False
                for it in menu_obj.get("items", []):
                    if it.get("id") == item_id:
                        it["isAvailable"] = bool(is_available)
                        found = True
                        break

                if found:
                    with open(DATA_FILE, "w", encoding="utf-8") as f:
                        json.dump(menu_obj, f, ensure_ascii=False, indent=2)
                    self._send_json({"status": "success", "itemId": item_id, "isAvailable": is_available})
                else:
                    self._send_json({"status": "error", "message": "Ürün bulunamadı"}, status=404)
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 5. Yönetici Menü Güncelleme (Fiyatlar, Kategoriler vs. - SADECE Admin PIN Gerekir)
        if path in ["/api/menu/update", "/api/settings/update"]:
            try:
                admin_pin, _, _ = get_auth_info()
                client_pin = self.headers.get("X-Admin-PIN", "").strip()

                if client_pin != admin_pin:
                    self._send_json({"status": "error", "message": "Yetkisiz erişim: Geçersiz Admin PIN Kodu!"}, status=401)
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
        print(f"👉 Personel Paneli: http://localhost:{PORT}/personel")
        print(f"👉 Yönetici Paneli: http://localhost:{PORT}/admin")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nSunucu durduruldu.")

if __name__ == "__main__":
    run()
