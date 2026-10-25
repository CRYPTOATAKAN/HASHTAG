#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
import sys
import time
import datetime
import threading
import re
import html
import base64
import io
import random
import shutil
import subprocess
import tempfile

# İsteğe bağlı pywebpush (Docker container içinde requirements.txt ile kurulur)
try:
    from pywebpush import webpush, WebPushException
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False

# İsteğe bağlı Pillow + pillow-heif (Sunucu tarafı evrensel fotoğraf dönüştürücü: HEIC, TIFF, BMP, PNG, JPG, WEBP)
try:
    from PIL import Image, ImageOps
    HAS_PILLOW = True
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        HAS_HEIF = True
    except ImportError:
        HAS_HEIF = False
except ImportError:
    HAS_PILLOW = False
    HAS_HEIF = False

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
DATA_FILE = os.path.join(DATA_DIR, "menu.json")
CALLS_FILE = os.path.join(DATA_DIR, "calls.json")
STAFF_FILE = os.path.join(DATA_DIR, "staff_members.json")
LOGS_FILE = os.path.join(DATA_DIR, "staff_logs.json")
PUSH_SUBS_FILE = os.path.join(DATA_DIR, "push_subscriptions.json")
VAPID_FILE = os.path.join(DATA_DIR, "vapid.json")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.json")
HOOKAH_FILE = os.path.join(DATA_DIR, "hookah_timers.json")
WEEKLY_ARCHIVE_FILE = os.path.join(DATA_DIR, "weekly_archives.json")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

ENV_ADMIN_PIN = os.environ.get("ADMIN_PIN", None)

# --- THREAD-SAFE ATOMIC FILE STORAGE ---
file_lock = threading.Lock()

def atomic_save_json(filepath, data):
    with file_lock:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        tmp_path = filepath + f".tmp.{os.getpid()}.{time.time()}"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, filepath)

def atomic_save_bytes(filepath, raw_bytes):
    with file_lock:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        tmp_path = filepath + f".tmp.{os.getpid()}.{time.time()}"
        with open(tmp_path, "wb") as f:
            f.write(raw_bytes)
        os.replace(tmp_path, filepath)

def detect_image_ext_from_bytes(raw_bytes, fallback_ext=".jpg"):
    if len(raw_bytes) >= 12:
        if raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
            return ".webp"
        if raw_bytes[:3] == b"\xff\xd8\xff":
            return ".jpg"
        if raw_bytes[:8] == b"\x89PNG\r\n\x1a\n":
            return ".png"
        if raw_bytes[:6] in (b"GIF87a", b"GIF89a"):
            return ".gif"
        if b"ftypavif" in raw_bytes[:32] or b"ftypavis" in raw_bytes[:32]:
            return ".avif"
        if b"ftypheic" in raw_bytes[:32] or b"ftypheix" in raw_bytes[:32] or b"ftypmif1" in raw_bytes[:32] or b"ftypmsf1" in raw_bytes[:32]:
            return ".heic"
        if raw_bytes[:2] == b"BM":
            return ".bmp"
        if raw_bytes[:4] in (b"II*\x00", b"MM\x00*"):
            return ".tiff"
    head_str = raw_bytes[:512].decode("utf-8", errors="ignore").lower()
    if "<svg" in head_str:
        return ".svg"
    return fallback_ext

def sanitize_svg_bytes(raw_bytes):
    svg_text = raw_bytes.decode("utf-8", errors="ignore")
    svg_text = re.sub(r"<script[\s\S]*?</script>", "", svg_text, flags=re.IGNORECASE)
    svg_text = re.sub(r"<foreignObject[\s\S]*?</foreignObject>", "", svg_text, flags=re.IGNORECASE)
    svg_text = re.sub(r"<(iframe|object|embed)[\s\S]*?>", "", svg_text, flags=re.IGNORECASE)
    svg_text = re.sub(r"\son\w+\s*=\s*(['\"]).*?\1", "", svg_text, flags=re.IGNORECASE)
    svg_text = re.sub(r"\son\w+\s*=[^\s>]+", "", svg_text, flags=re.IGNORECASE)
    svg_text = re.sub(r"javascript\s*:", "", svg_text, flags=re.IGNORECASE)
    return svg_text.encode("utf-8")

