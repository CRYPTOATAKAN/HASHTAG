/**
 * HASHTAG QR Menü - Ana İstemci Mantığı
 */

// Varsayılan / Fallback Menü Verisi (Sunucu olmadan da çalışabilmesi için)
let menuData = null;
let currentCategory = 'all';
let searchQuery = '';
let selectedTable = null;
let estimatedBillItems = {};
let currentRating = 5;
let currentFeedbackTags = new Set();
let standaloneRating = 5;
let standaloneFeedbackTags = new Set();
let lastKnownMenuVersion = null;
let lastHeroSignature = '';
let customerMenuSyncTimer = null;

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// URL'den Masa Numarası Yakalama (?table=5 veya ?masa=5)
function getTableFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('table') || params.get('masa') || null;
}

// Canlı API Temel URL (Localhost, Canlı Sunucu veya Desktop file:// desteği)
function getApiBaseUrl() {
  if (window.location.protocol.startsWith('http')) {
    return ''; // Doğrudan aktif sunucu
  }
  // Eğer masaüstündeki HTML dosyasından açıldıysa canlı Northflank adresine bağlan
  return 'https://p01--hashtag--xqx4khzq6gkf.code.run';
}

// Yüklenen (/uploads/...) veya Harici Görseller İçin Evrensel URL Çözücü
function resolveImageUrl(url, fallback = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80') {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return fallback;
  }
  const clean = url.trim();
  if (clean.startsWith('data:') || clean.startsWith('blob:') || clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  if (clean.startsWith('/uploads/')) {
    const apiBase = getApiBaseUrl();
    return apiBase ? `${apiBase}${clean}` : clean;
  }
  return clean;
}

// Görsel Bildirim (Toast) Sistemi
function showToast(message, type = 'success') {
  let toast = document.getElementById('hashtag-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'hashtag-toast';
    document.body.appendChild(toast);
  }

  if (type === 'success') {
    toast.className = 'fixed top-5 right-5 z-[9999] px-5 py-3.5 rounded-2xl shadow-2xl font-bold text-xs transition-all duration-300 bg-emerald-500 text-black flex items-center gap-2 shadow-emerald-500/30';
  } else {
    toast.className = 'fixed top-5 right-5 z-[9999] px-5 py-3.5 rounded-2xl shadow-2xl font-bold text-xs transition-all duration-300 bg-red-500 text-white flex items-center gap-2 shadow-red-500/30';
  }

  toast.innerHTML = message;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.transform = 'translateY(-20px)';
    toast.style.opacity = '0';
  }, 3500);
}

// Güvenli Depolama Yardımcıları
function safeGetStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSetStorage(key, val) {
  try { localStorage.setItem(key, val); } catch (e) {}
}

// Eski şablondan kalan 'hashtag.lounge' sahte Instagram adresini temizleyip resmi hesaba dönüştürür
function normalizeInstagramHandle(val) {
  const raw = String(val || '').trim();
  const cleaned = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .split(/[/?#]/)[0]
    .replace(/^@+/, '')
    .trim();
  if (!cleaned || cleaned.toLowerCase() === 'hashtag.lounge') {
    return 'hashtagcafe07';
  }
  return cleaned;
}

function sanitizeMenuDataSettings(data) {
  if (!data || typeof data !== 'object') return data;
  if (!data.settings || typeof data.settings !== 'object') {
    data.settings = {};
  }
  data.settings.instagram = normalizeInstagramHandle(data.settings.instagram);
  if (
    data.settings.baseUrl === 'https://hashtag-menu.com' ||
    data.settings.baseUrl === 'null' ||
    data.settings.baseUrl === 'file://'
  ) {
    data.settings.baseUrl = '';
  }

  // Silinmiş kategoriden kalan 'satılık' sahipsiz test ürününü önbellekten ve tüm görünümlerden anında temizle
  if (Array.isArray(data.items)) {
    data.items = data.items.filter(it => it && it.id !== 'item-1792885224555' && !String(it.name || '').toLowerCase().includes('satılık'));
  }
  return data;
}

// Sekmeler Arası Eşitleme Kanalı (BroadcastChannel)
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hashtag_menu_sync') : null;
if (syncChannel) {
  syncChannel.onmessage = async (ev) => {
    if (ev.data === 'sync') {
      await loadMenuData();
      if (document.getElementById('menu-app')) {
        applyLiveCustomerMenuRefresh(false);
      } else if (document.getElementById('admin-main-content') && typeof updateAdminStats === 'function') {
        updateAdminStats();
        if (typeof renderAdminProductTable === 'function') renderAdminProductTable();
        if (typeof renderQuickPriceTable === 'function') renderQuickPriceTable();
      }
    }
  };
}

// Depolama Olayı Dinleyicisi (Farklı Sekmeler İçin)
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e) => {
    if (e.key === 'hashtag_menu_cache' && e.newValue) {
      try {
        menuData = sanitizeMenuDataSettings(JSON.parse(e.newValue));
        if (menuData && (menuData._version || menuData.updatedAt)) {
          lastKnownMenuVersion = menuData._version || menuData.updatedAt;
        }
        if (document.getElementById('menu-app')) {
          applyLiveCustomerMenuRefresh(false);
        } else if (document.getElementById('admin-main-content') && typeof updateAdminStats === 'function') {
          updateAdminStats();
          if (typeof renderAdminProductTable === 'function') renderAdminProductTable();
          if (typeof renderQuickPriceTable === 'function') renderQuickPriceTable();
        }
      } catch (err) {}
    }
  });
}

// Menü Verisini Yükleme (CORS preflight engeline takılmayan önbellek atlatmalı canlı sunucu kontrolü)
async function loadMenuData() {
  let loadedFromServer = false;
  let serverData = null;

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/menu?_t=' + Date.now(), {
      cache: 'no-store'
    });
    if (res.ok) {
      serverData = sanitizeMenuDataSettings(await res.json());
      loadedFromServer = true;
    }
  } catch (err) {
    console.warn("Canlı sunucudan çekilemedi, önbelleğe bakılıyor:", err);
  }

  // Önbellek kontrolü (Eski 'hashtag.lounge' kalıntısı varsa anında temizle ve düzelt)
  const cached = safeGetStorage('hashtag_menu_cache');
  let cachedData = null;
  if (cached) {
    try {
      const parsedCache = JSON.parse(cached);
      const prevInsta = parsedCache && parsedCache.settings && parsedCache.settings.instagram;
      cachedData = sanitizeMenuDataSettings(parsedCache);
      if (prevInsta !== cachedData.settings.instagram) {
        safeSetStorage('hashtag_menu_cache', JSON.stringify(cachedData));
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (loadedFromServer && serverData) {
    // Eğer yerel önbellekte daha yeni bir düzenleme varsa (örneğin çevrimdışı/masaüstü panelden eklenen/silinen kategori),
    // sunucudaki eski verinin yerel son değişiklikleri ezmesine izin verme!
    if (cachedData && cachedData.updatedAt && serverData.updatedAt && cachedData.updatedAt > serverData.updatedAt) {
      menuData = cachedData;
      // Arka planda sunucuyu son verimizle senkronize etmeyi dene
      try {
        let pin = '';
        try { pin = sessionStorage.getItem('hashtag_admin_pin') || ''; } catch (e) {}
        if (!pin) pin = (menuData.settings && menuData.settings.adminPin) || '1234';
        const apiBase = getApiBaseUrl();
        fetch(apiBase + '/api/menu/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-PIN': pin },
          body: JSON.stringify(menuData)
        }).catch(() => {});
      } catch (e) {}
    } else {
      menuData = serverData;
    }

    if (menuData && (menuData._version || menuData.updatedAt)) {
      lastKnownMenuVersion = menuData._version || menuData.updatedAt;
    }
    safeSetStorage('hashtag_menu_cache', JSON.stringify(menuData));
    return menuData;
  }

  // Sunucuya ulaşılamadıysa önbellek varsa onu kullan
  if (cachedData) {
    menuData = cachedData;
    if (menuData && (menuData._version || menuData.updatedAt)) {
      lastKnownMenuVersion = menuData._version || menuData.updatedAt;
    }
    return menuData;
  }

  // Varsayılan zengin veri
  if (window.DEFAULT_MENU_DATA) {
    menuData = sanitizeMenuDataSettings(JSON.parse(JSON.stringify(window.DEFAULT_MENU_DATA)));
    safeSetStorage('hashtag_menu_cache', JSON.stringify(menuData));
    return menuData;
  }

  // Acil durum boş veri
  menuData = sanitizeMenuDataSettings({
    settings: {
      cafeName: "HASHTAG",
      cafeTagline: "Lounge & Hookah Experience",
      currency: "₺",
      adminPin: "1234",
      wifiName: "HASHTAG_VIP",
      wifiPassword: "hashtagwelcome",
      instagram: "hashtagcafe07",
      enableServiceCalls: false,
      baseUrl: window.location.protocol.startsWith('http') ? window.location.origin : ''
    },
    categories: [],
    items: []
  });
  safeSetStorage('hashtag_menu_cache', JSON.stringify(menuData));
  return menuData;
}

