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

// Sekmeler Arası Eşitleme Kanalı (BroadcastChannel)
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hashtag_menu_sync') : null;
if (syncChannel) {
  syncChannel.onmessage = async (ev) => {
    if (ev.data === 'sync') {
      await loadMenuData();
      if (document.getElementById('menu-app')) {
        renderHeaderInfo();
        renderCategoryPills();
        renderMenuItems();
      }
    }
  };
}

// Depolama Olayı Dinleyicisi (Farklı Sekmeler İçin)
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e) => {
    if (e.key === 'hashtag_menu_cache') {
      try {
        menuData = JSON.parse(e.newValue);
        if (document.getElementById('menu-app')) {
          renderHeaderInfo();
          renderCategoryPills();
          renderMenuItems();
        }
      } catch (err) {}
    }
  });
}

// Menü Verisini Yükleme (Önbellek atlatmalı canlı sunucu kontrolü)
async function loadMenuData() {
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/menu?_t=' + Date.now(), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' }
    });
    if (res.ok) {
      menuData = await res.json();
      safeSetStorage('hashtag_menu_cache', JSON.stringify(menuData));
      return menuData;
    }
  } catch (err) {
    console.warn("Canlı sunucudan çekilemedi, önbelleğe bakılıyor:", err);
  }

  // Önbellek kontrolü
  const cached = safeGetStorage('hashtag_menu_cache');
  if (cached) {
    try {
      menuData = JSON.parse(cached);
      return menuData;
    } catch (e) {
      console.error(e);
    }
  }

  // Varsayılan zengin veri
  if (window.DEFAULT_MENU_DATA) {
    menuData = JSON.parse(JSON.stringify(window.DEFAULT_MENU_DATA));
    return menuData;
  }

  // Acil durum boş veri
  menuData = {
    settings: {
      cafeName: "HASHTAG",
      cafeTagline: "Lounge & Hookah Experience",
      currency: "₺",
      adminPin: "1234",
      wifiName: "HASHTAG_VIP",
      wifiPassword: "hashtagwelcome",
      instagram: "hashtagcafe07",
      enableServiceCalls: false,
      baseUrl: window.location.origin
    },
    categories: [],
    items: []
  };
  return menuData;
}

// Menüyü Kaydetme (Sunucuya POST, LocalStorage'a da yaz)
async function saveMenuData(updatedData) {
  menuData = updatedData;
  safeSetStorage('hashtag_menu_cache', JSON.stringify(menuData));

  if (syncChannel) {
    try { syncChannel.postMessage('sync'); } catch (e) {}
  }

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
      // Arka planda sunucudan tekrar çekip doğrula
      try {
        const verifyRes = await fetch(apiBase + '/api/menu?_t=' + Date.now(), { cache: 'no-store' });
        if (verifyRes.ok) {
          menuData = await verifyRes.json();
          safeSetStorage('hashtag_menu_cache', JSON.stringify(menuData));
        }
      } catch (e) {}
      return true;
    } else {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.message || `Sunucu hatası (${res.status})`;
      showToast('⚠️ Kaydedilemedi: ' + msg, 'error');
      alert('⚠️ Kaydedilemedi!\nSunucu yanıtı: ' + msg);
      return false;
    }
  } catch (err) {
    console.error("Sunucuya yazılamadı:", err);
    showToast('⚠️ İnternet bağlantı hatası, sunucuya ulaşılamadı.', 'error');
    alert('⚠️ Sunucuya ulaşılamadı!\nLütfen internet bağlantınızı kontrol edin.\nDetay: ' + err.message);
    return false;
  }
}

window.refreshCustomerMenu = async function(btn) {
  if (btn) btn.classList.add('animate-spin');
  await loadMenuData();
  renderHeaderInfo();
  renderCategoryPills();
  renderMenuItems();
  showToast('✅ Menü güncellendi!');
  if (btn) {
    setTimeout(() => btn.classList.remove('animate-spin'), 600);
  }
};

