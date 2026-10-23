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

// Menü Verisini Yükleme (Önce Sunucudan, Olmazsa LocalStorage / Fallback)
async function loadMenuData() {
  try {
    const res = await fetch('/api/menu');
    if (res.ok) {
      menuData = await res.json();
      localStorage.setItem('hashtag_menu_cache', JSON.stringify(menuData));
      return menuData;
    }
  } catch (err) {
    console.warn("Sunucudan çekilemedi, önbelleğe bakılıyor:", err);
  }

  // Önbellek kontrolü
  const cached = localStorage.getItem('hashtag_menu_cache');
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
  localStorage.setItem('hashtag_menu_cache', JSON.stringify(menuData));

  // Giriş yapılmış PIN'i header ile gönder (Güvenlik)
  const pin = sessionStorage.getItem('hashtag_admin_pin') || (menuData.settings && menuData.settings.adminPin) || '1234';

  try {
    const res = await fetch('/api/menu/update', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Admin-PIN': pin
      },
      body: JSON.stringify(updatedData)
    });
    if (res.ok) return true;
  } catch (err) {
    console.warn("Sunucuya yazılamadı, localStorage'a kaydedildi:", err);
  }
  return true;
}

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
  const tableBadgeEl = document.getElementById('table-badge');
  const instaEl = document.getElementById('instagram-link');

  if (nameEl) nameEl.textContent = settings.cafeName || 'HASHTAG';
  if (taglineEl) taglineEl.textContent = settings.cafeTagline || 'Lounge & Hookah';

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

  if (instaEl && settings.instagram) {
    instaEl.href = `https://instagram.com/${settings.instagram.replace('@', '')}`;
    instaEl.classList.remove('hidden');
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
          <span class="text-base font-extrabold text-amber-400 font-mono tracking-tight">
            ${item.price} <span class="text-xs font-semibold text-amber-300/80">${currency}</span>
          </span>
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
          <div class="text-2xl font-black text-amber-400 font-mono">
            ${item.price} <span class="text-sm font-semibold">${currency}</span>
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
    const { settings } = menuData;
    document.getElementById('wifi-name-display').textContent = settings.wifiName || 'HASHTAG_GUEST';
    document.getElementById('wifi-pass-display').textContent = settings.wifiPassword || '12345678';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
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
  const pass = menuData.settings.wifiPassword || '';
  navigator.clipboard.writeText(pass).then(() => {
    const copyBtn = document.getElementById('copy-wifi-btn');
    if (copyBtn) {
      const orig = copyBtn.innerHTML;
      copyBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-green-400"></i> Kopyalandı!`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }, 2000);
    }
  });
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