// Menüyü Kaydetme (Önce Yerel Önbellek, Doğrulanmış Sunucu POST ve Sekmeler Arası Eşitleme)
async function saveMenuData(updatedData) {
  sanitizeMenuDataSettings(updatedData);
  updatedData.updatedAt = Date.now();
  menuData = updatedData;

  // 1. ANINDA YEREL ÖNBELLEK: Masaüstü file:// veya çevrimdışı durumlarda veri kaybını engelle
  safeSetStorage('hashtag_menu_cache', JSON.stringify(updatedData));
  lastKnownMenuVersion = updatedData.updatedAt;

  // Giriş yapılmış PIN'i header ile gönder (Güvenlik)
  let pin = '';
  try { pin = sessionStorage.getItem('hashtag_admin_pin') || ''; } catch (e) {}
  if (!pin) pin = (menuData.settings && menuData.settings.adminPin) || '1234';

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/menu/update', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Admin-PIN': pin
      },
      body: JSON.stringify(updatedData)
    });

    if (res.ok) {
      showToast('✅ Değişiklikler canlı menüye başarıyla kaydedildi!', 'success');
      // Sunucudan güncel versiyon damgalı veriyi çekip önbelleği ve diğer sekmeleri eşitle
      try {
        const verifyRes = await fetch(apiBase + '/api/menu?_t=' + Date.now(), { cache: 'no-store' });
        if (verifyRes.ok) {
          const freshData = sanitizeMenuDataSettings(await verifyRes.json());
          if (freshData) {
            menuData = freshData;
            if (menuData._version || menuData.updatedAt) {
              lastKnownMenuVersion = menuData._version || menuData.updatedAt;
            }
            safeSetStorage('hashtag_menu_cache', JSON.stringify(menuData));
          }
        }
      } catch (e) {}

      // Race condition koruması: postMessage('sync') mutlaka sunucu kaydı tamamlandıktan sonra çağrılır
      if (syncChannel) {
        try { syncChannel.postMessage('sync'); } catch (e) {}
      }
      return true;
    } else {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.message || `Sunucu hatası (${res.status})`;
      if (res.status === 401) {
        showToast('⚠️ Yetki hatası: Yönetici PIN kodu geçersiz!', 'error');
        alert('⚠️ Yetki hatası!\nYönetici PIN kodu uyuşmuyor veya oturum süresi doldu.');
        return false;
      }
      if (syncChannel) {
        try { syncChannel.postMessage('sync'); } catch (e) {}
      }
      showToast('ℹ️ Değişiklikler yerel menüye kaydedildi (Sunucu yanıtı: ' + msg + ')', 'success');
      return true;
    }
  } catch (err) {
    console.warn("Sunucuya ulaşılamadı, ancak yerel menüye başarıyla kaydedildi:", err);
    if (syncChannel) {
      try { syncChannel.postMessage('sync'); } catch (e) {}
    }
    showToast('ℹ️ Değişiklikler yerel olarak kaydedildi (Sunucu çevrimdışı)', 'success');
    return true;
  }
}

// Müşteri Menüsünü Canlı Yenileme (Silinen kategori & güncellenen adisyon korumalı)
function applyLiveCustomerMenuRefresh(forceHero = false) {
  if (!document.getElementById('menu-app') || !menuData) return;

  if (currentCategory !== 'all') {
    const catExists = (menuData.categories || []).some(c => c.id === currentCategory);
    if (!catExists) {
      currentCategory = 'all';
    }
  }

  // Müşterinin adisyon hesaplayıcısındaki ürünleri güncel fiyat/isim/silinme durumuna göre eşitle
  if (estimatedBillItems && typeof estimatedBillItems === 'object') {
    const latestItems = menuData.items || [];
    Object.keys(estimatedBillItems).forEach(itemId => {
      const found = latestItems.find(i => i.id === itemId);
      if (!found) {
        delete estimatedBillItems[itemId];
      } else {
        estimatedBillItems[itemId].item = found;
      }
    });
    if (typeof updateBillEstimateUI === 'function') {
      updateBillEstimateUI();
    }
  }

  renderHeaderInfo();
  renderCategoryPills();
  renderMenuItems();

  const heroSig = JSON.stringify({
    cafeName: (menuData.settings && menuData.settings.cafeName) || '',
    announcement: (menuData.settings && menuData.settings.announcement) || null,
    brandMedia: (menuData.settings && menuData.settings.brandMedia) || null
  });
  if (forceHero || heroSig !== lastHeroSignature) {
    lastHeroSignature = heroSig;
    initHeroBanner();
  }
}

// Farklı Cihazlar & Yerel Sekmeler Arası Canlı Senkronizasyon (2.5 sn)
function startCustomerLiveMenuSync() {
  if (customerMenuSyncTimer) clearInterval(customerMenuSyncTimer);
  customerMenuSyncTimer = setInterval(async () => {
    if (!document.getElementById('menu-app')) return;

    // 1. Önce yerel önbellek (localStorage) kontrolü yap:
    // Masaüstü file:// veya aynı tarayıcıda yönetici panelinden eklenen / silinen kategoriler anında yansısın
    try {
      const cached = safeGetStorage('hashtag_menu_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const cachedVer = parsed._version || parsed.updatedAt;
        const currentVer = menuData ? (menuData._version || menuData.updatedAt) : null;
        const cachedCatCount = Array.isArray(parsed.categories) ? parsed.categories.length : -1;
        const currentCatCount = (menuData && Array.isArray(menuData.categories)) ? menuData.categories.length : -1;

        if ((cachedVer && cachedVer !== currentVer) || cachedCatCount !== currentCatCount) {
          menuData = sanitizeMenuDataSettings(parsed);
          if (cachedVer) lastKnownMenuVersion = cachedVer;
          applyLiveCustomerMenuRefresh(false);
          return;
        }
      }
    } catch (e) {}

    // 2. Ağ/Sunucu kontrolü (Eğer sekme görünür durumdaysa)
    if (document.visibilityState !== 'visible') return;
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(apiBase + '/api/menu/version?_t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.version) {
        if (lastKnownMenuVersion === null) {
          lastKnownMenuVersion = data.version;
        } else if (data.version !== lastKnownMenuVersion) {
          lastKnownMenuVersion = data.version;
          await loadMenuData();
          applyLiveCustomerMenuRefresh(false);
        }
      }
    } catch (e) {}
  }, 2500);
}

window.refreshCustomerMenu = async function(btn) {
  if (btn) btn.classList.add('animate-spin');
  await loadMenuData();
  applyLiveCustomerMenuRefresh(true);
  showToast('✅ Menü güncellendi!');
  if (btn) {
    setTimeout(() => btn.classList.remove('animate-spin'), 600);
  }
};

// Sekme veya telefon ekranı tekrar açıldığında veya pencereye odaklanıldığında menüyü otomatik yenile
function handleCustomerMenuVisibilityOrFocus() {
  if (document.getElementById('menu-app')) {
    // Önce hızlıca yerel önbelleğe bak
    try {
      const cached = safeGetStorage('hashtag_menu_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const cachedVer = parsed._version || parsed.updatedAt;
        const currentVer = menuData ? (menuData._version || menuData.updatedAt) : null;
        const cachedCatCount = Array.isArray(parsed.categories) ? parsed.categories.length : -1;
        const currentCatCount = (menuData && Array.isArray(menuData.categories)) ? menuData.categories.length : -1;

        if ((cachedVer && cachedVer !== currentVer) || cachedCatCount !== currentCatCount) {
          menuData = sanitizeMenuDataSettings(parsed);
          if (cachedVer) lastKnownMenuVersion = cachedVer;
          applyLiveCustomerMenuRefresh(false);
          return;
        }
      }
    } catch (e) {}

    loadMenuData().then(() => {
      applyLiveCustomerMenuRefresh(false);
    });
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    handleCustomerMenuVisibilityOrFocus();
  }
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('focus', () => {
    handleCustomerMenuVisibilityOrFocus();
  });
}

// DOM Hazır Olduğunda Menüyü Başlat
document.addEventListener('DOMContentLoaded', async () => {
  const urlTable = getTableFromUrl();
  if (urlTable) {
    selectedTable = String(urlTable);
    try { sessionStorage.setItem('hashtag_active_table', String(urlTable)); } catch (e) {}
  } else {
    try {
      localStorage.removeItem('hashtag_table');
      selectedTable = sessionStorage.getItem('hashtag_active_table') || null;
    } catch (e) {
      selectedTable = null;
    }
  }

  await loadMenuData();

  if (document.getElementById('menu-app')) {
    initCustomerMenu();
  } else if (document.getElementById('admin-app')) {
    initAdminPanel();
  }
});

/* ==========================================================================
   MÜŞTERİ MENÜSÜ İŞLEVLERİ
   ========================================================================== */

function initCustomerMenu() {
  renderHeaderInfo();
  renderCategoryPills();
  renderMenuItems();
  setupSearchInput();
  setupWifiModal();
  setupServiceCallModal();
  initHookahSmokeEngine();
  lastHeroSignature = JSON.stringify({
    cafeName: (menuData && menuData.settings && menuData.settings.cafeName) || '',
    announcement: (menuData && menuData.settings && menuData.settings.announcement) || null,
    brandMedia: (menuData && menuData.settings && menuData.settings.brandMedia) || null
  });
  initHeroBanner();
  startCustomerLiveMenuSync();
}

/* ==========================================================================
   GERÇEKÇİ & AKICI NARGİLE DUMANI SİMÜLASYON MOTORU (GPU HIZLANDIRMALI)
   Sayfa yukarı/aşağı kaydırıldıkça dumanlar akıcı bir şekilde kıvrılır,
   hızlanır ve sinematik nargile atmosferi yaratır.
   ========================================================================== */
