/**
 * HASHTAG QR Menü - Ana İstemci Mantığı
 */

// Varsayılan / Fallback Menü Verisi (Sunucu olmadan da çalışabilmesi için)
let menuData = null;
let currentCategory = 'all';
let searchQuery = '';
let selectedTable = null;

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
      instagram: "hashtag.lounge",
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

  if (instaEl) {
    if (settings.instagram && settings.instagram.trim()) {
      instaEl.href = `https://instagram.com/${settings.instagram.trim().replace('@', '')}`;
      instaEl.classList.remove('hidden');
    } else {
      instaEl.classList.add('hidden');
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
  const isOutOfStock = item.inStock === false;
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
          <span class="text-xs text-gray-400 flex items-center gap-1 group-hover:text-white transition-colors">
            İncele <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </span>
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
          ${item.inStock === false ? `
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

// Garson / Köz İsteme (Altyapı hazırlandı, admin panelinden istendiği an açılabilir)
function setupServiceCallModal() {
  window.requestService = function(serviceType) {
    const title = serviceType === 'coal' ? 'Köz Değişimi Talebi' : 'Garson Çağrısı';
    const desc = selectedTable 
      ? `Masa ${selectedTable} için ${title.toLowerCase()} personelimize iletildi. Birkaç dakika içinde ilgileneceğiz.`
      : `Talebiniz personele iletildi. Lütfen sipariş verirken masanızı belirtiniz.`;

    alert(`🛎️ ${title}\n\n${desc}`);
  };
}

// Müşteri Menüsü İçin Akıllı Arka Plan Otomatik Güncelleme (15 sn)
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
  }, 15000);
}
