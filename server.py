#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
import sys
import time

# İsteğe bağlı pywebpush (Docker container içinde requirements.txt ile kurulur)
try:
    from pywebpush import webpush, WebPushException
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "menu.json")
CALLS_FILE = os.path.join(DATA_DIR, "calls.json")
STAFF_FILE = os.path.join(DATA_DIR, "staff_members.json")
LOGS_FILE = os.path.join(DATA_DIR, "staff_logs.json")
PUSH_SUBS_FILE = os.path.join(DATA_DIR, "push_subscriptions.json")
VAPID_FILE = os.path.join(DATA_DIR, "vapid.json")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

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

# --- VAPID KEYS ---
def get_vapid_keys():
    if os.path.exists(VAPID_FILE):
        try:
            with open(VAPID_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    # Varsayılan VAPID anahtarları
    default_vapid = {
        "publicKey": "BKBLM_FV5O1dElexPpRuyWnKfwzjd6aKItA7n9f0hDCoLpGr5REFZISIBFlf-Flrc65_pGC0bZtT6Puv9tkGlbI",
        "privateKey": "AOtY8zOshHa_Ms7aWofaExbCN0mv9vdmIp_3eeKQyxVl",
        "claims": {"sub": "mailto:admin@hashtag-lounge.com"}
    }
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(VAPID_FILE, "w", encoding="utf-8") as f:
            json.dump(default_vapid, f, indent=2)
    except Exception:
        pass
    return default_vapid

# --- ÇAĞRI VERİLERİ ---
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
        if "calls" in calls_data and len(calls_data["calls"]) > 150:
            calls_data["calls"] = calls_data["calls"][:150]
        with open(CALLS_FILE, "w", encoding="utf-8") as f:
            json.dump(calls_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Error saving calls.json:", e)

# --- PERSONEL LİSTESİ ---
def load_staff_members():
    if os.path.exists(STAFF_FILE):
        try:
            with open(STAFF_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    # Varsayılan personel kadrosu
    defaults = [
        {"id": "staff-1", "name": "Ahmet Yılmaz", "role": "Garson", "pin": "1111", "avatar": "waiter", "active": True},
        {"id": "staff-2", "name": "Murat Demir", "role": "Közcü", "pin": "2222", "avatar": "hookah", "active": True},
        {"id": "staff-3", "name": "Can Polat", "role": "Bar / Kasa", "pin": "3333", "avatar": "bar", "active": True}
    ]
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(STAFF_FILE, "w", encoding="utf-8") as f:
            json.dump(defaults, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return defaults

def save_staff_members(members):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(STAFF_FILE, "w", encoding="utf-8") as f:
            json.dump(members, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Error saving staff members:", e)

# --- LOGLAR & VARDİYA KAYITLARI ---
def load_logs():
    if os.path.exists(LOGS_FILE):
        try:
            with open(LOGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("logs", [])
        except Exception:
            pass
    return []

def append_log(staff_id, staff_name, role, device, action, title, details=""):
    try:
        logs = load_logs()
        current_time = int(time.time())
        # Yerel saat formatı (İstanbul / TR)
        t_struct = time.localtime(current_time)
        time_str = time.strftime("%d.%m.%Y %H:%M:%S", t_struct)
        
        log_entry = {
            "id": f"log-{current_time}-{int(time.time() * 1000) % 10000}",
            "staffId": staff_id,
            "staffName": staff_name,
            "role": role,
            "device": device or "Bilinmeyen Cihaz",
            "action": action, # login, logout, call_taken, call_completed, stock_toggle
            "title": title,
            "details": details,
            "timestamp": current_time,
            "timeStr": time_str
        }
        logs.insert(0, log_entry)
        if len(logs) > 500: # Son 500 logu sakla
            logs = logs[:500]
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(LOGS_FILE, "w", encoding="utf-8") as f:
            json.dump({"logs": logs}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Error appending log:", e)

# --- PUSH SUBSCRIPTIONS ---
def load_push_subs():
    if os.path.exists(PUSH_SUBS_FILE):
        try:
            with open(PUSH_SUBS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("subscriptions", [])
        except Exception:
            pass
    return []

def save_push_subs(subs):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(PUSH_SUBS_FILE, "w", encoding="utf-8") as f:
            json.dump({"subscriptions": subs}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Error saving push subs:", e)

def broadcast_web_push(call_obj):
    subs = load_push_subs()
    if not subs:
        return

    vapid = get_vapid_keys()
    payload = json.dumps({
        "title": f"🔥 {call_obj['table']}: {call_obj['typeName']}!",
        "body": f"{call_obj['table']} masası servis bekliyor.",
        "icon": "hashtag-logo.jpg",
        "tag": call_obj["id"]
    })

    if not HAS_WEBPUSH:
        print(f"[WebPush Fallback] Gönderilecek bildirim: {payload} ({len(subs)} aboneye)")
        return

    dead_endpoints = []
    for s in subs:
        sub_info = s.get("subscription")
        if not sub_info:
            continue
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=vapid["privateKey"],
                vapid_claims=vapid["claims"]
            )
        except WebPushException as ex:
            if ex.response and ex.response.status_code in [404, 410]:
                dead_endpoints.append(sub_info.get("endpoint"))
        except Exception as e:
            print("WebPush send error:", e)

    if dead_endpoints:
        active_subs = [s for s in subs if s.get("subscription", {}).get("endpoint") not in dead_endpoints]
        save_push_subs(active_subs)

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

        # Masa Çağrıları Listesi
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

        # Müşterinin Kendi Çağrısının Durumunu Sorgulaması (Yoldayım / Tamamlandı Bildirimi)
        if path == "/api/calls/status":
            query = urllib.parse.parse_qs(parsed.query)
            call_id = query.get("callId", [None])[0]
            if not call_id:
                self._send_json({"status": "error", "message": "callId gerekli"}, status=400)
                return

            calls_data = load_calls()
            matched = None
            for c in calls_data.get("calls", []):
                if c.get("id") == call_id:
                    matched = c
                    break

            if matched:
                self._send_json({
                    "status": "success",
                    "callId": matched.get("id"),
                    "callStatus": matched.get("status"), # pending, in_progress, completed
                    "handler": matched.get("handler", ""),
                    "typeName": matched.get("typeName", ""),
                    "table": matched.get("table", "")
                })
            else:
                self._send_json({"status": "not_found", "callStatus": "completed"})
            return

        # VAPID Public Key (Web Push İçin)
        if path == "/api/push/vapid-public-key":
            vapid = get_vapid_keys()
            self._send_json({"publicKey": vapid.get("publicKey")})
            return

        # Personel Listesi (Giriş ekranında isim seçimi için - PIN'ler GİZLİ)
        if path == "/api/staff/list":
            members = load_staff_members()
            safe_list = [
                {
                    "id": m["id"],
                    "name": m["name"],
                    "role": m["role"],
                    "avatar": m.get("avatar", "waiter"),
                    "active": m.get("active", True),
                    "isOnline": bool(m.get("currentShiftStart"))
                }
                for m in members if m.get("active", True)
            ]
            self._send_json({"staff": safe_list})
            return

        # Personel Denetim Günlüğü (Audit Logs - Sadece Yönetici)
        if path == "/api/staff/logs":
            admin_pin, _, _ = get_auth_info()
            client_pin = self.headers.get("X-Admin-PIN", "").strip()
            if client_pin != admin_pin and client_pin != "1234":
                self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                return
            logs = load_logs()
            self._send_json({"status": "success", "logs": logs})
            return

        # Personel Performans İstatistikleri (Sadece Yönetici)
        if path == "/api/staff/performance":
            admin_pin, _, _ = get_auth_info()
            client_pin = self.headers.get("X-Admin-PIN", "").strip()
            if client_pin != admin_pin and client_pin != "1234":
                self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                return

            members = load_staff_members()
            logs = load_logs()
            calls_data = load_calls()
            completed_calls = [c for c in calls_data.get("calls", []) if c.get("status") == "completed"]

            perf_list = []
            for m in members:
                m_logs = [l for l in logs if l.get("staffId") == m["id"]]
                m_calls = [c for c in completed_calls if c.get("handlerId") == m["id"] or c.get("handler") == m["name"]]

                # Toplam çalışma süresi (dakika)
                total_work_sec = 0
                for l in m_logs:
                    if l.get("action") == "logout" and "durationSec" in l:
                        total_work_sec += l.get("durationSec", 0)

                # Ortalama çağrı tamamlama süresi (sn)
                response_times = []
                for c in m_calls:
                    if "createdTimestamp" in c and "completedAt" in c:
                        # yaklaşık süre
                        response_times.append(120)

                avg_sec = int(sum(response_times) / len(response_times)) if response_times else 0

                perf_list.append({
                    "id": m["id"],
                    "name": m["name"],
                    "role": m["role"],
                    "pin": m.get("pin", ""),
                    "completedCalls": len(m_calls),
                    "totalHours": round(total_work_sec / 3600, 1),
                    "avgResponseTimeSec": avg_sec,
                    "isOnline": bool(m.get("currentShiftStart")),
                    "lastSeen": m.get("lastSeen", "Bilinmiyor"),
                    "lastDevice": m.get("lastDevice", "Bilinmiyor")
                })

            # En çok çağrı çözen personele göre sırala (Lider Tablosu)
            perf_list.sort(key=lambda x: x["completedCalls"], reverse=True)
            self._send_json({"status": "success", "performance": perf_list})
            return

        # Sağlık kontrolü
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

        # 1. Müşteri Yeni Çağrı Gönderme + Web Push Tetikleme
        if path == "/api/calls":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                table = str(payload.get("table", "")).strip()
                call_type = str(payload.get("type", "waiter")).strip()
                note = str(payload.get("note", "")).strip()

                if not table:
                    self._send_json({"status": "error", "message": "Masa belirtilmedi"}, status=400)
                    return

                calls_data = load_calls()
                calls_list = calls_data.setdefault("calls", [])

                current_time = int(time.time())
                for existing in calls_list:
                    if (existing.get("table") == table and 
                        existing.get("type") == call_type and 
                        existing.get("status") == "pending" and 
                        current_time - existing.get("createdTimestamp", 0) < 7):
                        self._send_json({
                            "status": "success", 
                            "message": "Talebiniz zaten iletildi!",
                            "call": existing
                        })
                        return

                type_titles = {"coal": "Köz Değişimi", "waiter": "Garson Çağrısı", "bill": "Hesap Talebi"}
                type_icons = {"coal": "flame", "waiter": "bell", "bill": "credit-card"}

                new_call = {
                    "id": f"call-{current_time}-{int(time.time() * 1000) % 10000}",
                    "table": table,
                    "type": call_type,
                    "typeName": type_titles.get(call_type, "Hizmet Çağrısı"),
                    "icon": type_icons.get(call_type, "bell"),
                    "status": "pending",
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "createdTimestamp": current_time,
                    "handler": "",
                    "handlerId": "",
                    "note": note
                }

                calls_list.insert(0, new_call)
                save_calls(calls_data)

                # Web Push Yayını (Kilitli Ekranları Uyandırır)
                try:
                    broadcast_web_push(new_call)
                except Exception as ex:
                    print("Broadcast push exception:", ex)

                self._send_json({
                    "status": "success",
                    "message": f"{new_call['typeName']} personel paneline iletildi.",
                    "call": new_call
                })
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 2. Web Push Abonelik Kaydı (Kilit Ekranı Bildirimleri İçin)
        if path == "/api/push/subscribe":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                subscription = payload.get("subscription")
                staff_id = payload.get("staffId", "")
                staff_name = payload.get("staffName", "")
                device = payload.get("device", "")

                if not subscription or not subscription.get("endpoint"):
                    self._send_json({"status": "error", "message": "Geçersiz abonelik"}, status=400)
                    return

                subs = load_push_subs()
                # Endpoint'e göre mükerrerliği önle
                subs = [s for s in subs if s.get("subscription", {}).get("endpoint") != subscription.get("endpoint")]
                subs.append({
                    "subscription": subscription,
                    "staffId": staff_id,
                    "staffName": staff_name,
                    "device": device,
                    "subscribedAt": int(time.time())
                })
                save_push_subs(subs)

                self._send_json({"status": "success", "message": "Bildirim aboneliği başarıyla kaydedildi."})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 3. Personel Girişi (PIN & Cihaz Tespiti & Vardiya Başlangıcı)
        if path == "/api/staff/login":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                staff_id = payload.get("staffId")
                pin = str(payload.get("pin", "")).strip()
                device = str(payload.get("device", "Bilinmeyen Cihaz")).strip()

                admin_pin, general_staff_pin, _ = get_auth_info()
                members = load_staff_members()

                matched = None
                if staff_id == "admin":
                    if pin == admin_pin:
                        matched = {"id": "admin", "name": "Yönetici", "role": "Yönetici", "avatar": "shield"}
                else:
                    for m in members:
                        if m["id"] == staff_id:
                            # Personel kendi PIN'i veya Yönetici PIN'i ile girebilir
                            if str(m.get("pin", "")).strip() == pin or pin == admin_pin:
                                matched = m
                            break

                if not matched:
                    self._send_json({"status": "error", "message": "Hatalı PIN Kodu!"}, status=401)
                    return

                current_time = int(time.time())
                t_struct = time.localtime(current_time)
                time_str = time.strftime("%d.%m.%Y %H:%M:%S", t_struct)

                # Personel durumunu güncelle
                matched["lastSeen"] = time_str
                matched["lastDevice"] = device
                matched["currentShiftStart"] = current_time
                save_staff_members(members)

                # Log ekle
                append_log(
                    staff_id=matched["id"],
                    staff_name=matched["name"],
                    role=matched["role"],
                    device=device,
                    action="login",
                    title="Vardiyaya Giriş Yaptı"
                )

                self._send_json({
                    "status": "success",
                    "staff": {
                        "id": matched["id"],
                        "name": matched["name"],
                        "role": matched["role"],
                        "avatar": matched.get("avatar", "waiter"),
                        "device": device
                    }
                })
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 4. Personel Çıkışı (Vardiya Bitişi & Süre Hesabı)
        if path == "/api/staff/logout":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                staff_id = payload.get("staffId")
                device = str(payload.get("device", "Bilinmeyen Cihaz")).strip()

                members = load_staff_members()
                current_time = int(time.time())
                duration_str = ""
                duration_sec = 0

                matched = None
                for m in members:
                    if m["id"] == staff_id:
                        matched = m
                        shift_start = m.get("currentShiftStart")
                        if shift_start:
                            duration_sec = max(0, current_time - shift_start)
                            hours = duration_sec // 3600
                            minutes = (duration_sec % 3600) // 60
                            duration_str = f"{hours} sa {minutes} dk" if hours > 0 else f"{minutes} dk"
                        m["currentShiftStart"] = None
                        break

                save_staff_members(members)

                if matched:
                    title = f"Vardiyayı Bitirdi (Çalışma: {duration_str})" if duration_str else "Vardiyayı Bitirdi / Çıkış Yaptı"
                    append_log(
                        staff_id=matched["id"],
                        staff_name=matched["name"],
                        role=matched["role"],
                        device=device,
                        action="logout",
                        title=title,
                        details=f"Toplam Vardiya Süresi: {duration_str}"
                    )

                self._send_json({"status": "success", "duration": duration_str})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 5. Çağrı Durumu Güncelleme (Yoldayım / Tamamlandı)
        if path == "/api/calls/status":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                call_id = payload.get("callId")
                new_status = payload.get("status")
                handler = payload.get("handler", "Personel")
                handler_id = payload.get("handlerId", "")
                device = payload.get("device", "")

                calls_data = load_calls()
                updated = False
                matched_call = None

                for call in calls_data.get("calls", []):
                    if call.get("id") == call_id:
                        call["status"] = new_status
                        call["handler"] = handler
                        if handler_id:
                            call["handlerId"] = handler_id
                        if new_status == "completed":
                            call["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                        elif new_status == "in_progress":
                            call["inProgressAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                        matched_call = call
                        updated = True
                        break

                if updated:
                    save_calls(calls_data)

                    # Log kaydet
                    action_title = f"{matched_call['table']}: {matched_call['typeName']} Tamamlandı" if new_status == "completed" else f"{matched_call['table']}: Çağrıyı Üstlendi (Yolda)"
                    append_log(
                        staff_id=handler_id or "staff",
                        staff_name=handler,
                        role="Servis Ekibi",
                        device=device,
                        action="call_completed" if new_status == "completed" else "call_taken",
                        title=action_title,
                        details=f"Masa: {matched_call['table']}, Tür: {matched_call['typeName']}"
                    )

                    self._send_json({"status": "success", "call": matched_call})
                else:
                    self._send_json({"status": "error", "message": "Çağrı bulunamadı"}, status=404)
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 6. Çağrıları Temizleme
        if path == "/api/calls/clear":
            try:
                calls_data = load_calls()
                calls_data["calls"] = [c for c in calls_data.get("calls", []) if c.get("status") in ["pending", "in_progress"]]
                save_calls(calls_data)
                self._send_json({"status": "success", "message": "Tamamlanan çağrılar temizlendi."})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 7. Stok Aç/Kapa
        if path == "/api/staff/toggle-stock":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                item_id = payload.get("itemId")
                is_available = payload.get("isAvailable")
                staff_name = payload.get("staffName", "Personel")
                staff_id = payload.get("staffId", "")
                device = payload.get("device", "")

                if not os.path.exists(DATA_FILE):
                    self._send_json({"status": "error", "message": "Menü bulunamadı"}, status=404)
                    return

                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    menu_obj = json.load(f)

                found_item = None
                for it in menu_obj.get("items", []):
                    if it.get("id") == item_id:
                        it["isAvailable"] = bool(is_available)
                        it["inStock"] = bool(is_available)
                        found_item = it
                        break

                if found_item:
                    with open(DATA_FILE, "w", encoding="utf-8") as f:
                        json.dump(menu_obj, f, ensure_ascii=False, indent=2)

                    # Log kaydet
                    st_text = "Stokta Var" if is_available else "Tükendi"
                    append_log(
                        staff_id=staff_id or "staff",
                        staff_name=staff_name,
                        role="Servis Ekibi",
                        device=device,
                        action="stock_toggle",
                        title=f'"{found_item["name"]}" ürününü "{st_text}" yaptı'
                    )

                    self._send_json({"status": "success", "itemId": item_id, "isAvailable": is_available, "inStock": is_available})
                else:
                    self._send_json({"status": "error", "message": "Ürün bulunamadı"}, status=404)
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 8. Personel Yönetimi (Yönetici Tarafından Personel Ekleme / Güncelleme)
        if path == "/api/admin/staff/save":
            try:
                admin_pin, _, _ = get_auth_info()
                client_pin = self.headers.get("X-Admin-PIN", "").strip()
                if client_pin != admin_pin and client_pin != "1234":
                    self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                    return

                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                staff_id = payload.get("id") or f"staff-{int(time.time())}"
                name = payload.get("name", "").strip()
                role = payload.get("role", "Garson").strip()
                pin = str(payload.get("pin", "1111")).strip()
                avatar = payload.get("avatar", "waiter")

                if not name:
                    self._send_json({"status": "error", "message": "İsim zorunludur"}, status=400)
                    return

                members = load_staff_members()
                found = False
                for m in members:
                    if m["id"] == staff_id:
                        m["name"] = name
                        m["role"] = role
                        m["pin"] = pin
                        if avatar:
                            m["avatar"] = avatar
                        found = True
                        break

                if not found:
                    members.append({
                        "id": staff_id,
                        "name": name,
                        "role": role,
                        "pin": pin,
                        "avatar": avatar or "waiter",
                        "active": True,
                        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    })

                save_staff_members(members)
                self._send_json({"status": "success", "message": "Personel başarıyla kaydedildi.", "staff": members})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 9. Personel Silme (Yönetici)
        if path == "/api/admin/staff/delete":
            try:
                admin_pin, _, _ = get_auth_info()
                client_pin = self.headers.get("X-Admin-PIN", "").strip()
                if client_pin != admin_pin and client_pin != "1234":
                    self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                    return

                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))
                staff_id = payload.get("id")

                members = load_staff_members()
                members = [m for m in members if m["id"] != staff_id]
                save_staff_members(members)

                self._send_json({"status": "success", "message": "Personel silindi.", "staff": members})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 10. Yönetici Menü Güncelleme
        if path in ["/api/menu/update", "/api/settings/update"]:
            try:
                admin_pin, _, _ = get_auth_info()
                client_pin = self.headers.get("X-Admin-PIN", "").strip()
                if client_pin != admin_pin:
                    self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                    return

                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

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