function initHookahSmokeEngine() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const canvas = document.getElementById('hookah-smoke-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });

  // 1. GPU Hızlandırması için Hazır Önceden Hesaplanmış Duman Dokuları (Offscreen Sprites)
  function createVaporSprite(colorStops) {
    const sCanvas = document.createElement('canvas');
    const size = 160;
    sCanvas.width = size;
    sCanvas.height = size;
    const sCtx = sCanvas.getContext('2d');
    const half = size / 2;
    const grad = sCtx.createRadialGradient(half, half, 0, half, half, half);
    colorStops.forEach(st => grad.addColorStop(st[0], st[1]));
    sCtx.fillStyle = grad;
    sCtx.beginPath();
    sCtx.arc(half, half, half, 0, Math.PI * 2);
    sCtx.fill();
    return sCanvas;
  }

  // Saf beyaz/gümüş nargile buharı
  const spriteWhite = createVaporSprite([
    [0, 'rgba(255, 255, 255, 0.90)'],
    [0.25, 'rgba(240, 248, 255, 0.68)'],
    [0.52, 'rgba(220, 235, 255, 0.32)'],
    [0.78, 'rgba(200, 220, 250, 0.10)'],
    [1, 'rgba(200, 220, 250, 0)']
  ]);

  // Neon turkuaz yansımalı nargile buharı
  const spriteCyan = createVaporSprite([
    [0, 'rgba(255, 255, 255, 0.88)'],
    [0.28, 'rgba(165, 243, 252, 0.60)'],
    [0.56, 'rgba(6, 182, 212, 0.24)'],
    [0.82, 'rgba(6, 182, 212, 0.06)'],
    [1, 'rgba(6, 182, 212, 0)']
  ]);

  // Neon amber/altın yansımalı nargile buharı
  const spriteAmber = createVaporSprite([
    [0, 'rgba(255, 255, 255, 0.88)'],
    [0.28, 'rgba(254, 240, 138, 0.58)'],
    [0.56, 'rgba(245, 158, 11, 0.22)'],
    [0.82, 'rgba(245, 158, 11, 0.05)'],
    [1, 'rgba(245, 158, 11, 0)']
  ]);

  const sprites = [spriteWhite, spriteWhite, spriteWhite, spriteCyan, spriteAmber];

  // 2. Parçacık Modeli
  const particles = [];
  const MAX_PARTICLES = 42;

  function createParticle(initialScatter = false, edgeSpawn = null) {
    const sprite = sprites[Math.floor(Math.random() * sprites.length)];
    const size = 110 + Math.random() * 110;
    
    let x, y;
    if (initialScatter) {
      x = Math.random() * width;
      y = Math.random() * height;
    } else if (edgeSpawn === 'top') {
      x = Math.random() * width;
      y = -size * 0.4;
    } else {
      // Bottom spawn (default)
      x = -size * 0.2 + Math.random() * (width + size * 0.4);
      y = height + Math.random() * 60;
    }

    return {
      x,
      y,
      vx: (Math.random() - 0.5) * 0.45,
      vy: -(0.45 + Math.random() * 0.85), // Duman yukarı doğru süzülür
      size,
      growthRate: 0.22 + Math.random() * 0.35,
      alpha: 0,
      maxAlpha: 0.38 + Math.random() * 0.35,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.007,
      swirlPhase: Math.random() * Math.PI * 2,
      swirlSpeed: 0.015 + Math.random() * 0.02,
      swirlAmp: 0.6 + Math.random() * 1.0,
      life: initialScatter ? Math.floor(Math.random() * 180) : 0,
      maxLife: 240 + Math.floor(Math.random() * 220),
      sprite
    };
  }

  // İlk açılışta ekranın boş kalmaması için dağınık parçacıklar
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push(createParticle(true));
  }

  // 3. Sayfa Kaydırma Hızı & İvme Takibi (Scroll Coupling)
  let lastScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  let scrollVelocity = 0;
  let targetVelocity = 0;

  function onScroll() {
    const curY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const deltaY = curY - lastScrollY;
    lastScrollY = curY;

    // Hedef ivmeyi güncelle (Aşağı kaydırmada pozitif, yukarıda negatif)
    targetVelocity += deltaY * 0.65;
    if (targetVelocity > 40) targetVelocity = 40;
    if (targetVelocity < -40) targetVelocity = -40;

    // Hızlı kaydırmada ekstra duman püskürmesi tetikle
    if (Math.abs(deltaY) > 12 && particles.length < 55) {
      particles.push(createParticle(false, deltaY > 0 ? 'bottom' : 'top'));
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // Sekme arka plana atıldığında CPU harcamayı durdur
  let isTabVisible = true;
  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
  });

  // 4. Ana Animasyon Döngüsü (60 FPS)
  function render() {
    if (!isTabVisible) {
      window.requestAnimationFrame(render);
      return;
    }

    // İvmeli yumuşatma (Damping & Inertia)
    scrollVelocity += (targetVelocity - scrollVelocity) * 0.16;
    targetVelocity *= 0.88;

    // CSS Değişkenlerini senkronize güncelle (Parallax ve CSS Dumanlar için)
    document.documentElement.style.setProperty('--scroll-y', `${lastScrollY}px`);
    document.documentElement.style.setProperty('--bg-parallax-y', `${lastScrollY * -0.08}px`);

    // Ekranı temizle
    ctx.clearRect(0, 0, width, height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Fizik: Kaydırma yönünde rüzgar & girdap etkisi
      // Kullanıcı aşağı kaydırdıkça nargile dumanı yukarı doğru ivmelenir
      p.y += p.vy - (scrollVelocity * 0.35);

      // Yatay dalgalanma ve duman kıvrımı
      p.swirlPhase += p.swirlSpeed + (Math.abs(scrollVelocity) * 0.003);
      p.x += p.vx + Math.sin(p.swirlPhase) * p.swirlAmp + (scrollVelocity * 0.06);

      // Kendi etrafında hafifçe dönme
      p.rotation += p.rotationSpeed + (scrollVelocity * 0.001);

      // Duman yükseldikçe doğal olarak genleşir
      p.size += p.growthRate;

      // Opaklık zarfı (Doğal beliriş ve sönümleme)
      p.life++;
      const progress = p.life / p.maxLife;
      if (progress < 0.20) {
        p.alpha = (progress / 0.20) * p.maxAlpha;
      } else if (progress > 0.72) {
        p.alpha = ((1 - progress) / 0.28) * p.maxAlpha;
      } else {
        p.alpha = p.maxAlpha;
      }

      // Çizim
      if (p.alpha > 0.01 && p.size > 10) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const halfSize = p.size / 2;
        ctx.drawImage(p.sprite, -halfSize, -halfSize, p.size, p.size);
        ctx.restore();
      }

      // Ömür bittiğinde veya ekrandan tamamen çıktığında yenile
      const isDead = p.life >= p.maxLife || p.y < -p.size || p.y > height + p.size * 1.5;
      if (isDead) {
        if (particles.length > MAX_PARTICLES) {
          particles.splice(i, 1);
        } else {
          particles[i] = createParticle(false);
        }
      }
    }

    window.requestAnimationFrame(render);
  }

  window.requestAnimationFrame(render);
}

/* ==========================================================================
   DİNAMİK HİBRİT HERO BANNER SİSTEMİ (INSTAGRAM STORY CAROUSEL & CANLI MOOD)
   - Slayt 1: Neon Atmosfer & İkonik HashtaG Görseli (Ken Burns + Neon Breathe)
   - Slayt 2: Haftanın / Günün Duyurusu (Yönetici Paneli Kontrollü)
   - Slayt 3: Saat Bazlı Adaptif Canlı Mood (Öğle / Akşam Prime / Gece Chill)
   ========================================================================== */

let heroCurrentSlideIndex = 0;
let heroSlidesList = [];
let heroProgressAnimFrame = null;
let heroSlideStartTime = 0;
const HERO_SLIDE_DURATION = 5000; // Her slayt 5 saniye
let heroIsPaused = false;
let heroPauseStartTime = 0;
let heroTotalPausedDuration = 0;

function getHeroTimeAdaptiveConfig() {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 12 && hour < 18) {
    return {
      badgeIcon: 'coffee',
      badgeText: 'GÜN ORTASI KAHVE MOLASI',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      title: 'Spesiyal Kahveler & Tatlılar',
      desc: 'Güne leziz bir mola: 3. nesil demlemeler, taze kahveler ve spesiyaller.',
      image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
      timeLabel: 'GÜNDÜZ MODU'
    };
  } else if (hour >= 18 && hour < 23) {
    return {
      badgeIcon: 'flame',
      badgeText: 'PRIME TIME LOUNGE SEANSI',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      title: 'Yoğun Duman & Premium Tütünler',
      desc: 'Al Fakher, Darkside & Tangiers özel dolumları ve buzlu marpuç keyfi.',
      image: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=1200&q=80',
      timeLabel: 'AKŞAM SEANSI'
    };
  } else if (hour >= 23 || hour < 5) {
    return {
      badgeIcon: 'sparkles',
      badgeText: 'LATE NIGHT CHILL VIBES',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      title: 'Gece Modu & İmza Mocktailler',
      desc: 'Loş ışıklar, derin bass ritimleri ve ferahlatıcı imza lezzetler.',
      image: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1200&q=80',
      timeLabel: 'GECE MODU'
    };
  } else {
    return {
      badgeIcon: 'sun',
      badgeText: 'GÜNE ENERJİK BAŞLANGIÇ',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      title: 'Taze Başlangıç & Lounge Huzuru',
      desc: 'Yeni demlenmiş Türk kahvesi ve ferahlatıcı içeceklerle güne başla.',
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80',
      timeLabel: 'GÜN BAŞLANGICI'
    };
  }
}