// Sekme veya telefon ekranı tekrar açıldığında menüyü otomatik yenile
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadMenuData().then(() => {
      if (document.getElementById('menu-app')) {
        renderHeaderInfo();
        renderCategoryPills();
        renderMenuItems();
      }
    });
  }
});

// DOM Hazır Olduğunda Menüyü Başlat
document.addEventListener('DOMContentLoaded', async () => {
  selectedTable = getTableFromUrl();
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

function renderHeaderInfo() {
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

  // Wi-Fi Bilgilerini Anında Güncelle
  if (wifiTitleEl) wifiTitleEl.textContent = `${cafeName} Misafir Wi-Fi`;
  if (wifiNameEl) wifiNameEl.textContent = settings.wifiName || 'HASHTAG';
  if (wifiPassEl) wifiPassEl.textContent = settings.wifiPassword || '';

  if (tableBadgeEl) {
    if (selectedTable) {
      tableBadgeEl.innerHTML = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold tracking-wider uppercase">
        <i data-lucide="map-pin" class="w-3.5 h-3.5"></i> MASA ${selectedTable}
      </span>`;
    } else {
      tableBadgeEl.innerHTML = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10 text-xs font-medium">
        Hoş Geldiniz
      </span>`;
    }
  }

  // Instagram Bağlantısı ve Şık Kartı
  const instaCardBtn = document.getElementById('instagram-card-btn');
  const instaHandleEl = document.getElementById('instagram-handle-display');
  const instaCardSec = document.getElementById('instagram-card-section');

  const rawInstagram = (settings.instagram || 'hashtagcafe07').trim();
  const cleanInstagram = rawInstagram
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .split(/[/?#]/)[0]
    .replace('@', '')
    .trim();

  const fullInstaUrl = cleanInstagram 
    ? `https://www.instagram.com/${cleanInstagram}` 
    : 'https://www.instagram.com/hashtagcafe07';

  if (instaHandleEl) instaHandleEl.textContent = cleanInstagram || 'hashtagcafe07';

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

  const categories = [{ id: 'all', name: 'Tüm Menü', icon: 'sparkles' }, ...menuData.categories];

  container.innerHTML = categories.map(cat => {
    const isActive = currentCategory === cat.id;
    return `
      <button 
        onclick="selectCategory('${cat.id}')"
        class="category-pill flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all ${
          isActive 
            ? 'bg-amber-500 text-black font-semibold shadow-lg shadow-amber-500/20 scale-105' 
            : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/5'
        }">
        <i data-lucide="${cat.icon || 'utensils'}" class="w-4 h-4"></i>
        <span>${cat.name}</span>
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
  if (listEl) {
    const yOffset = -140;
    const y = listEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
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

  let items = menuData.items || [];

  // Kategori Filtresi
  if (currentCategory !== 'all') {
    items = items.filter(it => it.categoryId === currentCategory);
  }

  // Arama Filtresi (İsim, açıklama ve aroma etiketlerinde arama)
  if (searchQuery.length > 0) {
    items = items.filter(it => {
      const matchName = it.name.toLowerCase().includes(searchQuery);
      const matchDesc = (it.description || '').toLowerCase().includes(searchQuery);
      const matchFlavors = (it.flavors || []).some(f => f.toLowerCase().includes(searchQuery));
      return matchName || matchDesc || matchFlavors;
    });
  }

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

  const currency = menuData.settings.currency || '₺';

  // Kategoriye göre gruplama (eğer 'Tüm Menü' seçiliyse ve arama yapılmıyorsa)
  if (currentCategory === 'all' && searchQuery.length === 0) {
    const grouped = {};
    menuData.categories.forEach(cat => {
      grouped[cat.id] = items.filter(it => it.categoryId === cat.id);
    });

    container.innerHTML = menuData.categories.map(cat => {
      const catItems = grouped[cat.id] || [];
      if (catItems.length === 0) return '';

      return `
        <div class="mb-10">
          <div class="flex items-center gap-3 mb-4 px-1">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <i data-lucide="${cat.icon || 'star'}" class="w-4 h-4"></i>
            </div>
            <h2 class="text-lg font-bold tracking-tight text-white">${cat.name}</h2>
            <div class="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent"></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            ${catItems.map(item => renderItemCard(item, currency)).join('')}
          </div>
        </div>
      `;
    }).join('');
  } else {
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        ${items.map(item => renderItemCard(item, currency)).join('')}
      </div>
    `;
  }

  if (window.lucide) lucide.createIcons();
}

function renderItemCard(item, currency) {
  const isOutOfStock = (item.inStock === false) || (item.isAvailable === false);
  const isHookah = item.categoryId && item.categoryId.includes('hookah');

  return `
    <div onclick="openItemDetails('${item.id}')" 
         class="menu-card glass-panel rounded-2xl p-4 flex gap-4 cursor-pointer relative overflow-hidden transition-all duration-300 hover:border-amber-500/30 group ${
           isOutOfStock ? 'opacity-55 grayscale-[40%]' : ''
         }">
      
      <!-- Görsel Bölümü -->
      <div class="relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-xl overflow-hidden bg-neutral-900 border border-white/5">
        <img src="${item.image || 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=300&q=80'}" 
             alt="${item.name}" 
             loading="lazy"
             class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
             onerror="this.src='https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=300&q=80'" />
        
        ${isOutOfStock ? `
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
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

  modalContent.innerHTML = `
    <div class="relative h-64 w-full bg-neutral-900">
      <img src="${item.image || 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80'}" 
           alt="${item.name}" 
           class="w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent"></div>
      
      <button onclick="closeItemModal()" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/90 transition-all border border-white/10">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>

      ${item.badge ? `
        <span class="absolute bottom-4 left-6 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500 text-black">
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

      <div class="mt-6 pt-4 border-t border-white/10 flex justify-end">
        <button onclick="closeItemModal()" class="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition-colors">
          Kapat
        </button>
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
  if (!selectedTable) {
    selectedTable = localStorage.getItem('hashtag_table') || null;
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
  if (!modal || !grid) return;

  const count = (menuData && menuData.settings && menuData.settings.tableCount) || 24;
  let html = '';
  for (let i = 1; i <= count; i++) {
    html += `
      <button onclick="selectTableFromPicker('${i}')" class="py-2.5 rounded-xl bg-black border border-white/10 hover:border-amber-500 hover:text-amber-400 font-bold text-sm text-white transition-all active:scale-95">
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
}

function selectTableFromPicker(tableNum) {
  selectedTable = tableNum;
  localStorage.setItem('hashtag_table', tableNum);
  closeTablePickerModal();
  renderHeaderInfo();
  
  if (pendingCallType) {
    executeServiceCall(pendingCallType, tableNum);
    pendingCallType = null;
  }
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
          ${['🔥 Köz Kıvamında', '⚡ Hızlı Servis', '😊 Güler Yüz', '✨ Temiz'].map(tag => `
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
    if (priceEl) priceEl.textContent = `${totalPrice.toLocaleString('tr-TR')} ₺`;
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

  if (modalTotal) modalTotal.textContent = `${totalPrice.toLocaleString('tr-TR')} ₺`;
  if (!listEl) return;

  const items = Object.values(estimatedBillItems);
  if (items.length === 0) {
    listEl.innerHTML = `<div class="py-8 text-center text-xs text-gray-500">Listenizde henüz ürün yok.</div>`;
    return;
  }

  listEl.innerHTML = items.map(({ item, count }) => `
    <div class="flex items-center justify-between p-3 rounded-2xl bg-black/60 border border-white/5">
      <div class="min-w-0 flex-1 pr-2">
        <h4 class="text-xs font-bold text-white truncate">${escapeHtml(item.name)}</h4>
        <div class="text-[11px] text-amber-400 font-mono mt-0.5">${item.price} ₺</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button onclick="changeBillItemQty('${item.id}', -1)" class="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center font-bold text-xs">-</button>
        <span class="text-xs font-bold text-white w-5 text-center">${count}</span>
        <button onclick="changeBillItemQty('${item.id}', 1)" class="w-6 h-6 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center justify-center font-bold text-xs">+</button>
      </div>
    </div>
  `).join('');
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