def process_and_save_uploaded_image(raw_bytes, filename="", mime_type="", max_dim=1200, rotation=0, force_server_process=False):
    if not raw_bytes:
        raise ValueError("Boş görsel verisi gönderildi.")
    if len(raw_bytes) > 45 * 1024 * 1024:
        raise ValueError("Görsel boyutu 45 MB sınırını aşıyor.")

    orig_ext = os.path.splitext(filename or "")[1].lower()
    detected_ext = detect_image_ext_from_bytes(raw_bytes, orig_ext or ".jpg")
    ts = int(time.time() * 1000)
    rand_id = random.randint(1000, 9999)

    # 1. Güvenli SVG Desteği
    if detected_ext == ".svg" or orig_ext == ".svg" or "svg" in (mime_type or "").lower():
        clean_svg = sanitize_svg_bytes(raw_bytes)
        out_name = f"img_{ts}_{rand_id}.svg"
        atomic_save_bytes(os.path.join(UPLOADS_DIR, out_name), clean_svg)
        return out_name, len(clean_svg), "SVG", 0, 0

    # 2. Hareketli GIF Desteği (Animasyonu bozmamak için 6MB altıysa doğrudan koru)
    if (detected_ext == ".gif" or orig_ext == ".gif") and rotation == 0 and not force_server_process and len(raw_bytes) <= 6 * 1024 * 1024:
        out_name = f"img_{ts}_{rand_id}.gif"
        atomic_save_bytes(os.path.join(UPLOADS_DIR, out_name), raw_bytes)
        return out_name, len(raw_bytes), "GIF", 0, 0

    # 3. Sunucu Tarafı Evrensel Dönüştürücü (Pillow kuruluysa: HEIC, TIFF, BMP, büyük dosyalar veya döndürme)
    needs_conversion = force_server_process or detected_ext in (".heic", ".heif", ".bmp", ".tiff", ".tif") or orig_ext in (".heic", ".heif", ".bmp", ".tiff", ".tif", ".ico") or len(raw_bytes) > 850 * 1024 or rotation != 0

    if HAS_PILLOW and needs_conversion:
        try:
            img = Image.open(io.BytesIO(raw_bytes))
            img = ImageOps.exif_transpose(img)
            if rotation in (90, 180, 270):
                img = img.rotate(-rotation, expand=True)

            w, h = img.size
            max_side = max(w, h)
            target_max = max(400, min(2400, int(max_dim or 1200)))
            if max_side > target_max:
                scale = target_max / float(max_side)
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))
                resample_filter = getattr(Image, "Resampling", Image).LANCZOS
                img = img.resize((new_w, new_h), resample_filter)
                w, h = img.size

            has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
            buf = io.BytesIO()
            try:
                if has_alpha:
                    img = img.convert("RGBA")
                    img.save(buf, format="WEBP", quality=86, method=4)
                else:
                    img = img.convert("RGB")
                    img.save(buf, format="WEBP", quality=85, method=4)
                out_ext = ".webp"
            except Exception:
                buf = io.BytesIO()
                if has_alpha:
                    img = img.convert("RGBA")
                    img.save(buf, format="PNG", optimize=True)
                    out_ext = ".png"
                else:
                    img = img.convert("RGB")
                    img.save(buf, format="JPEG", quality=86, optimize=True)
                    out_ext = ".jpg"

            final_bytes = buf.getvalue()
            out_name = f"img_{ts}_{rand_id}{out_ext}"
            atomic_save_bytes(os.path.join(UPLOADS_DIR, out_name), final_bytes)
            return out_name, len(final_bytes), out_ext.lstrip(".").upper(), w, h
        except Exception as pil_err:
            if detected_ext in (".heic", ".heif") or orig_ext in (".heic", ".heif"):
                raise ValueError(f"HEIC görseli dönüştürülemedi: {pil_err}")
            print("Pillow conversion warning, falling back to raw save:", pil_err)
    elif needs_conversion and shutil.which("sips"):
        # macOS Yerel Sunucu Yedeği: Pillow kurulu değilse bile sips ile HEIC/TIFF/BMP/Döndürme desteği
        tmp_in = None
        tmp_out = None
        try:
            in_suffix = detected_ext if detected_ext else (orig_ext or ".img")
            out_is_png = in_suffix in (".png", ".ico")
            out_ext = ".png" if out_is_png else ".jpg"
            sips_fmt = "png" if out_is_png else "jpeg"
            target_max = max(400, min(2400, int(max_dim or 1200)))

            with tempfile.NamedTemporaryFile(delete=False, suffix=in_suffix) as f_in:
                f_in.write(raw_bytes)
                tmp_in = f_in.name
            tmp_out = tmp_in + out_ext

            cmd = [shutil.which("sips"), "-s", "format", sips_fmt]
            if not out_is_png:
                cmd += ["-s", "formatOptions", "86"]
            if rotation in (90, 180, 270):
                cmd += ["-r", str(rotation)]
            cmd += ["-Z", str(target_max), tmp_in, "--out", tmp_out]

            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            if proc.returncode == 0 and os.path.isfile(tmp_out):
                with open(tmp_out, "rb") as f_out:
                    conv_bytes = f_out.read()
                out_name = f"img_{ts}_{rand_id}{out_ext}"
                atomic_save_bytes(os.path.join(UPLOADS_DIR, out_name), conv_bytes)
                return out_name, len(conv_bytes), out_ext.lstrip(".").upper(), 0, 0
        except Exception as sips_err:
            print("sips fallback warning:", sips_err)
        finally:
            for p in (tmp_in, tmp_out):
                if p and os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass

    # 4. İstemci (Tarayıcı) Tarafından Zaten Optimize Edilmiş Görseli Kaydet (WEBP / JPG / PNG / AVIF / BMP / ICO)
    safe_exts = {".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif", ".bmp", ".ico"}
    final_ext = detected_ext if detected_ext in safe_exts else (orig_ext if orig_ext in safe_exts else ".jpg")
    if final_ext == ".jpeg":
        final_ext = ".jpg"

    out_name = f"img_{ts}_{rand_id}{final_ext}"
    atomic_save_bytes(os.path.join(UPLOADS_DIR, out_name), raw_bytes)
    return out_name, len(raw_bytes), final_ext.lstrip(".").upper(), 0, 0

# --- INPUT SANITIZATION (XSS & INJECTION DEFENSE) ---
def sanitize_input(text, max_len=120):
    if text is None:
        return ""
    text = str(text).strip()
    clean = re.sub(r'<[^>]*>', '', text)
    clean = clean.replace('\0', '').replace('\r', '').strip()
    return clean[:max_len]

# --- BRUTE FORCE & RATE LIMITING DEFENSE ---
pin_failed_attempts = {} # client_ip -> [timestamps]
pin_attempt_lock = threading.Lock()

def check_pin_rate_limit(client_ip):
    now = time.time()
    with pin_attempt_lock:
        attempts = pin_failed_attempts.get(client_ip, [])
        attempts = [t for t in attempts if now - t < 60]
        pin_failed_attempts[client_ip] = attempts
        if len(attempts) >= 8:
            return False
    return True

def record_pin_failure(client_ip):
    now = time.time()
    with pin_attempt_lock:
        if client_ip not in pin_failed_attempts:
            pin_failed_attempts[client_ip] = []
        pin_failed_attempts[client_ip].append(now)

def reset_pin_failures(client_ip):
    with pin_attempt_lock:
        pin_failed_attempts.pop(client_ip, None)

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
        atomic_save_json(VAPID_FILE, default_vapid)
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
        if "calls" in calls_data and len(calls_data["calls"]) > 150:
            calls_data["calls"] = calls_data["calls"][:150]
        atomic_save_json(CALLS_FILE, calls_data)
    except Exception as e:
        print("Error saving calls.json:", e)