function buildHeroSlides() {
  const slides = [];
  const s = (menuData && menuData.settings) ? menuData.settings : {};
  const bm = s.brandMedia || {};
  const cafeName = (s.cafeName || 'HASHTAG').toUpperCase();

  // Slayt 1: Yönetici Kontrollü Ana Kapak & Atmosfer Görseli
  const heroCustomImg = (bm.heroBannerImage && String(bm.heroBannerImage).trim())
    ? resolveImageUrl(bm.heroBannerImage, 'hashtag-banner.jpg?v=3.0')
    : 'hashtag-banner.jpg?v=3.0';
  const heroBadge = bm.heroBannerBadge !== undefined
    ? String(bm.heroBannerBadge).trim()
    : 'PREMİUM ATMOSFER';
  const heroTitle = (bm.heroBannerTitle !== undefined && String(bm.heroBannerTitle).trim())
    ? String(bm.heroBannerTitle).trim()
    : `${cafeName} LOUNGE & HOOKAH`;
  const heroDesc = bm.heroBannerDesc !== undefined
    ? String(bm.heroBannerDesc).trim()
    : '💨 Özel Nargile Karışımları • 🍹 Mocktail & Kahve';

  slides.push({
    id: 'neon-banner',
    image: heroCustomImg,
    imageFit: bm.heroBannerFit || 'cover',
    fallbackImage: 'images/hashtag-banner.jpg?v=3.0',
    badgeIcon: 'sparkles',
    badgeText: heroBadge,
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    title: heroTitle,
    desc: heroDesc,
    liveLabel: 'CANLI'
  });

  // Slayt 2: Yönetici Kontrollü Günün / Haftanın Duyurusu (Açık/Kapalı Kontrolü)
  const ann = s.announcement;
  const isAnnEnabled = !ann || ann.enabled !== false;
  if (isAnnEnabled) {
    const annObj = ann || {};
    const badgeVal = annObj.badge !== undefined ? String(annObj.badge).trim() : '🔥 ŞEFİN TAVSİYESİ';
    const titleVal = (annObj.title !== undefined && String(annObj.title).trim())
      ? String(annObj.title).trim()
      : 'Love 66 & Lady Killer Özel Mix';
    const descVal = annObj.desc !== undefined
      ? String(annObj.desc).trim()
      : 'Özel buzlu marpuç ve taze nane esintisiyle hazırlanan günün karışımı.';

    slides.push({
      id: 'admin-announcement',
      image: resolveImageUrl(annObj.image, 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=1200&q=80'),
      imageFit: annObj.imageFit || 'cover',
      fallbackImage: 'hashtag-banner.jpg?v=3.0',
      badgeIcon: 'flame',
      badgeText: badgeVal,
      badgeClass: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
      title: titleVal,
      desc: descVal,
      liveLabel: 'GÜNÜN ÖZELİ'
    });
  }

  // Slayt 3: Saat Bazlı Adaptif Canlı Mood (Yönetici özel görsel yükleyebilir veya kapatabilir)
  const isMoodEnabled = bm.moodSlideEnabled !== false;
  if (isMoodEnabled) {
    const timeMood = getHeroTimeAdaptiveConfig();
    const moodCustomImg = (bm.moodBannerImage && String(bm.moodBannerImage).trim())
      ? resolveImageUrl(bm.moodBannerImage, timeMood.image)
      : timeMood.image;
    slides.push({
      id: 'time-mood',
      image: moodCustomImg,
      imageFit: bm.moodBannerFit || 'cover',
      fallbackImage: 'hashtag-banner.jpg?v=3.0',
      badgeIcon: timeMood.badgeIcon,
      badgeText: timeMood.badgeText,
      badgeClass: timeMood.badgeClass,
      title: timeMood.title,
      desc: timeMood.desc,
      liveLabel: timeMood.timeLabel
    });
  }

  return slides;
}

function initHeroBanner() {
  const card = document.getElementById('hero-banner-card');
  if (!card) return;

  if (heroProgressAnimFrame) {
    cancelAnimationFrame(heroProgressAnimFrame);
    heroProgressAnimFrame = null;
  }

  heroSlidesList = buildHeroSlides();
  if (heroSlidesList.length === 0) return;

  // Render progress bar segments & nav arrows visibility
  const progressContainer = document.getElementById('hero-progress-bars');
  if (progressContainer) {
    if (heroSlidesList.length <= 1) {
      progressContainer.innerHTML = '';
      progressContainer.classList.add('hidden');
    } else {
      progressContainer.classList.remove('hidden');
      progressContainer.innerHTML = heroSlidesList.map((_, i) => `
        <div class="h-1 flex-1 rounded-full bg-white/20 overflow-hidden cursor-pointer backdrop-blur-sm" onclick="jumpToHeroSlide(${i})">
          <div id="hero-progress-fill-${i}" class="h-full bg-gradient-to-r from-amber-400 to-amber-200 rounded-full transition-all duration-75" style="width: 0%;"></div>
        </div>
      `).join('');
    }
  }

  card.querySelectorAll('.hero-nav-btn').forEach(btn => {
    if (heroSlidesList.length <= 1) btn.classList.add('hidden');
    else btn.classList.remove('hidden');
  });

  // Render slide image elements
  const slidesWrapper = document.getElementById('hero-slides-wrapper');
  if (slidesWrapper) {
    slidesWrapper.innerHTML = heroSlidesList.map((slide, i) => {
      const fit = slide.imageFit || 'cover';
      const fitClasses = fit === 'contain'
        ? 'relative z-10 w-full h-full object-contain brightness-95'
        : (fit === 'top'
            ? 'w-full h-full object-cover object-top brightness-90 hero-kenburns'
            : 'w-full h-full object-cover object-center brightness-90 hero-kenburns');
      return `
        <div id="hero-slide-${i}" class="hero-slide ${i === 0 ? 'active' : ''}">
          ${fit === 'contain' ? `
            <img src="${slide.image}" alt="" aria-hidden="true"
                 class="absolute inset-0 w-full h-full object-cover scale-125 blur-xl brightness-50 pointer-events-none"
                 onerror="this.style.display='none'" />
          ` : ''}
          <img 
            src="${slide.image}" 
            onerror="if(!this.src.includes('hashtag-banner.jpg')) this.src='${slide.fallbackImage}';" 
            alt="${escapeHtml(slide.title)}" 
            class="${fitClasses}"
          />
        </div>
      `;
    }).join('');
  }

  // Mouse hover & touch hold events to pause story
  card.onmouseenter = () => {
    heroIsPaused = true;
    heroPauseStartTime = Date.now();
  };
  card.onmouseleave = () => {
    if (heroIsPaused) {
      heroTotalPausedDuration += (Date.now() - heroPauseStartTime);
      heroIsPaused = false;
    }
  };

  card.ontouchstart = () => {
    heroIsPaused = true;
    heroPauseStartTime = Date.now();
  };
  card.ontouchend = () => {
    if (heroIsPaused) {
      heroTotalPausedDuration += (Date.now() - heroPauseStartTime);
      heroIsPaused = false;
    }
  };

  heroCurrentSlideIndex = 0;
  showHeroSlide(0);
}

function showHeroSlide(index) {
  if (index < 0 || index >= heroSlidesList.length) return;
  heroCurrentSlideIndex = index;
  const slide = heroSlidesList[index];

  // Update slide images visibility
  heroSlidesList.forEach((_, i) => {
    const el = document.getElementById(`hero-slide-${i}`);
    if (el) {
      if (i === index) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });

  // Update animated text
  const badgeEl = document.getElementById('hero-slide-badge');
  const titleEl = document.getElementById('hero-slide-title');
  const descEl = document.getElementById('hero-slide-desc');
  const clockEl = document.getElementById('hero-live-clock');
  const textContainer = document.getElementById('hero-slide-text-container');

  if (textContainer) {
    textContainer.classList.remove('hero-content-fade');
    void textContainer.offsetWidth; // trigger reflow
    textContainer.classList.add('hero-content-fade');
  }

  if (badgeEl) {
    if (slide.badgeText) {
      badgeEl.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase mb-1.5 backdrop-blur-md shadow-sm border ${slide.badgeClass || 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`;
      badgeEl.innerHTML = `<i data-lucide="${slide.badgeIcon || 'sparkles'}" class="w-3 h-3 text-amber-400"></i><span>${escapeHtml(slide.badgeText)}</span>`;
    } else {
      badgeEl.className = 'hidden';
      badgeEl.innerHTML = '';
    }
  }

  if (titleEl) {
    titleEl.textContent = slide.title;
  }

  if (descEl) {
    descEl.textContent = slide.desc;
  }

  if (clockEl) {
    clockEl.textContent = slide.liveLabel || 'CANLI';
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Reset and restart progress tracking
  heroSlideStartTime = Date.now();
  heroTotalPausedDuration = 0;
  heroIsPaused = false;
  startHeroProgressLoop();
}

function startHeroProgressLoop() {
  if (heroProgressAnimFrame) {
    cancelAnimationFrame(heroProgressAnimFrame);
  }

  function step() {
    if (!heroIsPaused) {
      const elapsed = Date.now() - heroSlideStartTime - heroTotalPausedDuration;
      const progressPercent = Math.min((elapsed / HERO_SLIDE_DURATION) * 100, 100);

      heroSlidesList.forEach((_, i) => {
        const fill = document.getElementById(`hero-progress-fill-${i}`);
        if (fill) {
          if (i < heroCurrentSlideIndex) {
            fill.style.width = '100%';
          } else if (i === heroCurrentSlideIndex) {
            fill.style.width = `${progressPercent}%`;
          } else {
            fill.style.width = '0%';
          }
        }
      });

      if (progressPercent >= 100) {
        nextHeroSlide();
        return;
      }
    }
    heroProgressAnimFrame = requestAnimationFrame(step);
  }

  heroProgressAnimFrame = requestAnimationFrame(step);
}

window.nextHeroSlide = function(e) {
  if (e) e.stopPropagation();
  if (!heroSlidesList || heroSlidesList.length === 0) return;
  const nextIdx = (heroCurrentSlideIndex + 1) % heroSlidesList.length;
  showHeroSlide(nextIdx);
};

window.prevHeroSlide = function(e) {
  if (e) e.stopPropagation();
  if (!heroSlidesList || heroSlidesList.length === 0) return;
  const prevIdx = (heroCurrentSlideIndex - 1 + heroSlidesList.length) % heroSlidesList.length;
  showHeroSlide(prevIdx);
};

window.jumpToHeroSlide = function(index) {
  if (index >= 0 && index < heroSlidesList.length) {
    showHeroSlide(index);
  }
};

function renderHeaderInfo() {
  if (!menuData || !menuData.settings) return;
  const { settings } = menuData;
  const nameEl = document.getElementById('cafe-name');
  const taglineEl = document.getElementById('cafe-tagline');
  const footerNameEl = document.getElementById('footer-cafe-name');
  const tableBadgeEl = document.getElementById('table-badge');
  const instaEl = document.getElementById('instagram-link');
  const wifiNameEl = document.getElementById('wifi-name-display');
  const wifiPassEl = document.getElementById('wifi-pass-display');
  const wifiTitleEl = document.getElementById('wifi-modal-title');

  const cafeName = settings.cafeName || 'HASHTAG';
  const cafeTagline = settings.cafeTagline || 'Lounge & Hookah Experience';

  if (nameEl) nameEl.textContent = cafeName;
  if (taglineEl) taglineEl.textContent = cafeTagline;
  if (footerNameEl) footerNameEl.textContent = `${cafeName.toUpperCase()} LOUNGE & HOOKAH`;
  document.title = `${cafeName} | ${cafeTagline}`;

  // Sol Üst & Sayfa En Altı Profil Fotoğraflarını ve Arka Plan Atmosfer Görselini Canlı Güncelle
  const bm = settings.brandMedia || {};
  const logoSrc = (bm.logoImage && String(bm.logoImage).trim())
    ? resolveImageUrl(bm.logoImage, 'hashtag-logo.jpg?v=2.5')
    : 'hashtag-logo.jpg?v=2.5';
  const logoFitClass = bm.logoFit === 'contain'
    ? 'w-full h-full object-contain p-0.5'
    : 'w-full h-full object-cover';

  const headerLogoEl = document.getElementById('header-logo-img');
  const footerLogoEl = document.getElementById('footer-logo-img');
  if (headerLogoEl) {
    headerLogoEl.src = logoSrc;
    headerLogoEl.className = logoFitClass;
  }
  if (footerLogoEl) {
    footerLogoEl.src = logoSrc;
    footerLogoEl.className = logoFitClass;
  }

  const ambientImgEl = document.getElementById('ambient-photo-img');
  if (ambientImgEl) {
    const ambientSrc = (bm.heroBannerImage && String(bm.heroBannerImage).trim())
      ? resolveImageUrl(bm.heroBannerImage, 'hashtag-banner.jpg?v=2.7')
      : 'hashtag-banner.jpg?v=2.7';
    ambientImgEl.src = ambientSrc;
  }

  // Wi-Fi Bilgilerini Anında Güncelle
  if (wifiTitleEl) wifiTitleEl.textContent = `${cafeName} Misafir Wi-Fi`;
  if (wifiNameEl) wifiNameEl.textContent = settings.wifiName || 'HASHTAG';
  if (wifiPassEl) wifiPassEl.textContent = settings.wifiPassword || '';

  if (tableBadgeEl) {
    if (selectedTable) {
      tableBadgeEl.innerHTML = `
        <button type="button" onclick="openTablePickerModal()" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold tracking-wider uppercase hover:bg-amber-500/30 transition-all cursor-pointer" title="Masa numarasını değiştir">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>MASA ${selectedTable}</span>
          <span class="text-[9px] text-amber-400 font-normal underline ml-0.5">Değiştir</span>
        </button>
      `;
    } else {
      tableBadgeEl.innerHTML = `
        <button type="button" onclick="openTablePickerModal()" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold tracking-wider hover:bg-amber-500/20 transition-all cursor-pointer animate-pulse" title="Masa numaranızı seçin">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-400"></i>
          <span>Masa Seçin</span>
        </button>
      `;
    }
  }

  // Instagram Bağlantısı ve Şık Kartı
  const instaCardBtn = document.getElementById('instagram-card-btn');
  const instaHandleEl = document.getElementById('instagram-handle-display');
  const instaCardSec = document.getElementById('instagram-card-section');

  const cleanInstagram = normalizeInstagramHandle(settings.instagram);
  const fullInstaUrl = `https://www.instagram.com/${cleanInstagram}`;

  if (instaHandleEl) instaHandleEl.textContent = cleanInstagram;

  if (instaEl) {
    if (cleanInstagram) {
      instaEl.href = fullInstaUrl;
      instaEl.classList.remove('hidden');
    } else {
      instaEl.classList.add('hidden');
    }
  }

  if (instaCardBtn) {
    instaCardBtn.href = fullInstaUrl;
  }

  if (instaCardSec) {
    if (cleanInstagram) {
      instaCardSec.classList.remove('hidden');
    } else {
      instaCardSec.classList.add('hidden');
    }
  }

  // Google Haritalar Bağlantısı ve Şık Kartı
  const mapsCardBtn = document.getElementById('google-maps-card-btn');
  const defaultGoogleMapsUrl = 'https://www.google.com/maps/place/HashTag+Sh%C4%B1sha+TowN/@36.5441256,31.9875018,17z/data=!4m8!3m7!1s0x14dca29d1fbf1249:0x4b3340264cde0fb8!8m2!3d36.5441256!4d31.9900767!9m1!1b1!16s%2Fg%2F11c5swfnsx?entry=ttu&g_ep=EgoyMDI2MTAyMC4wIKXMDSoASAFQAw%3D%3D';
  const fullMapsUrl = (settings.googleMapsUrl && settings.googleMapsUrl.trim()) ? settings.googleMapsUrl.trim() : defaultGoogleMapsUrl;

  if (mapsCardBtn) {
    mapsCardBtn.href = fullMapsUrl;
  }

  // Gelecek özellik (Köz & Garson) kontrolü
  const serviceActionsEl = document.getElementById('service-call-actions');
  if (serviceActionsEl) {
    if (settings.enableServiceCalls) {
      serviceActionsEl.classList.remove('hidden');
    } else {
      serviceActionsEl.classList.add('hidden');
    }
  }

  if (window.lucide) lucide.createIcons();
}

function renderCategoryPills() {
  const container = document.getElementById('categories-container');
  if (!container) return;

  const activeCategories = Array.isArray(menuData?.categories) ? menuData.categories : [];
  const categories = [{ id: 'all', name: 'Tüm Menü', icon: 'sparkles' }, ...activeCategories];

  container.innerHTML = categories.map(cat => {
    const isActive = currentCategory === cat.id;
    const safeId = String(cat.id || '').replace(/'/g, "\\'");
    return `
      <button 
        onclick="selectCategory('${safeId}')"
        class="category-pill flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all ${
          isActive 
            ? 'bg-amber-500 text-black font-semibold shadow-lg shadow-amber-500/20 scale-105' 
            : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/5'
        }">
        <i data-lucide="${escapeHtml(cat.icon || 'utensils')}" class="w-4 h-4"></i>
        <span>${escapeHtml(cat.name)}</span>
      </button>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function selectCategory(catId) {
  currentCategory = catId;
  renderCategoryPills();
  renderMenuItems();

  // Scroll to menu list smoothly
  const listEl = document.getElementById('menu-items-list');
  if (listEl && typeof listEl.getBoundingClientRect === 'function') {
    const yOffset = -140;
    const y = listEl.getBoundingClientRect().top + (window.pageYOffset || 0) + yOffset;
    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
}

function setupSearchInput() {
  const searchInput = document.getElementById('menu-search');
  const clearBtn = document.getElementById('search-clear-btn');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    if (clearBtn) {
      if (searchQuery.length > 0) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    renderMenuItems();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearBtn.classList.add('hidden');
      renderMenuItems();
      searchInput.focus();
    });
  }
}

function renderMenuItems() {
  const container = document.getElementById('menu-items-list');
  if (!container) return;

  const allItems = Array.isArray(menuData?.items) ? menuData.items : [];
  const categories = Array.isArray(menuData?.categories) ? menuData.categories : [];
  const currency = (menuData?.settings && menuData.settings.currency) || '₺';

  // Eğer seçili kategori silinmişse, otomatik 'all' (Tüm Menü) moduna dön ve hapları güncelle
  if (currentCategory !== 'all') {
    const catExists = categories.some(c => c.id === currentCategory);
    if (!catExists) {
      currentCategory = 'all';
      renderCategoryPills();
    }
  }

  let items = allItems;

  // Kategori Filtresi
  if (currentCategory !== 'all') {
    items = items.filter(it => it.categoryId === currentCategory);
  }

  // Arama Filtresi (İsim, açıklama ve aroma etiketlerinde arama)
  if (searchQuery.length > 0) {
    items = items.filter(it => {
      const matchName = (it.name || '').toLowerCase().includes(searchQuery);
      const matchDesc = (it.description || '').toLowerCase().includes(searchQuery);
      const matchFlavors = (it.flavors || []).some(f => String(f).toLowerCase().includes(searchQuery));
      return matchName || matchDesc || matchFlavors;
    });

    if (items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 px-4">
          <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-gray-400">
            <i data-lucide="search-x" class="w-8 h-8"></i>
          </div>
          <h3 class="text-lg font-semibold text-gray-200">Sonuç Bulunamadı</h3>
          <p class="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Aradığınız kriterlere uygun ürün bulunamadı. Lütfen farklı bir arama yapmayı deneyin.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        ${items.map(item => renderItemCard(item, currency)).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Tekil bir kategori seçiliyse (ve arama yoksa)
  if (currentCategory !== 'all') {
    const selectedCat = categories.find(c => c.id === currentCategory);
    const catTitle = selectedCat ? escapeHtml(selectedCat.name) : 'Kategori';
    const catIcon = escapeHtml((selectedCat && selectedCat.icon) || 'star');

    if (items.length === 0) {
      container.innerHTML = `
        <div class="mb-8">
          <div class="flex items-center gap-3 mb-4 px-1">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <i data-lucide="${catIcon}" class="w-4 h-4"></i>
            </div>
            <h2 class="text-lg font-bold tracking-tight text-white">${catTitle}</h2>
            <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
          </div>
          <div class="p-8 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3 text-amber-400">
              <i data-lucide="${catIcon}" class="w-6 h-6"></i>
            </div>
            <h3 class="text-sm font-bold text-white">${catTitle}</h3>
            <p class="text-xs text-gray-400 mt-1 max-w-xs mx-auto">Bu kategorideki ürünlerimiz hazırlanıyor, çok yakında menüde yer alacaktır.</p>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="mb-8">
          <div class="flex items-center gap-3 mb-4 px-1">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <i data-lucide="${catIcon}" class="w-4 h-4"></i>
            </div>
            <h2 class="text-lg font-bold tracking-tight text-white">${catTitle}</h2>
            <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            ${items.map(item => renderItemCard(item, currency)).join('')}
          </div>
        </div>
      `;
    }
    if (window.lucide) lucide.createIcons();
    return;
  }

  // 'Tüm Menü' seçiliyse ve arama yapılmıyorsa:
  // Yönetici panelinde eklenen TÜM kategorileri (henüz 0 ürünü olan yeni kategoriler dahil) sırasıyla göster!
  if (categories.length === 0 && allItems.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 px-4">
        <div class="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-gray-400">
          <i data-lucide="utensils" class="w-8 h-8"></i>
        </div>
        <h3 class="text-lg font-semibold text-gray-200">Menü Hazırlanıyor</h3>
        <p class="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Menümüz güncelleniyor, lütfen birazdan tekrar kontrol edin.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const grouped = {};
  const validCatIds = new Set();
  categories.forEach(cat => {
    validCatIds.add(cat.id);
    grouped[cat.id] = allItems.filter(it => it.categoryId === cat.id);
  });

  let sectionsHtml = categories.map(cat => {
    const catItems = grouped[cat.id] || [];
    const safeCatName = escapeHtml(cat.name);
    const safeCatIcon = escapeHtml(cat.icon || 'star');

    if (catItems.length === 0) {
      return `
        <div class="mb-10">
          <div class="flex items-center gap-3 mb-4 px-1">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <i data-lucide="${safeCatIcon}" class="w-4 h-4"></i>
            </div>
            <h2 class="text-lg font-bold tracking-tight text-white">${safeCatName}</h2>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold">Yeni</span>
            <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
          </div>
          <div class="p-4 rounded-2xl bg-white/[0.025] border border-dashed border-white/10 flex items-center gap-3 text-gray-400">
            <div class="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-200">${safeCatName} kategorisi hazırlandı</p>
              <p class="text-[11px] text-gray-400 mt-0.5">Bu kategorideki ürünlerimiz çok yakında eklenecektir.</p>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="mb-10">
        <div class="flex items-center gap-3 mb-4 px-1">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <i data-lucide="${safeCatIcon}" class="w-4 h-4"></i>
          </div>
          <h2 class="text-lg font-bold tracking-tight text-white">${safeCatName}</h2>
          <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          ${catItems.map(item => renderItemCard(item, currency)).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Kategorisi silinmiş veya eşleşmeyen (sahipsiz) ürünler varsa hiçbir zaman gizlenmesin, en altta gösterilsin
  const orphanItems = allItems.filter(it => !validCatIds.has(it.categoryId));
  if (orphanItems.length > 0) {
    sectionsHtml += `
      <div class="mb-10">
        <div class="flex items-center gap-3 mb-4 px-1">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <i data-lucide="layers" class="w-4 h-4"></i>
          </div>
          <h2 class="text-lg font-bold tracking-tight text-white">Diğer Ürünler</h2>
          <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          ${orphanItems.map(item => renderItemCard(item, currency)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = sectionsHtml;
  if (window.lucide) lucide.createIcons();
}

function renderItemCard(item, currency) {
  const isOutOfStock = (item.inStock === false) || (item.isAvailable === false);
  const isHookah = item.categoryId && item.categoryId.includes('hookah');
  const fallbackThumb = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=300&q=80';
  const imgSrc = resolveImageUrl(item.image, fallbackThumb);
  const fitMode = item.imageFit || 'cover';
  const imgFitClasses = fitMode === 'contain'
    ? 'relative z-10 w-full h-full object-contain'
    : (fitMode === 'top' ? 'w-full h-full object-cover object-top' : 'w-full h-full object-cover object-center');

  return `
    <div onclick="openItemDetails('${item.id}')" 
         class="menu-card glass-panel rounded-2xl p-4 flex gap-4 cursor-pointer relative overflow-hidden transition-all duration-300 hover:border-amber-500/30 group ${
           isOutOfStock ? 'opacity-55 grayscale-[40%]' : ''
         }">
      
      <!-- Görsel Bölümü -->
      <div class="relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-xl overflow-hidden bg-neutral-900 border border-white/5">
        ${fitMode === 'contain' ? `
          <img src="${imgSrc}" alt="" aria-hidden="true" loading="lazy"
               class="absolute inset-0 w-full h-full object-cover scale-125 blur-md brightness-50 pointer-events-none"
               onerror="this.style.display='none'" />
        ` : ''}
        <img src="${imgSrc}" 
             alt="${escapeHtml(item.name)}" 
             loading="lazy"
             class="${imgFitClasses} transition-transform duration-500 group-hover:scale-105"
             onerror="this.src='${fallbackThumb}'" />
        
        ${isOutOfStock ? `
          <div class="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <span class="text-[10px] font-bold uppercase tracking-wider text-red-400 border border-red-500/40 px-2 py-0.5 rounded bg-red-950/60">Tükendi</span>
          </div>
        ` : ''}
      </div>

      <!-- Bilgi Bölümü -->
      <div class="flex-1 flex flex-col justify-between min-w-0">
        <div>
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-base font-semibold text-white tracking-tight group-hover:text-amber-400 transition-colors line-clamp-1">
              ${item.name}
            </h3>
            
            ${item.badge ? `
              <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                ${item.badge}
              </span>
            ` : ''}
          </div>

          <p class="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
            ${item.description || ''}
          </p>

          <!-- Nargile Aroma Notları -->
          ${item.flavors && item.flavors.length > 0 ? `
            <div class="flex flex-wrap gap-1 mt-2">
              ${item.flavors.slice(0, 3).map(f => `
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-300 border border-white/5 flex items-center gap-1">
                  <span class="w-1 h-1 rounded-full bg-amber-400"></span>${f}
                </span>
              `).join('')}
              ${item.flavors.length > 3 ? `<span class="text-[10px] text-gray-400">+${item.flavors.length - 3}</span>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Fiyat & Detay -->
        <div class="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
          <div class="lounge-price">
            <span class="amount">${item.price}</span>
            <span class="currency">${currency}</span>
          </div>
          <div class="flex items-center gap-2">
            ${!isOutOfStock ? `
              <button 
                type="button"
                onclick="event.stopPropagation(); addItemToBillEstimate('${item.id}')" 
                class="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 transition-all active:scale-90"
                title="Masa hesabına ekle"
              >
                <span>+</span>
                <span class="text-[10px]">Hesaba Ekle</span>
              </button>
            ` : ''}
            <span class="text-xs text-gray-400 flex items-center gap-1 group-hover:text-white transition-colors">
              İncele <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openItemDetails(itemId) {
  const item = (menuData.items || []).find(it => it.id === itemId);
  if (!item) return;

  const modal = document.getElementById('item-detail-modal');
  const modalContent = document.getElementById('item-detail-content');
  if (!modal || !modalContent) return;

  const currency = menuData.settings.currency || '₺';
  const fallbackLarge = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80';
  const detailImgSrc = resolveImageUrl(item.image, fallbackLarge);
  const fitMode = item.imageFit || 'cover';
  const detailFitClasses = fitMode === 'contain'
    ? 'relative z-10 w-full h-full object-contain'
    : (fitMode === 'top' ? 'w-full h-full object-cover object-top' : 'w-full h-full object-cover object-center');

  modalContent.innerHTML = `
    <div class="relative h-64 w-full bg-neutral-900 overflow-hidden">
      ${fitMode === 'contain' ? `
        <img src="${detailImgSrc}" alt="" aria-hidden="true"
             class="absolute inset-0 w-full h-full object-cover scale-125 blur-xl brightness-50 pointer-events-none"
             onerror="this.style.display='none'" />
      ` : ''}
      <img src="${detailImgSrc}" 
           alt="${escapeHtml(item.name)}" 
           class="${detailFitClasses}"
           onerror="this.src='${fallbackLarge}'" />
      <div class="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-neutral-950 via-neutral-950/35 to-transparent"></div>
      
      <button onclick="closeItemModal()" class="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/90 transition-all border border-white/10">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>

      ${item.badge ? `
        <span class="absolute bottom-4 left-6 z-20 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500 text-black">
          ${item.badge}
        </span>
      ` : ''}
    </div>

    <div class="p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-white tracking-tight">${item.name}</h2>
          ${(item.inStock === false || item.isAvailable === false) ? `
            <span class="inline-block mt-1 text-xs text-red-400 font-medium">Bu ürün şu anda tükendi</span>
          ` : ''}
        </div>
        <div class="text-right">
          <div class="lounge-price-lg">
            <span class="amount">${item.price}</span>
            <span class="currency">${currency}</span>
          </div>
        </div>
      </div>

      <div class="mt-4 pt-4 border-t border-white/10">
        <h4 class="text-xs uppercase font-bold tracking-wider text-gray-400 mb-2">Açıklama</h4>
        <p class="text-sm text-gray-300 leading-relaxed">${item.description || 'Detaylı bilgi bulunmuyor.'}</p>
      </div>

      ${item.flavors && item.flavors.length > 0 ? `
        <div class="mt-4 pt-4 border-t border-white/10">
          <h4 class="text-xs uppercase font-bold tracking-wider text-gray-400 mb-2">Aroma & İçerik Profili</h4>
          <div class="flex flex-wrap gap-2">
            ${item.flavors.map(f => `
              <span class="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-1.5">
                <i data-lucide="check" class="w-3.5 h-3.5 text-amber-400"></i> ${f}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="mt-6 pt-4 border-t border-white/10 grid ${(item.inStock === false || item.isAvailable === false) ? 'grid-cols-1' : 'grid-cols-2'} gap-3 font-sans">
        <button onclick="closeItemModal()" class="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition-colors">
          Kapat
        </button>
        ${!(item.inStock === false || item.isAvailable === false) ? `
          <button onclick="addItemToBillEstimate('${item.id}'); closeItemModal();" class="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all flex items-center justify-center gap-1.5 shadow-lg active:scale-95">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Hesaba Ekle</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  if (window.lucide) lucide.createIcons();
}

function closeItemModal() {
  const modal = document.getElementById('item-detail-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  }
}

// Wi-Fi Popup
function setupWifiModal() {
  const btn = document.getElementById('wifi-info-btn');
  const modal = document.getElementById('wifi-modal');
  if (!btn || !modal) return;

  btn.addEventListener('click', () => {
    const s = (menuData && menuData.settings) || {};
    const nameEl = document.getElementById('wifi-name-display');
    const passEl = document.getElementById('wifi-pass-display');
    if (nameEl) nameEl.textContent = s.wifiName || 'HASHTAG';
    if (passEl) passEl.textContent = s.wifiPassword || '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  });
}

function closeWifiModal() {
  const modal = document.getElementById('wifi-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function copyWifiPassword() {
  const pass = (menuData && menuData.settings && menuData.settings.wifiPassword) || '';
  const copyBtn = document.getElementById('copy-wifi-btn');

  const onCopied = () => {
    if (copyBtn) {
      const orig = copyBtn.innerHTML;
      copyBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-black"></i> Kopyalandı!`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pass).then(onCopied).catch(() => fallbackCopy(pass, onCopied));
  } else {
    fallbackCopy(pass, onCopied);
  }
}

function fallbackCopy(text, cb) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (cb) cb();
  } catch (e) {
    prompt('Wi-Fi Şifresi:', text);
  }
}

// Garson / Köz / Hesap İsteme (Personel Paneline Anlık Bildirim Gönderir)
let pendingCallType = null;
let lastCallTime = 0;
let cooldownInterval = null;

function setupServiceCallModal() {
  const urlTable = getTableFromUrl();
  if (urlTable) {
    selectedTable = String(urlTable);
    try { sessionStorage.setItem('hashtag_active_table', String(urlTable)); } catch (e) {}
  } else {
    try {
      localStorage.removeItem('hashtag_table');
      selectedTable = sessionStorage.getItem('hashtag_active_table') || null;
    } catch (e) {
      selectedTable = null;
    }
  }

  window.requestService = function(serviceType) {
    if (!selectedTable) {
      pendingCallType = serviceType;
      openTablePickerModal();
      return;
    }
    executeServiceCall(serviceType, selectedTable);
  };
}

async function executeServiceCall(serviceType, tableNum) {
  if (menuData && menuData.settings && menuData.settings.enableServiceCalls === false) {
    alert("⚠️ Çağrı servisi şu anda yönetici tarafından kapatılmıştır.");
    return;
  }

  const now = Date.now();
  if (now - lastCallTime < 7000) {
    const remaining = Math.ceil((7000 - (now - lastCallTime)) / 1000);
    alert(`⏳ Talebiniz zaten personele iletildi. Lütfen ${remaining} saniye bekleyiniz.`);
    return;
  }
  lastCallTime = now;

  let createdCall = null;
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: `Masa ${tableNum}`,
        type: serviceType
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.call) createdCall = data.call;
    } else if (res.status === 403) {
      alert("⚠️ Çağrı servisi şu anda kapalıdır.");
      return;
    }
  } catch (err) {
    console.warn("Call dispatch error:", err);
  }

  openCallSuccessModal(serviceType, tableNum, createdCall ? createdCall.id : null);
}

function openTablePickerModal() {
  const modal = document.getElementById('table-picker-modal');
  const grid = document.getElementById('table-picker-grid');
  const subtitleEl = modal ? modal.querySelector('p') : null;
  if (!modal || !grid) return;

  if (subtitleEl) {
    if (pendingCallType === 'bill') {
      subtitleEl.textContent = 'Hesap çağrınızın doğru masaya iletilebilmesi için lütfen oturduğunuz masayı seçiniz.';
    } else if (pendingCallType === 'coal') {
      subtitleEl.textContent = 'Köz talebinizin doğru masaya iletilebilmesi için lütfen oturduğunuz masayı seçiniz.';
    } else if (pendingCallType === 'waiter') {
      subtitleEl.textContent = 'Garson çağrınızın doğru masaya iletilebilmesi için lütfen oturduğunuz masayı seçiniz.';
    } else {
      subtitleEl.textContent = 'Çağrınızın doğru masaya iletilebilmesi için lütfen oturduğunuz masayı seçiniz.';
    }
  }

  const count = (menuData && menuData.settings && menuData.settings.tableCount) || 24;
  let html = '';
  for (let i = 1; i <= count; i++) {
    const isCurrent = String(selectedTable) === String(i);
    html += `
      <button type="button" onclick="selectTableFromPicker('${i}')" class="py-2.5 rounded-xl ${
        isCurrent ? 'bg-amber-500 text-black border-amber-400 font-black shadow-lg shadow-amber-500/20' : 'bg-black border-white/10 hover:border-amber-500 hover:text-amber-400 font-bold text-white'
      } border text-sm transition-all active:scale-95 flex items-center justify-center">
        ${i}
      </button>
    `;
  }
  grid.innerHTML = html;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeTablePickerModal() {
  const modal = document.getElementById('table-picker-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  pendingCallType = null;
}

function selectTableFromPicker(tableNum) {
  selectedTable = String(tableNum);
  try {
    sessionStorage.setItem('hashtag_active_table', String(tableNum));
    localStorage.removeItem('hashtag_table');
  } catch (e) {}

  closeTablePickerModal();
  renderHeaderInfo();

  if (pendingCallType) {
    const typeToCall = pendingCallType;
    pendingCallType = null;
    executeServiceCall(typeToCall, selectedTable);
  } else {
    showToast(`📍 Masa ${selectedTable} seçildi`, 'info');
  }
}

function requestBillFromCalculator() {
  closeBillEstimateModal();
  if (!selectedTable) {
    pendingCallType = 'bill';
    openTablePickerModal();
    return;
  }
  executeServiceCall('bill', selectedTable);
}

let activeCallStatusInterval = null;

function openCallSuccessModal(serviceType, tableNum, callId = null) {
  const modal = document.getElementById('call-success-modal');
  const titleEl = document.getElementById('call-success-title');
  const descEl = document.getElementById('call-success-desc');
  const iconWrap = document.getElementById('call-success-icon-wrap');
  const iconEl = document.getElementById('call-success-icon');
  const timerEl = document.getElementById('call-cooldown-timer');
  const pillText = document.getElementById('call-status-pill-text');
  const pillBox = document.getElementById('call-status-pill');

  if (!modal) return;

  if (pillText) pillText.textContent = 'Talebiniz Alındı';
  if (pillBox) pillBox.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300 mb-3';

  if (serviceType === 'coal') {
    if (titleEl) titleEl.textContent = 'Köz Talebiniz Alındı!';
    if (descEl) descEl.innerHTML = `Masa ${tableNum} için köz talebiniz personelimize iletildi. Personelimiz yola çıkmak üzere.`;
    if (iconWrap) iconWrap.className = 'w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 mx-auto flex items-center justify-center text-amber-400 mb-3 shadow-lg shadow-amber-500/10';
    if (iconEl) iconEl.setAttribute('data-lucide', 'flame');
  } else if (serviceType === 'bill') {
    if (titleEl) titleEl.textContent = 'Hesap Talebiniz Alındı!';
    if (descEl) descEl.innerHTML = `Masa ${tableNum} için hesap talebiniz kasaya iletildi. Personelimiz masanıza yönlendiriliyor.`;
    if (iconWrap) iconWrap.className = 'w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 mx-auto flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10';
    if (iconEl) iconEl.setAttribute('data-lucide', 'credit-card');
  } else {
    if (titleEl) titleEl.textContent = 'Garson Çağrınız Alındı!';
    if (descEl) descEl.innerHTML = `Masa ${tableNum} için garson çağrısı iletildi. Personelimiz birazdan masanızda olacaktır.`;
    if (iconWrap) iconWrap.className = 'w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 mx-auto flex items-center justify-center text-cyan-400 mb-3 shadow-lg shadow-cyan-500/10';
    if (iconEl) iconEl.setAttribute('data-lucide', 'bell');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 7 Saniyelik Hızlı Spam Sayacı
  let cooldown = 7;
  if (timerEl) timerEl.textContent = cooldown;
  if (cooldownInterval) clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    cooldown--;
    if (timerEl) timerEl.textContent = cooldown;
    if (cooldown <= 0) {
      clearInterval(cooldownInterval);
    }
  }, 1000);

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Personel "Yoldayım" veya "Tamamlandı" işaretlemesini anlık takip et
  if (callId) {
    startCustomerCallStatusPolling(callId, tableNum);
  }
}

function startCustomerCallStatusPolling(callId, tableNum) {
  if (activeCallStatusInterval) clearInterval(activeCallStatusInterval);

  let notifiedInProgress = false;

  activeCallStatusInterval = setInterval(async () => {
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/calls/status?callId=${encodeURIComponent(callId)}`, { cache: 'no-store' });
      if (!res.ok) return;

      const data = await res.json();
      const status = data.callStatus;
      const handler = data.handler || 'Personelimiz';

      // 1. Personel "Yoldayım" butonuna bastığı an:
      if (status === 'in_progress' && !notifiedInProgress) {
        notifiedInProgress = true;
        updateCustomerCallModalInProgress(handler);
      }

      // 2. Personel "Tamamlandı" butonuna bastığı an:
      if (status === 'completed') {
        clearInterval(activeCallStatusInterval);
        activeCallStatusInterval = null;
        updateCustomerCallModalCompleted();
      }
    } catch (e) {
      console.warn("Poll status err:", e);
    }
  }, 1800);
}

function updateCustomerCallModalInProgress(handlerName) {
  const modal = document.getElementById('call-success-modal');
  const titleEl = document.getElementById('call-success-title');
  const descEl = document.getElementById('call-success-desc');
  const iconWrap = document.getElementById('call-success-icon-wrap');
  const iconEl = document.getElementById('call-success-icon');
  const pillText = document.getElementById('call-status-pill-text');
  const pillBox = document.getElementById('call-status-pill');

  if (pillText) pillText.textContent = `🏃 ${handlerName} Yola Çıktı`;
  if (pillBox) pillBox.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-[11px] font-bold text-blue-300 mb-3 animate-pulse';

  if (titleEl) titleEl.textContent = 'Personelimiz Yola Çıktı!';
  if (descEl) {
    descEl.className = 'text-xs text-white mt-2 leading-relaxed p-3 rounded-2xl bg-blue-950/40 border border-blue-500/30';
    descEl.innerHTML = `
      <div class="text-amber-300 font-bold text-sm mb-1">Talebiniz Alındı!</div>
      İlgili personelimiz <b class="text-amber-400 font-bold">${handlerName}</b> yaklaşık <b class="text-emerald-400">3 dakika içerisinde</b> masanıza ulaşacaktır.
    `;
  }

  if (iconWrap) {
    iconWrap.className = 'w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-500/40 mx-auto flex items-center justify-center text-blue-300 mb-3 shadow-lg shadow-blue-500/20 animate-bounce';
  }
  if (iconEl) iconEl.setAttribute('data-lucide', 'footprints');

  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Telefonu hafifçe titret (Müşterinin dikkatini çekmek için)
  if ('vibrate' in navigator) {
    navigator.vibrate([150, 80, 150]);
  }

  // Eğer kullanıcı pencereyi kapatmışsa tekrar göster
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function updateCustomerCallModalCompleted() {
  const titleEl = document.getElementById('call-success-title');
  const descEl = document.getElementById('call-success-desc');
  const iconWrap = document.getElementById('call-success-icon-wrap');
  const iconEl = document.getElementById('call-success-icon');
  const pillText = document.getElementById('call-status-pill-text');
  const pillBox = document.getElementById('call-status-pill');

  if (pillText) pillText.textContent = '✅ Servis Tamamlandı';
  if (pillBox) pillBox.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 mb-3';

  if (titleEl) titleEl.textContent = 'Servisimizden Memnun Kaldınız mı?';
  if (iconWrap) {
    iconWrap.className = 'w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 mx-auto flex items-center justify-center text-amber-400 mb-2 shadow-lg shadow-amber-500/20';
  }
  if (iconEl) iconEl.setAttribute('data-lucide', 'star');

  currentRating = 5;
  currentFeedbackTags.clear();

  if (descEl) {
    descEl.className = 'text-xs text-gray-200 mt-2 leading-relaxed';
    descEl.innerHTML = `
      <div class="p-3 rounded-2xl bg-black/60 border border-white/10 mb-3">
        <p class="text-xs text-gray-300 mb-2 font-medium">Hizmet kalitemizi puanlayın:</p>
        <div class="flex items-center justify-center gap-2 mb-3" id="feedback-stars">
          ${[1, 2, 3, 4, 5].map(star => `
            <button type="button" onclick="setFeedbackRating(${star})" class="text-2xl transition-transform hover:scale-125 focus:outline-none" id="star-btn-${star}">
              ⭐
            </button>
          `).join('')}
        </div>
        
        <div class="flex flex-wrap items-center justify-center gap-1.5 mb-3">
          ${['🔥 Köz Kıvamında', '⚡ Hızlı Servis', '😊 Güler Yüz', '✨ Temiz', '⏳ Köz Gecikti', '🐢 Yavaş Servis', '🔊 Yüksek Müzik'].map(tag => `
            <button type="button" onclick="toggleFeedbackTag('${tag}', this)" class="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all">
              ${tag}
            </button>
          `).join('')}
        </div>

        <input type="text" id="feedback-comment" placeholder="Varsa eklemek istediğiniz not (isteğe bağlı)..." maxlength="150" class="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 mb-3" />

        <div class="flex items-center gap-2">
          <button type="button" onclick="submitCustomerFeedback()" class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md active:scale-95">
            Puanı Gönder
          </button>
          <button type="button" onclick="closeCallSuccessModal()" class="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-medium transition-all">
            Kapat
          </button>
        </div>
      </div>
    `;
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function setFeedbackRating(stars) {
  currentRating = stars;
  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(`star-btn-${i}`);
    if (btn) {
      btn.style.opacity = i <= stars ? '1' : '0.25';
      btn.style.filter = i <= stars ? 'none' : 'grayscale(100%)';
    }
  }
}

function toggleFeedbackTag(tag, btn) {
  if (currentFeedbackTags.has(tag)) {
    currentFeedbackTags.delete(tag);
    btn.classList.remove('bg-amber-500/20', 'text-amber-300', 'border-amber-500/40');
    btn.classList.add('bg-white/5', 'text-gray-400', 'border-white/10');
  } else {
    currentFeedbackTags.add(tag);
    btn.classList.remove('bg-white/5', 'text-gray-400', 'border-white/10');
    btn.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-500/40');
    if ((tag.includes('Gecikti') || tag.includes('Yavaş') || tag.includes('Yüksek')) && currentRating > 3) {
      setFeedbackRating(3);
    }
  }
}

async function submitCustomerFeedback() {
  const commentInput = document.getElementById('feedback-comment');
  const comment = commentInput ? commentInput.value.trim() : '';
  const table = selectedTable ? `Masa ${selectedTable}` : 'Bilinmeyen Masa';

  try {
    const apiBase = getApiBaseUrl();
    await fetch(apiBase + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: table,
        rating: currentRating,
        tags: Array.from(currentFeedbackTags),
        comment: comment,
        callId: ''
      })
    });
  } catch (e) {
    console.warn("Feedback err:", e);
  }

  showToast('❤️ Geri bildiriminiz için çok teşekkür ederiz!', 'success');
  setTimeout(() => {
    closeCallSuccessModal();
  }, 1000);
}

function closeCallSuccessModal() {
  const modal = document.getElementById('call-success-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

/* =========================================================================
   MÜŞTERİ BAĞIMSIZ GERİ BİLDİRİM & PUANLAMA MODALI
   ========================================================================= */

function openCustomerFeedbackModal() {
  const modal = document.getElementById('customer-feedback-modal');
  if (!modal) return;
  standaloneRating = 5;
  standaloneFeedbackTags.clear();
  setStandaloneFeedbackRating(5);
  
  const tagBtns = document.querySelectorAll('#standalone-feedback-tags button');
  tagBtns.forEach(b => {
    b.className = 'px-2.5 py-1 rounded-xl text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all';
  });
  
  const commentInput = document.getElementById('standalone-feedback-comment');
  if (commentInput) commentInput.value = '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (window.lucide) lucide.createIcons();
}

function closeCustomerFeedbackModal() {
  const modal = document.getElementById('customer-feedback-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function setStandaloneFeedbackRating(stars) {
  standaloneRating = stars;
  const labels = {
    5: 'Harika (5 / 5)',
    4: 'Çok İyi (4 / 5)',
    3: 'Orta (3 / 5)',
    2: 'Geliştirilmeli (2 / 5)',
    1: 'Kötü (1 / 5)'
  };
  const labelEl = document.getElementById('standalone-rating-label');
  if (labelEl) labelEl.textContent = labels[stars] || `${stars} / 5`;

  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(`s-star-${i}`);
    if (btn) {
      btn.style.opacity = i <= stars ? '1' : '0.25';
      btn.style.filter = i <= stars ? 'none' : 'grayscale(100%)';
    }
  }
}

function toggleStandaloneFeedbackTag(tag, btn) {
  if (standaloneFeedbackTags.has(tag)) {
    standaloneFeedbackTags.delete(tag);
    btn.classList.remove('bg-amber-500/20', 'text-amber-300', 'border-amber-500/40');
    btn.classList.add('bg-white/5', 'text-gray-400', 'border-white/10');
  } else {
    standaloneFeedbackTags.add(tag);
    btn.classList.remove('bg-white/5', 'text-gray-400', 'border-white/10');
    btn.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-500/40');
    if ((tag.includes('Gecikti') || tag.includes('Yavaş') || tag.includes('Yüksek')) && standaloneRating > 3) {
      setStandaloneFeedbackRating(3);
    }
  }
}

async function submitStandaloneFeedback() {
  const commentInput = document.getElementById('standalone-feedback-comment');
  const comment = commentInput ? commentInput.value.trim() : '';
  const table = selectedTable ? `Masa ${selectedTable}` : 'Masa Bilinmiyor';

  try {
    const apiBase = getApiBaseUrl();
    await fetch(apiBase + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: table,
        rating: standaloneRating,
        tags: Array.from(standaloneFeedbackTags),
        comment: comment,
        callId: ''
      })
    });
  } catch (e) {
    console.warn("Feedback submit err:", e);
  }

  showToast('❤️ Değerlendirmeniz için çok teşekkür ederiz!', 'success');
  closeCustomerFeedbackModal();
}

// =========================================================================
// MASA ADİSYON / HESAP HESAPLAYICI (ESTIMATED BILL CALCULATOR)
// =========================================================================

function addItemToBillEstimate(itemId) {
  if (!menuData || !menuData.items) return;
  const item = menuData.items.find(i => i.id === itemId);
  if (!item) return;

  if (!estimatedBillItems[itemId]) {
    estimatedBillItems[itemId] = { item, count: 0 };
  }
  estimatedBillItems[itemId].count += 1;
  updateBillEstimateUI();
  showToast(`+1 "${item.name}" hesaba eklendi`, 'info');
}

function changeBillItemQty(itemId, delta) {
  if (!estimatedBillItems[itemId]) return;
  estimatedBillItems[itemId].count += delta;
  if (estimatedBillItems[itemId].count <= 0) {
    delete estimatedBillItems[itemId];
  }
  updateBillEstimateUI();
  renderBillModalContent();
}

function clearBillEstimate() {
  estimatedBillItems = {};
  updateBillEstimateUI();
  closeBillEstimateModal();
}

function getBillEstimateTotals() {
  let totalCount = 0;
  let totalPrice = 0;
  Object.values(estimatedBillItems).forEach(({ item, count }) => {
    totalCount += count;
    const priceNum = parseFloat(item.price) || 0;
    totalPrice += priceNum * count;
  });
  return { totalCount, totalPrice };
}

function updateBillEstimateUI() {
  const { totalCount, totalPrice } = getBillEstimateTotals();
  const floatingBar = document.getElementById('estimated-bill-floating-bar');
  const countEl = document.getElementById('estimated-bill-total-count');
  const priceEl = document.getElementById('estimated-bill-total-price');

  if (!floatingBar) return;

  if (totalCount > 0) {
    floatingBar.classList.remove('hidden');
    floatingBar.classList.add('flex');
    if (countEl) countEl.textContent = `${totalCount} Ürün`;
    if (priceEl) priceEl.textContent = totalPrice.toLocaleString('tr-TR');
  } else {
    floatingBar.classList.add('hidden');
    floatingBar.classList.remove('flex');
  }
}

function openBillEstimateModal() {
  const modal = document.getElementById('estimated-bill-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  renderBillModalContent();
  if (window.lucide) lucide.createIcons();
}

function closeBillEstimateModal() {
  const modal = document.getElementById('estimated-bill-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function renderBillModalContent() {
  const listEl = document.getElementById('estimated-bill-items-list');
  const modalTotal = document.getElementById('estimated-bill-modal-total');
  const { totalCount, totalPrice } = getBillEstimateTotals();

  if (modalTotal) modalTotal.textContent = totalPrice.toLocaleString('tr-TR');
  if (!listEl) return;

  const items = Object.values(estimatedBillItems);
  if (items.length === 0) {
    listEl.innerHTML = `<div class="py-8 text-center text-xs text-gray-400 font-sans">Listenizde henüz ürün bulunmuyor.</div>`;
    return;
  }

  listEl.innerHTML = items.map(({ item, count }) => {
    const itemTotal = (parseFloat(item.price) || 0) * count;
    return `
    <div class="flex items-center justify-between p-3 rounded-2xl bg-black/40 border border-white/5 hover:border-amber-500/20 transition-all font-sans">
      <div class="min-w-0 flex-1 pr-3">
        <h4 class="text-sm font-semibold text-white tracking-tight truncate">${escapeHtml(item.name)}</h4>
        <div class="flex items-center gap-2 mt-1">
          <div class="lounge-price-sm">
            <span class="amount">${parseFloat(item.price) || 0}</span>
            <span class="currency">₺</span>
          </div>
          ${count > 1 ? `<span class="text-[11px] text-gray-400 font-medium">(${count} x ${item.price} ₺ = <span class="text-amber-400 font-bold">${itemTotal.toLocaleString('tr-TR')} ₺</span>)</span>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0 bg-white/5 px-2 py-1 rounded-xl border border-white/10">
        <button onclick="changeBillItemQty('${item.id}', -1)" class="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 active:scale-90 text-white flex items-center justify-center font-bold text-xs transition-all" aria-label="Eksilt">-</button>
        <span class="text-xs font-bold text-white w-6 text-center select-none">${count}</span>
        <button onclick="changeBillItemQty('${item.id}', 1)" class="w-6 h-6 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 active:scale-90 text-amber-300 flex items-center justify-center font-bold text-xs transition-all" aria-label="Artır">+</button>
      </div>
    </div>
  `}).join('');

  if (window.lucide) lucide.createIcons();
}

// Müşteri Menüsü İçin Akıllı Arka Plan Otomatik Güncelleme (3.5 sn)
if (typeof setInterval !== 'undefined') {
  setInterval(async () => {
    if (typeof document !== 'undefined' && document.getElementById('menu-app') && document.visibilityState === 'visible' && menuData) {
      const prevDataStr = JSON.stringify(menuData);
      await loadMenuData();
      const nextDataStr = JSON.stringify(menuData);
      if (prevDataStr !== nextDataStr) {
        renderHeaderInfo();
        renderCategoryPills();
        renderMenuItems();
      }
    }
  }, 3500);
}