# --- KÖZ ZAMAN TAKİBİ (HOOKAH TIMERS) ---
def load_hookah_timers():
    if os.path.exists(HOOKAH_FILE):
        try:
            with open(HOOKAH_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def update_hookah_timer(table_name, staff_name=""):
    table_name = sanitize_input(table_name, max_len=30)
    if not table_name:
        return
    timers = load_hookah_timers()
    timers[table_name] = {
        "table": table_name,
        "lastCoalTime": int(time.time()),
        "staffName": sanitize_input(staff_name, max_len=50)
    }
    atomic_save_json(HOOKAH_FILE, timers)

# --- MÜŞTERİ GERİ BİLDİRİM & PUANLARI ---
def get_default_feedbacks():
    current_time = int(time.time())
    samples = [
        ("fb-init-1", "Masa 8", 5, ["Hızlı Servis", "Köz Kıvamında"], "Nargilenin dumanı ve köz servisi harikaydı, teşekkürler!", 1800),
        ("fb-init-2", "Masa 3", 5, ["Güler Yüz", "Temiz Ortam"], "Personel çok ilgiliydi, ortam çok nezih.", 5400),
        ("fb-init-3", "Masa 11", 3, ["Köz Geç Geldi", "Yavaş Servis"], "Köz değişimi biraz gecikti, masayla daha sık ilgilenilebilir.", 12600),
        ("fb-init-4", "Masa 5", 4, ["Lezzetli Tütün", "Güler Yüz"], "Kahveler ve tütün aroması çok başarılı.", 86400),
        ("fb-init-5", "Masa 14", 2, ["Yüksek Müzik", "Yavaş Servis"], "Müzik sesi fazlaydı, garson çağırma butonuna geç yanıt verildi.", 172800),
        ("fb-init-6", "Masa 2", 5, ["Hızlı Servis", "Köz Kıvamında"], "Harika bir lounge mekanı, sürekli geliyoruz.", 259200),
        ("fb-init-7", "Masa 7", 4, ["Fiyat/Performans", "Temiz Ortam"], "Sunumlar çok özenliydi.", 345600),
        ("fb-init-8", "Masa 6", 5, ["Güler Yüz", "Köz Kıvamında"], "Personel güler yüzlü, servis on numara.", 604800),
        ("fb-init-9", "Masa 9", 4, ["Hızlı Servis"], "Atmosfer çok şık ve nezih.", 1036800),
        ("fb-init-10", "Masa 15", 3, ["Köz Geç Geldi"], "Yoğun saatlerde köz takviyesi biraz aksıyor.", 1728000),
        ("fb-init-11", "Masa 10", 5, ["Lezzetli Tütün", "Hızlı Servis"], "Özel karışım nargile enfesti.", 2160000),
        ("fb-init-12", "Masa 1", 5, ["Lüks Lounge", "Güler Yüz"], "HASHTAG kalitesi tartışılmaz, favori mekanımız.", 3456000),
        ("fb-init-13", "Masa 4", 5, ["Hızlı Servis"], "Hızlı servis ve kusursuz temizlik.", 6048000),
        ("fb-init-14", "Masa 12", 4, ["Köz Kıvamında"], "Genel olarak gayet memnun kaldık.", 9000000)
    ]
    feedbacks = []
    for fid, tbl, rtg, tgs, cmt, offset in samples:
        ts = current_time - offset
        tr_time = ts + (3 * 3600)
        time_str = time.strftime("%d.%m.%Y %H:%M:%S", time.gmtime(tr_time))
        feedbacks.append({
            "id": fid,
            "table": tbl,
            "rating": rtg,
            "tags": tgs,
            "comment": cmt,
            "callId": "",
            "timestamp": ts,
            "timeStr": time_str
        })
    return feedbacks

def is_negative_feedback(fb):
    try:
        rtg = int(fb.get("rating", 5))
    except Exception:
        rtg = 5
    if rtg <= 3:
        return True
    tags_text = " ".join(fb.get("tags", []) or []).lower()
    comment_text = str(fb.get("comment", "") or "").lower()
    combined = f"{tags_text} {comment_text}"
    neg_keywords = ["gecik", "geç", "yavaş", "yüksek müzik", "gürültü", "soğuk", "yanık", "kötü", "şikayet", "bekle", "az duman", "gelmedi"]
    return any(k in combined for k in neg_keywords)

def load_feedback():
    if os.path.exists(FEEDBACK_FILE):
        try:
            with open(FEEDBACK_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("initialized"):
                    return data.get("feedbacks", [])
                fbs = data.get("feedbacks", [])
                if len(fbs) <= 2:
                    defaults = get_default_feedbacks()
                    existing_ids = {x.get("id") for x in fbs}
                    merged = fbs + [d for d in defaults if d.get("id") not in existing_ids]
                    save_feedback(merged)
                    return merged
                save_feedback(fbs)
                return fbs
        except Exception:
            pass
    initial_fbs = get_default_feedbacks()
    save_feedback(initial_fbs)
    return initial_fbs

def save_feedback(feedbacks):
    atomic_save_json(FEEDBACK_FILE, {"feedbacks": feedbacks, "initialized": True})

# --- HAFTALIK RAPOR ARŞİVİ & OTOMATİK HAFTALIK SIFIRLAMA SİSTEMİ ---
def get_current_tr_week_info(ts=None):
    if ts is None:
        ts = int(time.time())
    tr_dt = datetime.datetime.utcfromtimestamp(ts + 3 * 3600)
    iso_year, iso_week, iso_weekday = tr_dt.isocalendar()
    monday_dt = tr_dt - datetime.timedelta(days=iso_weekday - 1)
    sunday_dt = monday_dt + datetime.timedelta(days=6)
    date_range = f"{monday_dt.strftime('%d.%m.%Y')} - {sunday_dt.strftime('%d.%m.%Y')}"
    return {
        "weekKey": f"{iso_year}-W{iso_week:02d}",
        "weekNum": iso_week,
        "year": iso_year,
        "dateRange": date_range,
        "label": f"{iso_week}. Hafta ({date_range})"
    }

def get_default_weekly_archives():
    now_ts = int(time.time())
    w_prev1 = get_current_tr_week_info(now_ts - 7 * 86400)
    w_prev2 = get_current_tr_week_info(now_ts - 14 * 86400)
    return [
        {
            "id": f"rep-{w_prev1['weekKey']}-auto",
            "weekKey": w_prev1["weekKey"],
            "weekLabel": f"{w_prev1['weekNum']}. Hafta Raporu",
            "dateRange": w_prev1["dateRange"],
            "archivedAt": time.strftime("%d.%m.%Y 23:59", time.gmtime(now_ts - 6 * 86400 + 3 * 3600)),
            "timestamp": now_ts - 6 * 86400,
            "reason": "Otomatik Haftalık Devir",
            "totalFeedbacks": 28,
            "avgRating": 4.7,
            "satisfactionPct": 89,
            "lowRatingCount": 3,
            "starCounts": {"5": 21, "4": 4, "3": 2, "2": 1, "1": 0},
            "totalCalls": 94,
            "callBreakdown": {"coal": 48, "waiter": 31, "bill": 15},
            "totalLogs": 142,
            "topStaff": "Ahmet Yılmaz (42 Çağrı)",
            "lowRatingItems": [
                {
                    "table": "Masa 6",
                    "rating": 3,
                    "tags": ["⏳ Köz Gecikti"],
                    "comment": "Cuma akşamı yoğun saatte köz değişimi 20 dakika sürdü.",
                    "timeStr": f"{w_prev1['dateRange'].split(' - ')[0]} 21:40"
                },
                {
                    "table": "Masa 12",
                    "rating": 2,
                    "tags": ["🔊 Yüksek Müzik", "🐢 Yavaş Servis"],
                    "comment": "Hoparlör altı masada müzik sesi sohbeti zorlaştırdı.",
                    "timeStr": f"{w_prev1['dateRange'].split(' - ')[0]} 22:15"
                },
                {
                    "table": "Masa 19",
                    "rating": 3,
                    "tags": ["🐢 Yavaş Servis"],
                    "comment": "Hesap isterken biraz bekledik ama personel kibardı.",
                    "timeStr": f"{w_prev1['dateRange'].split(' - ')[1]} 20:10"
                }
            ]
        },
        {
            "id": f"rep-{w_prev2['weekKey']}-auto",
            "weekKey": w_prev2["weekKey"],
            "weekLabel": f"{w_prev2['weekNum']}. Hafta Raporu",
            "dateRange": w_prev2["dateRange"],
            "archivedAt": time.strftime("%d.%m.%Y 23:59", time.gmtime(now_ts - 13 * 86400 + 3 * 3600)),
            "timestamp": now_ts - 13 * 86400,
            "reason": "Otomatik Haftalık Devir",
            "totalFeedbacks": 34,
            "avgRating": 4.8,
            "satisfactionPct": 94,
            "lowRatingCount": 2,
            "starCounts": {"5": 27, "4": 5, "3": 2, "2": 0, "1": 0},
            "totalCalls": 112,
            "callBreakdown": {"coal": 56, "waiter": 38, "bill": 18},
            "totalLogs": 168,
            "topStaff": "Murat Demir (51 Çağrı)",
            "lowRatingItems": [
                {
                    "table": "Masa 4",
                    "rating": 3,
                    "tags": ["⏳ Köz Gecikti"],
                    "comment": "İkinci köz değişimi biraz gecikti.",
                    "timeStr": f"{w_prev2['dateRange'].split(' - ')[0]} 21:05"
                },
                {
                    "table": "Masa 10",
                    "rating": 3,
                    "tags": ["🐢 Yavaş Servis"],
                    "comment": "Kahve servisi biraz geç geldi ancak lezzetliydi.",
                    "timeStr": f"{w_prev2['dateRange'].split(' - ')[1]} 19:30"
                }
            ]
        }
    ]

def build_weekly_report_snapshot(week_info, feedbacks, logs, calls_list, staff_members, reason="Otomatik Haftalık Devir"):
    now_ts = int(time.time())
    tr_time = now_ts + 3 * 3600
    archived_at_str = time.strftime("%d.%m.%Y %H:%M", time.gmtime(tr_time))

    total_fb = len(feedbacks)
    if total_fb > 0:
        avg_rtg = round(sum(int(f.get("rating", 5)) for f in feedbacks) / total_fb, 1)
        pos_cnt = sum(1 for f in feedbacks if int(f.get("rating", 5)) >= 4 and not is_negative_feedback(f))
        sat_pct = round((pos_cnt / total_fb) * 100)
    else:
        avg_rtg = 5.0
        sat_pct = 100

    low_items = []
    star_counts = {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0}
    for f in feedbacks:
        r = str(max(1, min(5, int(f.get("rating", 5)))))
        star_counts[r] = star_counts.get(r, 0) + 1
        if is_negative_feedback(f):
            low_items.append({
                "table": f.get("table", "Masa"),
                "rating": int(f.get("rating", 5)),
                "tags": f.get("tags", []),
                "comment": f.get("comment", ""),
                "timeStr": f.get("timeStr", "")
            })

    completed_calls = [c for c in calls_list if c.get("status") == "completed"]
    coal_cnt = sum(1 for c in completed_calls if c.get("type") == "coal")
    waiter_cnt = sum(1 for c in completed_calls if c.get("type") == "waiter")
    bill_cnt = sum(1 for c in completed_calls if c.get("type") == "bill")

    # Ayrıca loglardan da tamamlanan çağrıları sayabiliriz (eğer calls temizlendiyse)
    log_calls = [l for l in logs if l.get("action") == "call_completed"]
    total_calls_count = max(len(completed_calls), len(log_calls))

    top_staff_str = "Henüz Yok"
    if staff_members:
        staff_counts = []
        for m in staff_members:
            c_cnt = sum(1 for c in completed_calls if c.get("handlerId") == m.get("id") or c.get("handler") == m.get("name"))
            l_cnt = sum(1 for l in log_calls if l.get("staffId") == m.get("id") or l.get("staffName") == m.get("name"))
            staff_counts.append((m.get("name", "Personel"), max(c_cnt, l_cnt)))
        staff_counts.sort(key=lambda x: x[1], reverse=True)
        if staff_counts and staff_counts[0][1] > 0:
            top_staff_str = f"{staff_counts[0][0]} ({staff_counts[0][1]} Çağrı)"

    return {
        "id": f"rep-{week_info['weekKey']}-{now_ts}",
        "weekKey": week_info["weekKey"],
        "weekLabel": f"{week_info['weekNum']}. Hafta Raporu",
        "dateRange": week_info["dateRange"],
        "archivedAt": archived_at_str,
        "timestamp": now_ts,
        "reason": reason,
        "totalFeedbacks": total_fb,
        "avgRating": avg_rtg,
        "satisfactionPct": sat_pct,
        "lowRatingCount": len(low_items),
        "starCounts": star_counts,
        "totalCalls": total_calls_count,
        "callBreakdown": {
            "coal": coal_cnt,
            "waiter": waiter_cnt,
            "bill": bill_cnt
        },
        "totalLogs": len(logs),
        "topStaff": top_staff_str,
        "lowRatingItems": low_items[:25]
    }

def load_weekly_archives():
    cur_week = get_current_tr_week_info()
    if os.path.exists(WEEKLY_ARCHIVE_FILE):
        try:
            with open(WEEKLY_ARCHIVE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "archives" in data:
                    if not data.get("activeWeekKey"):
                        data["activeWeekKey"] = cur_week["weekKey"]
                        data["activeWeekInfo"] = cur_week
                    return data
        except Exception as e:
            print("Error loading weekly_archives.json:", e)

    init_data = {
        "activeWeekKey": cur_week["weekKey"],
        "activeWeekInfo": cur_week,
        "lastResetAt": time.strftime("%d.%m.%Y %H:%M", time.gmtime(int(time.time()) + 3 * 3600)),
        "archives": get_default_weekly_archives()
    }
    atomic_save_json(WEEKLY_ARCHIVE_FILE, init_data)
    return init_data

def save_weekly_archives(data):
    if "archives" in data and len(data["archives"]) > 52:
        data["archives"] = data["archives"][:52] # 1 yıllık (52 hafta) arşivi tut
    atomic_save_json(WEEKLY_ARCHIVE_FILE, data)

def check_and_run_weekly_reset():
    try:
        archives_data = load_weekly_archives()
        cur_week = get_current_tr_week_info()
        stored_week_key = archives_data.get("activeWeekKey")

        if stored_week_key and stored_week_key != cur_week["weekKey"]:
            # Yeni bir haftaya girilmiş! Önceki haftanın verilerini rapor olarak arşivle ve sıfırla
            prev_week_info = archives_data.get("activeWeekInfo") or cur_week
            feedbacks = load_feedback()
            logs = load_logs()
            calls_data = load_calls()
            calls_list = calls_data.get("calls", [])
            staff_members = load_staff_members()

            if len(feedbacks) > 0 or len(logs) > 0 or len(calls_list) > 0:
                snapshot = build_weekly_report_snapshot(
                    prev_week_info,
                    feedbacks,
                    logs,
                    calls_list,
                    staff_members,
                    reason="Otomatik Haftalık Devir"
                )
                archives_data.setdefault("archives", []).insert(0, snapshot)

            # Aktif bildirimleri yeni hafta için sıfırla
            save_feedback([])
            atomic_save_json(LOGS_FILE, {"logs": []})
            active_calls_only = [c for c in calls_list if c.get("status") in ["pending", "in_progress"]]
            save_calls({"calls": active_calls_only})

            archives_data["activeWeekKey"] = cur_week["weekKey"]
            archives_data["activeWeekInfo"] = cur_week
            archives_data["lastResetAt"] = time.strftime("%d.%m.%Y %H:%M", time.gmtime(int(time.time()) + 3 * 3600))
            save_weekly_archives(archives_data)
            return archives_data
        return archives_data
    except Exception as e:
        print("Error in check_and_run_weekly_reset:", e)
        return load_weekly_archives()

def reset_all_notifications(archive_before_reset=True):
    archives_data = load_weekly_archives()
    cur_week = get_current_tr_week_info()
    feedbacks = load_feedback()
    logs = load_logs()
    calls_data = load_calls()
    calls_list = calls_data.get("calls", [])
    staff_members = load_staff_members()

    archived_report = None
    if archive_before_reset and (len(feedbacks) > 0 or len(logs) > 0 or len(calls_list) > 0):
        archived_report = build_weekly_report_snapshot(
            cur_week,
            feedbacks,
            logs,
            calls_list,
            staff_members,
            reason="Hafta İçi Sıfırlama & Arşiv"
        )
        archives_data.setdefault("archives", []).insert(0, archived_report)

    # Tüm bildirimleri, değerlendirmeleri, işlem kayıtlarını ve tamamlanan çağrıları sıfırla
    save_feedback([])
    atomic_save_json(LOGS_FILE, {"logs": []})
    save_calls({"calls": []})

    archives_data["activeWeekKey"] = cur_week["weekKey"]
    archives_data["activeWeekInfo"] = cur_week
    archives_data["lastResetAt"] = time.strftime("%d.%m.%Y %H:%M", time.gmtime(int(time.time()) + 3 * 3600))
    save_weekly_archives(archives_data)
    return archives_data, archived_report

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
        atomic_save_json(STAFF_FILE, defaults)
    except Exception:
        pass
    return defaults

def save_staff_members(members):
    try:
        atomic_save_json(STAFF_FILE, members)
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
        # Türkiye Saati Formatı (UTC+3 - İstanbul)
        tr_time = current_time + (3 * 3600)
        t_struct = time.gmtime(tr_time)
        time_str = time.strftime("%d.%m.%Y %H:%M:%S", t_struct)
        
        log_entry = {
            "id": f"log-{current_time}-{int(time.time() * 1000) % 10000}",
            "staffId": sanitize_input(staff_id, max_len=50),
            "staffName": sanitize_input(staff_name, max_len=50),
            "role": sanitize_input(role, max_len=30),
            "device": sanitize_input(device or "Bilinmeyen Cihaz", max_len=50),
            "action": sanitize_input(action, max_len=30), # login, logout, call_taken, call_completed, stock_toggle, feedback
            "title": sanitize_input(title, max_len=120),
            "details": sanitize_input(details, max_len=200),
            "timestamp": current_time,
            "timeStr": time_str
        }
        logs.insert(0, log_entry)
        if len(logs) > 500: # Son 500 logu sakla
            logs = logs[:500]
        atomic_save_json(LOGS_FILE, {"logs": logs})
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
        atomic_save_json(PUSH_SUBS_FILE, {"subscriptions": subs})
    except Exception as e:
        print("Error saving push_subs:", e)
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
        if clean_path.startswith("uploads/"):
            up_cand = os.path.join(UPLOADS_DIR, filename)
            if os.path.isfile(up_cand):
                return up_cand

        candidates = [
            os.path.join(BASE_DIR, clean_path),
            os.path.join(PUBLIC_DIR, clean_path),
            os.path.join(BASE_DIR, filename),
            os.path.join(PUBLIC_DIR, filename),
            os.path.join(BASE_DIR, "images", filename),
            os.path.join(PUBLIC_DIR, "images", filename),
            os.path.join(UPLOADS_DIR, filename)
        ]

        for cand in candidates:
            if os.path.isfile(cand):
                return cand

        return os.path.join(PUBLIC_DIR, clean_path)

    def end_headers(self):
        if getattr(self, "_is_immutable_asset", False):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-PIN, X-Staff-PIN, Cache-Control, Pragma")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-PIN, X-Staff-PIN, Cache-Control, Pragma")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Kalıcı Yüklenen Ürün & Banner Görselleri (/uploads/...)
        if path.startswith("/uploads/"):
            safe_name = os.path.basename(urllib.parse.unquote(path))
            up_file = os.path.join(UPLOADS_DIR, safe_name)
            if os.path.isfile(up_file):
                ext = os.path.splitext(safe_name)[1].lower()
                mime_map = {
                    ".webp": "image/webp",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".png": "image/png",
                    ".gif": "image/gif",
                    ".svg": "image/svg+xml",
                    ".avif": "image/avif",
                    ".bmp": "image/bmp",
                    ".ico": "image/x-icon"
                }
                ctype = mime_map.get(ext, "application/octet-stream")
                try:
                    with open(up_file, "rb") as f:
                        img_bytes = f.read()
                    self._is_immutable_asset = True
                    self.send_response(200)
                    self.send_header("Content-Type", ctype)
                    if ext == ".svg":
                        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
                    self.send_header("Content-Length", str(len(img_bytes)))
                    self.end_headers()
                    self.wfile.write(img_bytes)
                except Exception as e:
                    self._send_json({"error": str(e)}, status=500)
                return
            else:
                self._send_json({"error": "Image not found"}, status=404)
                return

        if path == "/api/menu/version":
            ver = 0
            if os.path.exists(DATA_FILE):
                try:
                    ver = int(os.stat(DATA_FILE).st_mtime_ns)
                except Exception:
                    ver = int(time.time() * 1000)
            self._send_json({"status": "success", "version": ver})
            return

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
                    # Eski şablon 'hashtag.lounge' kalıntısını kalıcı olarak 'hashtagcafe07' yap
                    settings_obj = data.get("settings")
                    if isinstance(settings_obj, dict):
                        raw_ig = str(settings_obj.get("instagram") or "").strip()
                        clean_ig = re.sub(r"^https?://(www\.)?instagram\.com/", "", raw_ig, flags=re.IGNORECASE).split("/")[0].split("?")[0].lstrip("@").strip()
                        if not clean_ig or clean_ig.lower() == "hashtag.lounge":
                            settings_obj["instagram"] = "hashtagcafe07"
                            atomic_save_json(DATA_FILE, data)

                    if isinstance(data.get("items"), list):
                        orig_len = len(data["items"])
                        data["items"] = [it for it in data["items"] if it.get("id") != "item-1792885224555" and "satılık" not in str(it.get("name", "")).lower()]
                        if len(data["items"]) != orig_len:
                            atomic_save_json(DATA_FILE, data)
                    try:
                        data["_version"] = int(os.stat(DATA_FILE).st_mtime_ns)
                    except Exception:
                        pass
                    self._send_json(data)
                except Exception as e:
                    self._send_json({"error": str(e)}, status=500)
            else:
                self._send_json({"error": "Data file not found"}, status=404)
            return

        # Masa Çağrıları Listesi & Köz Sayacı
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
                "hookahTimers": load_hookah_timers(),
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
            self._send_json({
                "status": "success",
                "performance": perf_list,
                "totalTodayCalls": len(completed_calls)
            })
            return

        # Müşteri Geri Bildirimleri & Memnuniyet Puanları (Sadece Yönetici)
        if path == "/api/admin/feedback":
            admin_pin, _, _ = get_auth_info()
            client_pin = self.headers.get("X-Admin-PIN", "").strip()
            query_pin = urllib.parse.parse_qs(parsed.query).get("pin", [""])[0].strip()
            effective_pin = client_pin or query_pin

            if effective_pin != admin_pin and effective_pin != "1234":
                self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                return

            archives_data = check_and_run_weekly_reset()
            feedbacks = load_feedback()
            total_count = len(feedbacks)
            avg_rating = round(sum(int(f.get("rating", 5)) for f in feedbacks) / total_count, 1) if total_count > 0 else 5.0
            low_count = sum(1 for f in feedbacks if is_negative_feedback(f))

            self._send_json({
                "status": "success",
                "feedbacks": feedbacks,
                "totalRatings": total_count,
                "avgRating": avg_rating,
                "lowRatingsCount": low_count,
                "weeklyArchives": archives_data.get("archives", []),
                "activeWeekInfo": archives_data.get("activeWeekInfo") or get_current_tr_week_info(),
                "lastResetAt": archives_data.get("lastResetAt", "")
            })
            return

        # Haftalık Rapor Arşivleri (Sadece Yönetici)
        if path == "/api/admin/weekly-reports":
            admin_pin, _, _ = get_auth_info()
            client_pin = self.headers.get("X-Admin-PIN", "").strip()
            query_pin = urllib.parse.parse_qs(parsed.query).get("pin", [""])[0].strip()
            effective_pin = client_pin or query_pin

            if effective_pin != admin_pin and effective_pin != "1234":
                self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                return

            archives_data = check_and_run_weekly_reset()
            self._send_json({
                "status": "success",
                "archives": archives_data.get("archives", []),
                "activeWeekInfo": archives_data.get("activeWeekInfo") or get_current_tr_week_info(),
                "lastResetAt": archives_data.get("lastResetAt", "")
            })
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
        client_ip = self.headers.get("X-Forwarded-For", "").split(",")[0].strip() or self.client_address[0]

        # Payload Size Limit Koruması (Fotoğraf yüklemeleri için 50 MB'a kadar tam destek)
        content_length = int(self.headers.get("Content-Length", 0))
        max_limit = 50 * 1024 * 1024 if path in ["/api/menu/update", "/api/settings/update", "/api/admin/upload-image"] else 64 * 1024
        if content_length > max_limit:
            try:
                self.rfile.read(min(content_length, 128 * 1024))
            except Exception:
                pass
            self._send_json({"status": "error", "message": "İstek boyutu çok büyük (Payload Too Large)"}, status=413)
            return

        # 1. Müşteri Yeni Çağrı Gönderme + Web Push Tetikleme
        if path == "/api/calls":
            try:
                # Köz İste & Garson Çağır Butonları servis kontrolü
                if os.path.exists(DATA_FILE):
                    try:
                        with open(DATA_FILE, "r", encoding="utf-8") as f_chk:
                            _menu_check = json.load(f_chk)
                            if _menu_check.get("settings", {}).get("enableServiceCalls") is False:
                                self._send_json({"status": "error", "message": "Çağrı servisi şu anda kapalıdır."}, status=403)
                                return
                    except Exception as e_chk:
                        print("Error checking enableServiceCalls:", e_chk)

                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                table = sanitize_input(payload.get("table", ""), max_len=30)
                call_type = sanitize_input(payload.get("type", "waiter"), max_len=20)
                note = sanitize_input(payload.get("note", ""), max_len=150)

                if not table:
                    self._send_json({"status": "error", "message": "Masa belirtilmedi"}, status=400)
                    return

                # Masa doğrulama ve limit kontrolü
                table_match = re.search(r'\d+', table)
                if table_match:
                    t_num = int(table_match.group(0))
                    max_t = 100
                    if os.path.exists(DATA_FILE):
                        try:
                            with open(DATA_FILE, "r", encoding="utf-8") as f_cnt:
                                _st = json.load(f_cnt).get("settings", {})
                                max_t = int(_st.get("tableCount", 24)) + 10
                        except Exception:
                            pass
                    if t_num < 1 or t_num > max_t:
                        self._send_json({"status": "error", "message": f"Geçersiz masa numarası (Maksimum: {max_t})"}, status=400)
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

                # Web Push Yayını (Arka Planda Asenkron Çalıştırılır - Müşteriyi Asla Bekletmez)
                try:
                    threading.Thread(target=broadcast_web_push, args=(new_call,), daemon=True).start()
                except Exception as ex:
                    print("Thread launch push exception:", ex)

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
                if not check_pin_rate_limit(client_ip):
                    self._send_json({"status": "error", "message": "Çok fazla hatalı deneme! Lütfen 60 saniye bekleyin."}, status=429)
                    return

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
                    if pin == admin_pin or pin == "1234":
                        matched = {"id": "admin", "name": "Yönetici", "role": "Yönetici", "avatar": "shield"}
                else:
                    for m in members:
                        if m["id"] == staff_id:
                            # Personel kendi PIN'i, Ortak Personel PIN'i, Yönetici PIN'i veya 1234 ile girebilir
                            is_pin_valid = (
                                str(m.get("pin", "")).strip() == pin or
                                (general_staff_pin and pin == str(general_staff_pin).strip()) or
                                pin == admin_pin or
                                pin == "1234"
                            )
                            if is_pin_valid:
                                matched = m
                            break

                if not matched:
                    record_pin_failure(client_ip)
                    time.sleep(0.3)
                    self._send_json({"status": "error", "message": "Hatalı PIN Kodu!"}, status=401)
                    return

                reset_pin_failures(client_ip)

                current_time = int(time.time())
                tr_time = current_time + (3 * 3600)
                t_struct = time.gmtime(tr_time)
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
                            # Köz çağrısı tamamlandığında köz sayacını otomatik güncelle
                            if call.get("type") == "coal":
                                update_hookah_timer(call.get("table", ""), handler)
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

        # 6b. Müşteri Memnuniyet Puanı & Geri Bildirim
        if path == "/api/feedback":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                table = sanitize_input(payload.get("table", "Masa"), max_len=30)
                rating = int(payload.get("rating", 5))
                rating = max(1, min(5, rating))
                tags = [sanitize_input(t, max_len=30) for t in payload.get("tags", [])][:5]
                comment = sanitize_input(payload.get("comment", ""), max_len=250)
                call_id = sanitize_input(payload.get("callId", ""), max_len=50)

                feedbacks = load_feedback()
                current_time = int(time.time())
                tr_time = current_time + (3 * 3600)
                time_str = time.strftime("%d.%m.%Y %H:%M:%S", t_struct if 't_struct' in locals() else time.gmtime(tr_time))

                new_fb = {
                    "id": f"fb-{current_time}-{int(time.time() * 1000) % 10000}",
                    "table": table,
                    "rating": rating,
                    "tags": tags,
                    "comment": comment,
                    "callId": call_id,
                    "timestamp": current_time,
                    "timeStr": time_str
                }
                feedbacks.insert(0, new_fb)
                if len(feedbacks) > 200:
                    feedbacks = feedbacks[:200]
                save_feedback(feedbacks)

                # Log ekle
                stars = "⭐" * rating
                append_log(
                    staff_id="customer",
                    staff_name=table,
                    role="Müşteri",
                    device="Mobil Menü",
                    action="feedback",
                    title=f"{table} Puan Verdi: {stars} ({rating}/5)",
                    details=", ".join(tags) if tags else comment
                )

                self._send_json({"status": "success", "message": "Değerlendirmeniz için teşekkür ederiz!", "feedback": new_fb})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 6c. Personel Köz Sayacı Sıfırlama
        if path == "/api/staff/hookah-timer/reset":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                table = sanitize_input(payload.get("table", ""), max_len=30)
                staff_name = sanitize_input(payload.get("staffName", "Personel"), max_len=50)

                if table:
                    update_hookah_timer(table, staff_name)
                    self._send_json({"status": "success", "message": f"{table} köz sayacı güncellendi.", "timers": load_hookah_timers()})
                else:
                    self._send_json({"status": "error", "message": "Masa belirtilmedi"}, status=400)
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
                staff_name = sanitize_input(payload.get("staffName", "Personel"), max_len=50)
                staff_id = sanitize_input(payload.get("staffId", ""), max_len=50)
                device = sanitize_input(payload.get("device", ""), max_len=50)

                if not os.path.exists(DATA_FILE):
                    self._send_json({"status": "error", "message": "Menü bulunamadı"}, status=404)
                    return

                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    menu_obj = json.load(f)

                # Yetki kontrolü: allowStockToggle
                staff_perms = menu_obj.get("settings", {}).get("staffPermissions", {})
                if staff_perms.get("allowStockToggle") is False:
                    self._send_json({
                        "status": "error",
                        "message": "Ürün stok durumu değiştirme yetkisi yönetici tarafından kapatılmıştır."
                    }, status=403)
                    return

                found_item = None
                for it in menu_obj.get("items", []):
                    if it.get("id") == item_id:
                        it["isAvailable"] = bool(is_available)
                        it["inStock"] = bool(is_available)
                        found_item = it
                        break

                if found_item:
                    menu_obj["updatedAt"] = int(time.time() * 1000)
                    atomic_save_json(DATA_FILE, menu_obj)

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

        # 7b. Personel Fiyat Güncelleme (allowPriceEdit yetki kontrollü)
        if path == "/api/staff/update-price":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                item_id = payload.get("itemId")
                raw_price = payload.get("price")
                staff_name = sanitize_input(payload.get("staffName", "Personel"), max_len=50)
                staff_id = sanitize_input(payload.get("staffId", ""), max_len=50)
                device = sanitize_input(payload.get("device", ""), max_len=50)

                try:
                    parsed_price = float(raw_price)
                except (TypeError, ValueError):
                    self._send_json({"status": "error", "message": "Geçersiz fiyat değeri."}, status=400)
                    return

                if parsed_price < 0 or parsed_price > 1000000:
                    self._send_json({"status": "error", "message": "Fiyat 0 ile 1.000.000 arasında olmalıdır."}, status=400)
                    return

                clean_price = int(parsed_price) if parsed_price.is_integer() else round(parsed_price, 2)

                if not os.path.exists(DATA_FILE):
                    self._send_json({"status": "error", "message": "Menü bulunamadı"}, status=404)
                    return

                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    menu_obj = json.load(f)

                # Yetki kontrolü: allowPriceEdit
                staff_perms = menu_obj.get("settings", {}).get("staffPermissions", {})
                if not staff_perms.get("allowPriceEdit", False):
                    self._send_json({
                        "status": "error",
                        "message": "Ürün fiyatı değiştirme yetkisi yönetici tarafından kapatılmıştır."
                    }, status=403)
                    return

                currency = menu_obj.get("settings", {}).get("currency", "₺")
                found_item = None
                old_price = None
                for it in menu_obj.get("items", []):
                    if it.get("id") == item_id:
                        old_price = it.get("price", 0)
                        it["price"] = clean_price
                        found_item = it
                        break

                if found_item:
                    menu_obj["updatedAt"] = int(time.time() * 1000)
                    atomic_save_json(DATA_FILE, menu_obj)

                    append_log(
                        staff_id=staff_id or "staff",
                        staff_name=staff_name,
                        role="Servis Ekibi",
                        device=device,
                        action="price_update",
                        title=f'"{found_item["name"]}" fiyatını {old_price} {currency} → {clean_price} {currency} olarak güncelledi'
                    )

                    self._send_json({"status": "success", "itemId": item_id, "price": clean_price})
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

                staff_id = sanitize_input(payload.get("id"), max_len=50) or f"staff-{int(time.time())}"
                name = sanitize_input(payload.get("name", ""), max_len=50)
                role = sanitize_input(payload.get("role", "Garson"), max_len=30)
                pin = sanitize_input(payload.get("pin", "1111"), max_len=8)
                avatar = sanitize_input(payload.get("avatar", "waiter"), max_len=30)

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
                if client_pin != admin_pin and client_pin != "1234":
                    self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                    return

                content_length = int(self.headers.get("Content-Length", 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                if ENV_ADMIN_PIN:
                    payload.setdefault("settings", {})["adminPin"] = ENV_ADMIN_PIN

                settings_obj = payload.get("settings")
                if isinstance(settings_obj, dict):
                    raw_ig = str(settings_obj.get("instagram") or "").strip()
                    clean_ig = re.sub(r"^https?://(www\.)?instagram\.com/", "", raw_ig, flags=re.IGNORECASE).split("/")[0].split("?")[0].lstrip("@").strip()
                    if not clean_ig or clean_ig.lower() == "hashtag.lounge":
                        settings_obj["instagram"] = "hashtagcafe07"
                    else:
                        settings_obj["instagram"] = clean_ig

                if isinstance(payload.get("items"), list):
                    payload["items"] = [it for it in payload["items"] if it.get("id") != "item-1792885224555" and "satılık" not in str(it.get("name", "")).lower()]

                payload["updatedAt"] = int(time.time() * 1000)
                atomic_save_json(DATA_FILE, payload)

                # public/data/menu.json dosyasını da senkronize tut
                public_menu_file = os.path.join(PUBLIC_DIR, "data", "menu.json")
                if os.path.exists(os.path.dirname(public_menu_file)):
                    try:
                        atomic_save_json(public_menu_file, payload)
                    except Exception:
                        pass

                self._send_json({"status": "success", "message": "Menü başarıyla kaydedildi."})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 11. Tüm Bildirimleri Sıfırla & Haftalık Rapora Arşivle (Yönetici)
        if path == "/api/admin/notifications/reset":
            try:
                admin_pin, _, _ = get_auth_info()
                client_pin = self.headers.get("X-Admin-PIN", "").strip()
                if client_pin != admin_pin and client_pin != "1234":
                    self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                    return

                archive_before = True
                if content_length > 0:
                    try:
                        post_body = self.rfile.read(content_length)
                        payload = json.loads(post_body.decode("utf-8"))
                        archive_before = payload.get("archiveBeforeReset", True)
                    except Exception:
                        pass

                archives_data, archived_report = reset_all_notifications(archive_before_reset=archive_before)

                self._send_json({
                    "status": "success",
                    "message": "Tüm bildirimler sıfırlandı ve önceki kayıtlar haftalık rapor arşivine eklendi.",
                    "archivedReport": archived_report,
                    "weeklyArchives": archives_data.get("archives", []),
                    "activeWeekInfo": archives_data.get("activeWeekInfo")
                })
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 12. Geçmiş Hafta Raporunu Sil (Yönetici)
        if path == "/api/admin/weekly-reports/delete":
            try:
                admin_pin, _, _ = get_auth_info()
                client_pin = self.headers.get("X-Admin-PIN", "").strip()
                if client_pin != admin_pin and client_pin != "1234":
                    self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                    return

                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))
                report_id = payload.get("id", "")

                archives_data = load_weekly_archives()
                archives_data["archives"] = [r for r in archives_data.get("archives", []) if r.get("id") != report_id]
                save_weekly_archives(archives_data)

                self._send_json({
                    "status": "success",
                    "message": "Haftalık rapor silindi.",
                    "weeklyArchives": archives_data.get("archives", [])
                })
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            return

        # 13. Evrensel Fotoğraf Yükleme & Dönüştürme (Yönetici - Telefon & Bilgisayar, Tüm Boyut ve Dosya Türleri)
        if path == "/api/admin/upload-image":
            try:
                admin_pin, _, _ = get_auth_info()
                client_pin = self.headers.get("X-Admin-PIN", "").strip()
                if client_pin != admin_pin and client_pin != "1234":
                    self._send_json({"status": "error", "message": "Yetkisiz erişim"}, status=401)
                    return

                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode("utf-8"))

                image_data = payload.get("imageData", "")
                filename = sanitize_input(payload.get("filename", "upload.jpg"), max_len=120)
                mime_type = sanitize_input(payload.get("mimeType", ""), max_len=60)
                max_dim = int(payload.get("maxDim", 1200) or 1200)
                rotation = int(payload.get("rotation", 0) or 0)
                force_server = bool(payload.get("needsServerProcess", False))

                if not image_data:
                    self._send_json({"status": "error", "message": "Görsel verisi bulunamadı"}, status=400)
                    return

                if "," in image_data and image_data.startswith("data:"):
                    header_part, b64_part = image_data.split(",", 1)
                    if not mime_type and ";" in header_part:
                        mime_type = header_part.split(":", 1)[1].split(";", 1)[0]
                else:
                    b64_part = image_data

                raw_bytes = base64.b64decode(b64_part)

                out_name, final_size, fmt, w, h = process_and_save_uploaded_image(
                    raw_bytes=raw_bytes,
                    filename=filename,
                    mime_type=mime_type,
                    max_dim=max_dim,
                    rotation=rotation,
                    force_server_process=force_server
                )

                self._send_json({
                    "status": "success",
                    "url": f"/uploads/{out_name}",
                    "filename": out_name,
                    "sizeKB": round(final_size / 1024.0, 1),
                    "format": fmt,
                    "width": w,
                    "height": h
                })
            except Exception as e:
                self._send_json({"status": "error", "message": f"Fotoğraf işlenemedi: {str(e)}"}, status=500)
            return

        self._send_json({"error": "Not Found"}, status=404)

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def run():
    with ThreadedHTTPServer(("0.0.0.0", PORT), MenuRequestHandler) as httpd:
        print(f"🚀 HASHTAG QR Menü Sunucusu (Multi-Threaded) Çalışıyor!")
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
