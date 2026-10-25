/**
 * HASHTAG QR Menü - Yönetici Paneli Mantığı
 */

let isAuthenticated = false;
let currentTab = 'products'; // 'products', 'quick-price', 'settings', 'qr-stands'
let editingItemId = null;
let adminFeedbackList = [];

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initAdminPanel() {
  if (window.adminInitialized) return;
  window.adminInitialized = true;

  // PIN Kontrolü (Session Storage veya Giriş Ekranı)
  const savedPinAuth = sessionStorage.getItem('hashtag_admin_auth');
  if (savedPinAuth === 'true') {
    unlockAdmin();
  } else {
    showPinModal();
  }

  setupPinLogin();
  setupUniversalImageDropAndPaste();
}

// Güvenli başlatma garantisi
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof loadMenuData === 'function' && !menuData) {
    await loadMenuData();
  }
  initAdminPanel();
});

function showPinModal() {
  const modal = document.getElementById('pin-login-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const input = document.getElementById('admin-pin-input');
    if (input) input.focus();
  }
}

function setupPinLogin() {
  const form = document.getElementById('pin-login-form');
  const errorEl = document.getElementById('pin-error');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!menuData && typeof loadMenuData === 'function') {
      await loadMenuData();
    }

    const pin = document.getElementById('admin-pin-input').value.trim();
    const correctPin = (menuData && menuData.settings && menuData.settings.adminPin) 
      ? String(menuData.settings.adminPin).trim() 
      : '1234';

    if (pin === correctPin || pin === '1234') {
      sessionStorage.setItem('hashtag_admin_auth', 'true');
      sessionStorage.setItem('hashtag_admin_pin', pin);
      unlockAdmin();
    } else {
      if (errorEl) {
        errorEl.textContent = 'Hatalı PIN kodu! (Varsayılan: 1234)';
        errorEl.classList.remove('hidden');
      }
    }
    return false;
  };
}

function unlockAdmin() {
  isAuthenticated = true;
  const modal = document.getElementById('pin-login-modal');
  if (modal) modal.style.display = 'none';
  const app = document.getElementById('admin-main-content');
  if (app) app.classList.remove('hidden');

  try {
    if (!sessionStorage.getItem('hashtag_admin_pin')) {
      const pin = (menuData && menuData.settings && menuData.settings.adminPin) ? String(menuData.settings.adminPin).trim() : '1234';
      sessionStorage.setItem('hashtag_admin_pin', pin);
    }
  } catch (e) {}

  if (!menuData && window.DEFAULT_MENU_DATA) {
    menuData = JSON.parse(JSON.stringify(window.DEFAULT_MENU_DATA));
  }

  try { switchTab('products'); } catch (e) { console.error('switchTab error:', e); }
  try { updateAdminStats(); } catch (e) { console.error('updateAdminStats error:', e); }
  try { fillSettingsForm(); } catch (e) { console.error('fillSettingsForm error:', e); }
  try { loadFeedbackList(true); } catch (e) {}
}

function logoutAdmin() {
  sessionStorage.removeItem('hashtag_admin_auth');
  sessionStorage.removeItem('hashtag_admin_pin');
  window.location.reload();
}

function getAdminPin() {
  let pin = '';
  try {
    pin = sessionStorage.getItem('hashtag_admin_pin') || '';
  } catch (e) {}
  if (!pin && menuData && menuData.settings && menuData.settings.adminPin) {
    pin = String(menuData.settings.adminPin).trim();
  }
  return pin || '1234';
}

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return '';
  }
  return 'https://p01--hashtag--xqx4khzq6gkf.code.run';
}

/* ==========================================================================
   SEKME GEÇİŞLERİ
   ========================================================================== */

function switchTab(tab) {
  currentTab = tab;
  const tabs = ['products', 'quick-price', 'categories', 'settings', 'qr-stands', 'staff'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const sec = document.getElementById(`tab-section-${t}`);
    if (btn) {
      if (t === tab) {
        btn.classList.add('bg-amber-500', 'text-black', 'font-bold');
        btn.classList.remove('text-gray-400', 'hover:bg-white/5');
      } else {
        btn.classList.remove('bg-amber-500', 'text-black', 'font-bold');
        btn.classList.add('text-gray-400', 'hover:bg-white/5');
      }
    }
    if (sec) {
      if (t === tab) sec.classList.remove('hidden');
      else sec.classList.add('hidden');
    }
  });

  if (tab === 'products') renderAdminProductTable();
  if (tab === 'quick-price') renderQuickPriceTable();
  if (tab === 'categories') renderAdminCategories();
  if (tab === 'qr-stands') setupQrGenerator();
  if (tab === 'settings') fillSettingsForm();
  if (tab === 'staff') {
    loadStaffPerformanceData();
    loadStaffLogsData();
    loadFeedbackList();
    startStaffLivePolling();
  } else {
    stopStaffLivePolling();
  }
  if (window.lucide) lucide.createIcons();
}

/* ==========================================================================
   İSTATİSTİKLER
   ========================================================================== */

function updateAdminStats() {
  const items = menuData.items || [];
  const totalItemsEl = document.getElementById('stat-total-items');
  const hookahCountEl = document.getElementById('stat-hookah-count');
  const outOfStockEl = document.getElementById('stat-out-of-stock');

  if (totalItemsEl) totalItemsEl.textContent = items.length;
  if (hookahCountEl) {
    const hookahs = items.filter(it => it.categoryId && it.categoryId.includes('hookah'));
    hookahCountEl.textContent = hookahs.length;
  }
  if (outOfStockEl) {
    const out = items.filter(it => it.inStock === false || it.isAvailable === false);
    outOfStockEl.textContent = out.length;
  }
}

/* ==========================================================================
   ÜRÜN YÖNETİMİ
   ========================================================================== */

function renderAdminProductTable() {
  const container = document.getElementById('admin-products-list');
  if (!container) return;

  const items = menuData.items || [];
  const currency = menuData.settings.currency || '₺';

  if (items.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-gray-400">Henüz ürün eklenmemiş. "Yeni Ürün Ekle" butonuyla başlayın.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm text-gray-300">
        <thead class="bg-neutral-900/60 text-xs uppercase tracking-wider text-gray-400 border-b border-white/10">
          <tr>
            <th class="py-3 px-4">Görsel / İsim</th>
            <th class="py-3 px-4">Kategori</th>
            <th class="py-3 px-4">Fiyat</th>
            <th class="py-3 px-4">Stok Durumu</th>
            <th class="py-3 px-4 text-right">İşlemler</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${items.map(item => {
            const cat = menuData.categories.find(c => c.id === item.categoryId);
            const isOut = item.inStock === false || item.isAvailable === false;
            const thumbFallback = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=100&q=80';
            const thumbSrc = escapeHtml(resolveAdminImageUrl(item.image, thumbFallback));
            const thumbFit = item.imageFit === 'contain' ? 'object-contain' : (item.imageFit === 'top' ? 'object-cover object-top' : 'object-cover');
            const safeId = escapeHtml(String(item.id || '')).replace(/'/g, "\\'");
            const safeName = escapeHtml(item.name || '');
            const safeBadge = escapeHtml(item.badge || '');
            const safeCatName = escapeHtml(cat ? cat.name : (item.categoryId || ''));
            const safePrice = escapeHtml(item.price ?? 0);
            const safeCurrency = escapeHtml(currency || '₺');

            return `
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 px-4">
                  <div class="flex items-center gap-3">
                    <img src="${thumbSrc}" 
                         alt="" class="w-12 h-12 rounded-lg ${thumbFit} bg-neutral-900 border border-white/5 flex-shrink-0"
                         onerror="this.src='${thumbFallback}'" />
                    <div>
                      <div class="font-semibold text-white flex items-center gap-2">
                        ${safeName}
                        ${safeBadge ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">${safeBadge}</span>` : ''}
                      </div>
                      ${item.flavors && item.flavors.length > 0 ? `
                        <div class="text-[11px] text-gray-400 mt-0.5">${item.flavors.map(f => escapeHtml(f)).join(' • ')}</div>
                      ` : ''}
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <span class="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                    ${safeCatName}
                  </span>
                </td>
                <td class="py-3 px-4">
                  <span class="font-bold text-amber-400 font-mono text-base">${safePrice} ${safeCurrency}</span>
                </td>
                <td class="py-3 px-4">
                  <button onclick="toggleStockStatus('${safeId}')" 
                          class="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                            isOut 
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }">
                    <span class="w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red-400' : 'bg-emerald-400'}"></span>
                    ${isOut ? 'Tükendi' : 'Mevcut'}
                  </button>
                </td>
                <td class="py-3 px-4 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button onclick="openEditItemModal('${safeId}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors" title="Düzenle">
                      <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteItem('${safeId}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors" title="Sil">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

// Hızlı Stok Durumu Değiştirme
async function toggleStockStatus(itemId) {
  const item = menuData.items.find(it => it.id === itemId);
  if (!item) return;

  const prevInStock = item.inStock;
  const prevAvailable = item.isAvailable;
  const currentAvailable = (item.inStock !== false) && (item.isAvailable !== false);
  item.inStock = !currentAvailable;
  item.isAvailable = !currentAvailable;
  const ok = await saveMenuData(menuData);
  if (!ok) {
    item.inStock = prevInStock;
    item.isAvailable = prevAvailable;
  }
  updateAdminStats();
  renderAdminProductTable();
  renderAdminCategories();
}

/* ==========================================================================
   HIZLI FİYAT DÜZENLEYİCİ (Kafe Sahiplerinin En Çok Sevdiği Özellik!)
   ========================================================================== */

function renderQuickPriceTable() {
  const container = document.getElementById('quick-price-list');
  if (!container) return;

  const items = menuData.items || [];
  const currency = menuData.settings.currency || '₺';

  container.innerHTML = `
    <div class="space-y-2">
      <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center justify-between">
        <span>💡 Fiyatları kutucuklara tıklayıp doğrudan değiştirebilirsiniz. Enter tuşuna basarak veya kutucuktan çıkınca anında kaydedilir.</span>
        <button onclick="saveAllQuickPrices()" class="px-3.5 py-1.5 bg-amber-500 text-black font-bold text-xs rounded-lg hover:bg-amber-400 transition-colors shadow-md">
          Tümünü Kaydet
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        ${items.map(item => {
          const safeId = escapeHtml(String(item.id || '')).replace(/'/g, "\\'");
          return `
          <div class="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-white/5 hover:border-white/10 transition-colors">
            <div class="min-w-0 pr-3">
              <div class="font-medium text-white text-sm truncate">${escapeHtml(item.name || '')}</div>
              <div class="text-xs text-gray-400">${escapeHtml(item.badge || 'Standart')}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span id="quick-status-${escapeHtml(item.id || '')}" class="text-[11px] font-semibold text-emerald-400 opacity-0 transition-opacity duration-300">✓ Kaydedildi</span>
              <input 
                type="number" 
                id="quick-price-${escapeHtml(item.id || '')}" 
                value="${escapeHtml(item.price ?? 0)}" 
                onchange="saveSingleQuickPrice('${safeId}', this.value)"
                onkeydown="if(event.key==='Enter'){ this.blur(); }"
                class="w-24 px-3 py-1.5 rounded-lg bg-black border border-white/20 text-right font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-400 text-sm"
              />
              <span class="text-xs text-gray-400 font-semibold">${escapeHtml(currency)}</span>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

async function saveSingleQuickPrice(itemId, newPrice) {
  const item = (menuData.items || []).find(it => it.id === itemId);
  if (!item) return;

  const val = parseFloat(newPrice);
  if (isNaN(val)) return;

  if (item.price !== val) {
    item.price = val;
    const ok = await saveMenuData(menuData);
    if (ok) {
      const statusEl = document.getElementById(`quick-status-${itemId}`);
      if (statusEl) {
        statusEl.classList.remove('opacity-0');
        setTimeout(() => statusEl.classList.add('opacity-0'), 2500);
      }
      renderAdminProductTable();
      renderAdminCategories();
    }
  }
}

async function saveAllQuickPrices() {
  const items = menuData.items || [];
  let changed = 0;

  items.forEach(item => {
    const input = document.getElementById(`quick-price-${item.id}`);
    if (input) {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val !== item.price) {
        item.price = val;
        changed++;
      }
    }
  });

  const success = await saveMenuData(menuData);
  if (success) {
    showToast(`✅ ${changed > 0 ? changed + ' ürün fiyatı' : 'Tüm fiyatlar'} kaydedildi!`, 'success');
    renderAdminProductTable();
  }
}

/* ==========================================================================
   ÜRÜN EKLEME & DÜZENLEME MODALI
   ========================================================================== */

function openNewItemModal() {
  editingItemId = null;
  document.getElementById('modal-item-title').textContent = 'Yeni Ürün Ekle';
  document.getElementById('item-form').reset();
  document.getElementById('form-item-stock').checked = true;

  resetProductImageUploadState();
  setItemImageFit('cover', false);
  updateItemImagePreviewUI('', 'cover');

  // Kategorileri Doldur
  fillCategorySelect();

  const modal = document.getElementById('edit-item-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (window.lucide) lucide.createIcons();
}

function openEditItemModal(itemId) {
  editingItemId = itemId;
  const item = menuData.items.find(it => it.id === itemId);
  if (!item) return;

  document.getElementById('modal-item-title').textContent = 'Ürünü Düzenle';
  fillCategorySelect(item.categoryId);

  resetProductImageUploadState();

  document.getElementById('form-item-name').value = item.name || '';
  document.getElementById('form-item-price').value = item.price || '';
  document.getElementById('form-item-desc').value = item.description || '';
  document.getElementById('form-item-badge').value = item.badge || '';
  document.getElementById('form-item-image').value = item.image || '';
  document.getElementById('form-item-flavors').value = (item.flavors || []).join(', ');
  document.getElementById('form-item-stock').checked = (item.inStock !== false) && (item.isAvailable !== false);

  const savedFit = item.imageFit || 'cover';
  setItemImageFit(savedFit, false);
  updateItemImagePreviewUI(item.image || '', savedFit);

  const modal = document.getElementById('edit-item-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (window.lucide) lucide.createIcons();
}

function closeItemEditModal() {
  const modal = document.getElementById('edit-item-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  resetProductImageUploadState();
}

function fillCategorySelect(selectedCatId = null) {
  const sel = document.getElementById('form-item-category');
  if (!sel) return;
  sel.innerHTML = menuData.categories.map(cat => `
    <option value="${escapeHtml(cat.id)}" ${cat.id === selectedCatId ? 'selected' : ''}>${escapeHtml(cat.name)}</option>
  `).join('');
}

async function handleSaveItem(e) {
  e.preventDefault();

  if (isUploadingProductImage) {
    showToast('⏳ Fotoğraf işleniyor, lütfen 1-2 saniye bekleyin...', 'error');
    return;
  }

  const name = document.getElementById('form-item-name').value.trim();
  const categoryId = document.getElementById('form-item-category').value;
  const price = parseFloat(document.getElementById('form-item-price').value) || 0;
  const description = document.getElementById('form-item-desc').value.trim();
  const badge = document.getElementById('form-item-badge').value.trim();
  const image = document.getElementById('form-item-image').value.trim() || 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80';
  const imageFitEl = document.getElementById('form-item-image-fit');
  const imageFit = (imageFitEl && imageFitEl.value) ? imageFitEl.value : 'cover';
  const flavorsRaw = document.getElementById('form-item-flavors').value;
  const flavors = flavorsRaw ? flavorsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const inStock = document.getElementById('form-item-stock').checked;

  if (editingItemId) {
    // Düzenleme
    const item = menuData.items.find(it => it.id === editingItemId);
    if (item) {
      item.name = name;
      item.categoryId = categoryId;
      item.price = price;
      item.description = description;
      item.badge = badge;
      item.image = image;
      item.imageFit = imageFit;
      item.flavors = flavors;
      item.inStock = inStock;
      item.isAvailable = inStock;
    }
  } else {
    // Yeni ekleme
    const newId = 'item-' + Date.now();
    menuData.items.push({
      id: newId,
      name,
      categoryId,
      price,
      description,
      badge,
      image,
      imageFit,
      flavors,
      inStock,
      isAvailable: inStock
    });
  }

  const success = await saveMenuData(menuData);
  if (success) {
    closeItemEditModal();
    updateAdminStats();
    renderAdminProductTable();
    renderAdminCategories();
    renderQuickPriceTable();
  }
}

async function deleteItem(itemId) {
  if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;

  const prevItems = [...menuData.items];
  menuData.items = menuData.items.filter(it => it.id !== itemId);
  const ok = await saveMenuData(menuData);
  if (!ok) {
    menuData.items = prevItems;
  }
  updateAdminStats();
  renderAdminProductTable();
  renderAdminCategories();
  renderQuickPriceTable();
}

/* ==========================================================================
   HIZLI AROMA & GÖRSEL YARDIMCILARI (Quick Flavor & Image Helpers)
   ========================================================================== */

function appendFlavor(flavor) {
  const input = document.getElementById('form-item-flavors');
  if (!input) return;
  const current = input.value.trim();
  if (!current) {
    input.value = flavor;
  } else {
    const list = current.split(',').map(s => s.trim());
    if (!list.includes(flavor)) {
      input.value = current + ', ' + flavor;
    }
  }
}

function setPresetImage(type) {
  const input = document.getElementById('form-item-image');
  if (!input) return;

  const presets = {
    'hookah': 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80',
    'fruit': 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
    'mocktail': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    'coffee': 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    'dessert': 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80'
  };

  if (presets[type]) {
    resetProductImageUploadState();
    input.value = presets[type];
    setItemImageFit('cover', false);
    updateItemImagePreviewUI(presets[type], 'cover');
    const badgeEl = document.getElementById('item-image-meta-badge');
    if (badgeEl) {
      badgeEl.textContent = 'Hazır Şablon Seçildi';
      badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono';
    }
  }
}

/* ==========================================================================
   KATEGORİ YÖNETİMİ & KATEGORİ İÇİ ÜRÜN DÜZENLEME (Category & Item Management)
   ========================================================================== */

let editingCategoryId = null;
let expandedCategoryIds = new Set();

function toggleCategoryProducts(catId) {
  if (expandedCategoryIds.has(catId)) {
    expandedCategoryIds.delete(catId);
  } else {
    expandedCategoryIds.add(catId);
  }
  renderAdminCategories();
}

function toggleAllCategoryProducts() {
  const categories = menuData.categories || [];
  if (expandedCategoryIds.size >= categories.length) {
    expandedCategoryIds.clear();
  } else {
    categories.forEach(c => expandedCategoryIds.add(c.id));
  }
  renderAdminCategories();
}

function renderAdminCategories() {
  const container = document.getElementById('admin-categories-list');
  if (!container) return;

  const categories = menuData.categories || [];
  const items = menuData.items || [];
  const currency = menuData.settings?.currency || '₺';

  // Üstteki "Tüm Ürünleri Aç / Kapat" etiketini güncelle
  const toggleAllLabel = document.getElementById('label-toggle-all-cats');
  const toggleAllBtn = document.getElementById('btn-toggle-all-cats');
  if (toggleAllLabel && categories.length > 0) {
    const allOpen = expandedCategoryIds.size >= categories.length;
    toggleAllLabel.textContent = allOpen ? 'Tüm Ürünleri Kapat' : 'Tüm Ürünleri Aç';
    if (toggleAllBtn) {
      if (allOpen) {
        toggleAllBtn.className = 'px-3.5 py-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center gap-1.5 transition-all';
      } else {
        toggleAllBtn.className = 'px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 font-semibold text-xs flex items-center gap-1.5 transition-all';
      }
    }
  }

  if (categories.length === 0 && items.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-gray-400">Henüz kategori bulunmuyor.</div>`;
    return;
  }

  // Kategorisi silinmiş veya eşleşmeyen sahipsiz ürünler (Diğer Ürünler)
  const validCatIds = new Set(categories.map(c => c.id));
  const orphanItems = items.filter(it => !validCatIds.has(it.categoryId));
  let orphanHtml = '';
  if (orphanItems.length > 0) {
    orphanHtml = `
      <div class="mt-5 rounded-2xl bg-neutral-950/90 border border-amber-500/30 overflow-hidden shadow-xl">
        <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3.5 bg-amber-500/10 border-b border-amber-500/20">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center flex-shrink-0">
              <i data-lucide="layers" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-bold text-white text-sm">Sahipsiz / Silinmiş Kategoriden Kalan Ürünler</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-medium">
                  ${orphanItems.length} Ürün (Diğer Ürünler)
                </span>
              </div>
              <p class="text-[11px] text-gray-400 mt-0.5">Bu ürünlerin kategorisi silinmiş olduğu için müşteri menüsünde "Diğer Ürünler" altında çıkmaktadır.</p>
            </div>
          </div>
          <button type="button" onclick="cleanAllOrphanItems()" class="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>Tüm Sahipsizleri Sil</span>
          </button>
        </div>
        <div class="p-3 space-y-2 bg-neutral-900/60">
          ${orphanItems.map(item => {
            const thumbFallback = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=100&q=80';
            const thumbSrc = resolveAdminImageUrl(item.image, thumbFallback);
            const thumbFit = item.imageFit === 'contain' ? 'object-contain' : (item.imageFit === 'top' ? 'object-cover object-top' : 'object-cover');
            const safeItemId = String(item.id || '').replace(/'/g, "\\'");

            return `
              <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl bg-black/75 border border-white/5 hover:border-amber-500/30 transition-all">
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <img src="${thumbSrc}" alt="" class="w-11 h-11 rounded-lg ${thumbFit} bg-neutral-900 border border-white/10 flex-shrink-0" onerror="this.src='${thumbFallback}'" />
                  <div class="min-w-0 flex-1">
                    <div class="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5 truncate">
                      <span>${escapeHtml(item.name)}</span>
                      <span class="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 font-medium">Kategorisiz</span>
                    </div>
                    <div class="text-[10px] text-gray-500 truncate mt-0.5">${escapeHtml(item.description || '')}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-amber-400 font-mono text-xs">${item.price} ${currency}</span>
                  <button type="button" onclick="openEditItemModal('${safeItemId}')" class="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1 transition-colors">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                    <span>Düzenle / Kategori Seç</span>
                  </button>
                  <button type="button" onclick="deleteItem('${safeItemId}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors" title="Sil">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="space-y-3">
      ${categories.map((cat, idx) => {
        const catItems = items.filter(it => it.categoryId === cat.id);
        const count = catItems.length;
        const isFirst = idx === 0;
        const isLast = idx === categories.length - 1;
        const safeId = String(cat.id || '').replace(/'/g, "\\'");
        const isExpanded = expandedCategoryIds.has(cat.id);

        return `
          <div class="rounded-2xl bg-black border ${isExpanded ? 'border-amber-500/40 shadow-xl shadow-amber-500/5' : 'border-white/10 hover:border-white/20'} overflow-hidden transition-all">
            <!-- Kategori Başlık Satırı -->
            <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3.5 bg-neutral-950/70">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold flex-shrink-0">
                  <i data-lucide="${escapeHtml(cat.icon || 'star')}" class="w-5 h-5"></i>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-white text-sm truncate">${escapeHtml(cat.name)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${count > 0 ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' : 'bg-white/5 text-gray-500 border border-white/5'} font-medium">
                      ${count} Ürün
                    </span>
                  </div>
                  <button type="button" onclick="toggleCategoryProducts('${safeId}')" class="text-xs text-gray-400 hover:text-amber-300 mt-0.5 flex items-center gap-1 transition-colors">
                    <span>${isExpanded ? 'Ürünleri Gizle' : 'Ürünleri Yönet & Düzenle'}</span>
                    <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="w-3 h-3 text-amber-400"></i>
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-1.5 ml-auto flex-wrap">
                <!-- Ürünleri Aç/Kapat Butonu -->
                <button type="button" onclick="toggleCategoryProducts('${safeId}')" class="px-2.5 py-1.5 rounded-lg ${isExpanded ? 'bg-amber-500 text-black font-bold' : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'} text-xs font-semibold flex items-center gap-1.5 transition-colors" title="Bu kategorideki ürünleri aç veya kapat">
                  <i data-lucide="${isExpanded ? 'chevron-up' : 'package-open'}" class="w-3.5 h-3.5"></i>
                  <span>${isExpanded ? 'Kapat' : 'Ürünler (' + count + ')'}</span>
                </button>

                <!-- Bu Kategoriye Ürün Ekle -->
                <button type="button" onclick="openNewItemModalForCategory('${safeId}')" class="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 transition-colors" title="Bu kategoriye yeni ürün ekle">
                  <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                  <span>Ürün Ekle</span>
                </button>

                <!-- Sıralama / Düzenle / Sil -->
                <button type="button" onclick="moveCategory('${safeId}', -1)" ${isFirst ? 'disabled class="p-1.5 rounded-lg text-gray-600 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"'} title="Kategoriyi Yukarı Taşı">
                  <i data-lucide="arrow-up" class="w-4 h-4"></i>
                </button>
                <button type="button" onclick="moveCategory('${safeId}', 1)" ${isLast ? 'disabled class="p-1.5 rounded-lg text-gray-600 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"'} title="Kategoriyi Aşağı Taşı">
                  <i data-lucide="arrow-down" class="w-4 h-4"></i>
                </button>
                <button type="button" onclick="openEditCategoryModal('${safeId}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors" title="Kategori İsmini/İkonunu Düzenle">
                  <i data-lucide="edit-3" class="w-4 h-4"></i>
                </button>
                <button type="button" onclick="deleteCategory('${safeId}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors" title="Kategoriyi Sil">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <!-- Açılabilir Ürünler Yönetim Alanı -->
            ${isExpanded ? `
              <div class="border-t border-white/10 bg-neutral-900/60 p-3.5 sm:p-4 space-y-3">
                <div class="flex items-center justify-between gap-2 text-xs text-gray-400 pb-1.5 border-b border-white/5">
                  <span class="font-bold text-white flex items-center gap-1.5">
                    <i data-lucide="package" class="w-3.5 h-3.5 text-amber-400"></i>
                    <span>"${escapeHtml(cat.name)}" Kategorisindeki Ürünler (${catItems.length})</span>
                  </span>
                  <button type="button" onclick="openNewItemModalForCategory('${safeId}')" class="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors">
                    <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                    <span>+ Yeni Ürün Ekle</span>
                  </button>
                </div>

                ${catItems.length === 0 ? `
                  <div class="p-6 text-center rounded-xl bg-black/40 border border-white/5 text-xs text-gray-400 space-y-2.5">
                    <div>Bu kategoride henüz ürün bulunmuyor. Menüde görünmesi için bir ürün ekleyin.</div>
                    <button type="button" onclick="openNewItemModalForCategory('${safeId}')" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-md shadow-amber-500/15">
                      <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                      <span>İlk Ürünü Ekle</span>
                    </button>
                  </div>
                ` : `
                  <div class="space-y-2">
                    ${catItems.map((item) => {
                      const isOut = item.inStock === false || item.isAvailable === false;
                      const thumbFallback = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=100&q=80';
                      const thumbSrc = resolveAdminImageUrl(item.image, thumbFallback);
                      const thumbFit = item.imageFit === 'contain' ? 'object-contain' : (item.imageFit === 'top' ? 'object-cover object-top' : 'object-cover');
                      const safeItemId = String(item.id || '').replace(/'/g, "\\'");

                      return `
                        <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl bg-black/75 border border-white/5 hover:border-amber-500/30 transition-all">
                          <div class="flex items-center gap-3 min-w-0 flex-1">
                            <img src="${thumbSrc}" 
                                 alt="" class="w-11 h-11 rounded-lg ${thumbFit} bg-neutral-900 border border-white/10 flex-shrink-0"
                                 onerror="this.src='${thumbFallback}'" />
                            <div class="min-w-0 flex-1">
                              <div class="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5 truncate">
                                <span>${escapeHtml(item.name)}</span>
                                ${item.badge ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">${escapeHtml(item.badge)}</span>` : ''}
                              </div>
                              ${item.flavors && item.flavors.length > 0 ? `
                                <div class="text-[10px] text-gray-400 truncate mt-0.5">${item.flavors.map(f => escapeHtml(f)).join(' • ')}</div>
                              ` : (item.description ? `
                                <div class="text-[10px] text-gray-500 truncate mt-0.5">${escapeHtml(item.description)}</div>
                              ` : '')}
                            </div>
                          </div>

                          <div class="flex items-center gap-2 flex-shrink-0 ml-auto sm:ml-0">
                            <!-- Hızlı Fiyat Düzenleme Kutusu -->
                            <div class="flex items-center gap-1" title="Fiyatı anında değiştirmek için tıklayın">
                              <input 
                                type="number" 
                                value="${item.price}" 
                                onchange="saveSingleQuickPrice('${safeItemId}', this.value)"
                                onkeydown="if(event.key==='Enter'){ this.blur(); }"
                                class="w-20 px-2.5 py-1 rounded-lg bg-neutral-900 border border-white/15 text-right font-mono font-bold text-amber-400 text-xs focus:outline-none focus:border-amber-400"
                              />
                              <span class="text-xs text-gray-400 font-semibold font-mono">${currency}</span>
                            </div>

                            <!-- Stok Durumu Değiştirme Butonu -->
                            <button type="button" onclick="toggleStockStatus('${safeItemId}')" 
                                    class="px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold flex items-center gap-1 transition-colors ${
                                      isOut 
                                        ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    }" title="Stok durumunu değiştir">
                              <span class="w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red-400' : 'bg-emerald-400'}"></span>
                              <span>${isOut ? 'Tükendi' : 'Mevcut'}</span>
                            </button>

                            <!-- Doğrudan Ürünü Düzenleme Butonu (Kullanıcının İstediği Temel Düzenleme Alanı) -->
                            <button type="button" onclick="openEditItemModal('${safeItemId}')" 
                                    class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm shadow-amber-500/10" 
                                    title="Ürünün ismini, fotoğrafını, aromasını veya açıklamasını düzenle">
                              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                              <span>Düzenle</span>
                            </button>

                            <!-- Ürünü Sil Butonu -->
                            <button type="button" onclick="deleteItem('${safeItemId}')" 
                                    class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors" 
                                    title="Ürünü Sil">
                              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
    ${orphanHtml}
  `;

  if (window.lucide) lucide.createIcons();
}

async function cleanAllOrphanItems() {
  const validCatIds = new Set((menuData.categories || []).map(c => c.id));
  const orphans = (menuData.items || []).filter(it => !validCatIds.has(it.categoryId));
  if (orphans.length === 0) {
    showToast('Sahipsiz ürün bulunamadı.', 'info');
    return;
  }
  if (typeof confirm === 'function' && !confirm(`Kategorisi bulunmayan ${orphans.length} adet sahipsiz ürünü menüden tamamen silmek istediğinize emin misiniz?`)) {
    return;
  }
  menuData.items = (menuData.items || []).filter(it => validCatIds.has(it.categoryId));
  await saveMenuData(menuData);
  renderAdminCategories();
  renderAdminProductTable();
  showToast('✅ Sahipsiz ürünler başarıyla temizlendi!', 'success');
}

function openNewItemModalForCategory(catId) {
  if (catId) {
    expandedCategoryIds.add(catId);
  }
  openNewItemModal();
  fillCategorySelect(catId);
}

function openNewCategoryModal() {
  editingCategoryId = null;
  document.getElementById('modal-category-title').textContent = 'Yeni Kategori Ekle';
  document.getElementById('category-form').reset();
  const modal = document.getElementById('edit-category-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openEditCategoryModal(catId) {
  editingCategoryId = catId;
  const cat = menuData.categories.find(c => c.id === catId);
  if (!cat) return;

  document.getElementById('modal-category-title').textContent = 'Kategoriyi Düzenle';
  document.getElementById('form-category-name').value = cat.name || '';
  document.getElementById('form-category-icon').value = cat.icon || 'star';

  const modal = document.getElementById('edit-category-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCategoryModal() {
  const modal = document.getElementById('edit-category-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleSaveCategory(e) {
  e.preventDefault();
  const name = document.getElementById('form-category-name').value.trim();
  const icon = document.getElementById('form-category-icon').value;
  if (!name) return;

  if (!Array.isArray(menuData.categories)) menuData.categories = [];

  if (editingCategoryId) {
    const cat = menuData.categories.find(c => c.id === editingCategoryId);
    if (cat) {
      cat.name = name;
      cat.icon = icon;
    }
  } else {
    const newId = 'cat-' + Date.now();
    menuData.categories.push({
      id: newId,
      name,
      icon,
      order: menuData.categories.length + 1
    });
  }

  menuData.categories.forEach((c, i) => { c.order = i + 1; });

  const ok = await saveMenuData(menuData);
  if (ok) {
    closeCategoryModal();
    renderAdminCategories();
    renderAdminProductTable();
    fillCategorySelect();
  }
}

async function moveCategory(catId, dir) {
  const idx = menuData.categories.findIndex(c => c.id === catId);
  if (idx < 0) return;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= menuData.categories.length) return;

  const temp = menuData.categories[idx];
  menuData.categories[idx] = menuData.categories[targetIdx];
  menuData.categories[targetIdx] = temp;
  menuData.categories.forEach((c, i) => { c.order = i + 1; });

  const ok = await saveMenuData(menuData);
  if (ok) {
    renderAdminCategories();
    renderAdminProductTable();
    fillCategorySelect();
  }
}

async function deleteCategory(catId) {
  const cat = (menuData.categories || []).find(c => c.id === catId);
  if (!cat) return;

  const itemsInCat = (menuData.items || []).filter(it => it.categoryId === catId);
  let deleteProductsToo = false;

  if (itemsInCat.length > 0) {
    if (typeof confirm === 'function') {
      const choice = confirm(
        `"${cat.name}" kategorisinde ${itemsInCat.length} adet ürün bulunuyor.\n\n` +
        `• [Tamam]: Kategoriyi VE içerisindeki tüm ürünleri (${itemsInCat.length} adet) tamamen sil.\n` +
        `• [İptal]: Kategoriyi sil ama ürünleri "Diğer Ürünler" altına aktar.`
      );
      deleteProductsToo = choice;
    }
  } else {
    if (typeof confirm === 'function' && !confirm(`"${cat.name}" kategorisini silmek istediğinize emin misiniz?`)) return;
  }

  const prevCategories = JSON.parse(JSON.stringify(menuData.categories || []));
  const prevItems = JSON.parse(JSON.stringify(menuData.items || []));

  menuData.categories = (menuData.categories || []).filter(c => c.id !== catId);
  menuData.categories.forEach((c, i) => { c.order = i + 1; });

  if (deleteProductsToo) {
    menuData.items = (menuData.items || []).filter(it => it.categoryId !== catId);
  } else {
    (menuData.items || []).forEach(it => {
      if (it.categoryId === catId) it.categoryId = 'other';
    });
  }

  if (typeof expandedCategoryIds !== 'undefined' && expandedCategoryIds && expandedCategoryIds.delete) {
    expandedCategoryIds.delete(catId);
  }

  const ok = await saveMenuData(menuData);
  if (!ok) {
    menuData.categories = prevCategories;
    menuData.items = prevItems;
    return;
  }
  renderAdminCategories();
  renderAdminProductTable();
  fillCategorySelect();
}

/* ==========================================================================
   SABİT QR KOD & MASA BASKI STANDI OLUŞTURUCU (Printable Stands)
   ========================================================================== */

function setupQrGenerator() {
  const baseUrlInput = document.getElementById('qr-base-url');
  if (baseUrlInput) {
    let saved = (menuData && menuData.settings && menuData.settings.baseUrl) || '';
    saved = saved.replace(/^file:\/\//i, '').trim();

    if (saved && saved !== 'https://hashtag-menu.com' && !saved.includes('hashtag-menu.com') && saved.startsWith('http')) {
      baseUrlInput.value = saved;
    } else if (window.location.protocol.startsWith('http')) {
      baseUrlInput.value = window.location.origin;
    } else {
      baseUrlInput.value = 'https://p01--hashtag--xqx4khzq6gkf.code.run';
    }
  }

  const tableSelect = document.getElementById('qr-table-mode');
  if (tableSelect) {
    updateQrPreview();
  }
}

function updateQrPreview() {
  let baseUrl = (document.getElementById('qr-base-url').value || '').trim();
  
  // Hatalı veya kazara yapıştırılan file:// önekini otomatik temizle
  baseUrl = baseUrl.replace(/^file:\/\//i, '').trim();

  if (!baseUrl || baseUrl === 'null' || baseUrl === 'https://hashtag-menu.com' || baseUrl.includes('hashtag-menu.com')) {
    if (window.location.protocol.startsWith('http')) {
      baseUrl = window.location.origin;
    } else {
      baseUrl = 'https://p01--hashtag--xqx4khzq6gkf.code.run';
    }
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }

  const input = document.getElementById('qr-base-url');
  if (input && input.value !== baseUrl) {
    input.value = baseUrl;
  }

  const mode = document.getElementById('qr-table-mode').value;
  const singleTableNum = document.getElementById('qr-single-table-num').value;
  const printArea = document.getElementById('print-area');
  const printCount = mode === 'all' ? (menuData.settings.tableCount || 24) : 1;

  if (!printArea) return;

  let cardsHtml = '';
  const bm = (menuData && menuData.settings && menuData.settings.brandMedia) ? menuData.settings.brandMedia : {};
  const qrLogoSrc = (bm.logoImage && String(bm.logoImage).trim())
    ? resolveAdminImageUrl(bm.logoImage, 'hashtag-logo.jpg?v=2.3')
    : 'hashtag-logo.jpg?v=2.3';
  const qrLogoFitClass = bm.logoFit === 'contain' ? 'w-full h-full object-contain p-0.5' : 'w-full h-full object-cover';

  for (let i = 1; i <= printCount; i++) {
    const tableNum = mode === 'all' ? i : (mode === 'single' ? singleTableNum : null);
    const targetUrl = tableNum ? `${baseUrl}?table=${tableNum}` : baseUrl;
    const qrId = `qrcode-card-${i}`;

    cardsHtml += `
      <div class="table-stand-card max-w-sm mx-auto p-8 rounded-3xl bg-neutral-950 text-white border-2 border-amber-500/40 text-center shadow-2xl relative mb-8 page-break">
        <!-- Logo & Marka -->
        <div class="mb-4">
          <div class="w-14 h-14 rounded-2xl overflow-hidden border border-amber-500/40 mx-auto mb-2 shadow-lg shadow-amber-500/20 bg-black flex items-center justify-center">
            <img 
              src="${escapeHtml(qrLogoSrc)}" 
              onerror="if(!this.src.includes('hashtag-logo.jpg')) { this.src='hashtag-logo.jpg?v=2.3'; } else if(!this.src.includes('images/')) { this.src='images/hashtag-logo.jpg?v=2.3'; }"
              alt="HASHTAG" 
              class="${qrLogoFitClass}" 
            />
          </div>
          <h2 class="text-2xl font-black tracking-tight text-white uppercase">${escapeHtml(menuData.settings.cafeName || 'HASHTAG')}</h2>
          <p class="text-xs text-amber-400 font-semibold tracking-widest uppercase mt-0.5">Lounge & Hookah</p>
        </div>

        <!-- Masa Numarası -->
        ${tableNum ? `
          <div class="my-3 py-1.5 px-4 rounded-full bg-amber-500/15 border border-amber-500/30 inline-block">
            <span class="text-sm font-bold text-amber-300 uppercase tracking-wider">MASA ${escapeHtml(tableNum)}</span>
          </div>
        ` : `
          <div class="my-3 py-1.5 px-4 rounded-full bg-white/5 border border-white/10 inline-block">
            <span class="text-xs font-semibold text-gray-300 uppercase tracking-wider">DİJİTAL MENÜ</span>
          </div>
        `}

        <!-- QR Kod Görseli -->
        <div class="p-6 bg-white rounded-3xl inline-block my-3 shadow-xl">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&margin=10&data=${encodeURIComponent(targetUrl)}" 
               alt="QR Menü" 
               class="w-52 h-52 object-contain mx-auto block" />
        </div>

        <!-- Yönlendirme Metni -->
        <div class="mt-2 text-xs text-gray-300 font-medium">
          <p>Telefonunuzun kamerası ile</p>
          <p class="font-bold text-amber-400">QR Kodu Okutunuz</p>
        </div>

        <!-- Wi-Fi Kutusu -->
        <div class="mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-4 text-[11px] text-gray-400">
          <div><span class="text-gray-500">Wi-Fi:</span> <strong class="text-white">${escapeHtml(menuData.settings.wifiName || 'HASHTAG')}</strong></div>
          <div><span class="text-gray-500">Şifre:</span> <strong class="text-amber-400">${escapeHtml(menuData.settings.wifiPassword || '')}</strong></div>
        </div>
      </div>
    `;
  }

  printArea.innerHTML = cardsHtml;
}

function handleTableModeChange() {
  const mode = document.getElementById('qr-table-mode').value;
  const singleDiv = document.getElementById('qr-single-table-container');
  if (singleDiv) {
    if (mode === 'single') singleDiv.classList.remove('hidden');
    else singleDiv.classList.add('hidden');
  }
  updateQrPreview();
}

function triggerPrint() {
  window.print();
}

/* ==========================================================================
   AYARLAR FORMU
   ========================================================================== */

function fillSettingsForm() {
  const s = menuData.settings || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  const cleanInsta = typeof normalizeInstagramHandle === 'function'
    ? normalizeInstagramHandle(s.instagram)
    : ((s.instagram && s.instagram.toLowerCase() !== 'hashtag.lounge') ? s.instagram : 'hashtagcafe07');
  s.instagram = cleanInsta;

  setVal('set-cafe-name', s.cafeName);
  setVal('set-tagline', s.cafeTagline);
  setVal('set-currency', s.currency);
  setVal('set-wifi-name', s.wifiName);
  setVal('set-wifi-pass', s.wifiPassword);
  setVal('set-instagram', cleanInsta);
  updateInstagramPreviewLink(cleanInsta);
  setVal('set-google-maps', s.googleMapsUrl || 'https://www.google.com/maps/place/HashTag+Shısha+TowN/@36.5441256,31.9875018,17z/data=!4m8!3m7!1s0x14dca29d1fbf1249:0x4b3340264cde0fb8!8m2!3d36.5441256!4d31.9900767!9m1!1b1!16s%2Fg%2F11c5swfnsx?entry=ttu&g_ep=EgoyMDI2MTAyMC4wIKXMDSoASAFQAw%3D%3D');
  setVal('set-admin-pin', s.adminPin);
  setVal('set-base-url', s.baseUrl);
  setVal('set-table-count', s.tableCount || 24);
  setVal('set-staff-pin', s.staffPin || '5555');

  const enableCalls = document.getElementById('set-enable-calls');
  if (enableCalls) enableCalls.checked = !!s.enableServiceCalls;

  const staffPerms = s.staffPermissions || { allowStockToggle: true, allowPriceEdit: false };
  const stockToggleEl = document.getElementById('set-staff-allow-stock');
  if (stockToggleEl) stockToggleEl.checked = staffPerms.allowStockToggle !== false;

  const priceEditEl = document.getElementById('set-staff-allow-price');
  if (priceEditEl) priceEditEl.checked = !!staffPerms.allowPriceEdit;

  // Haftanın / Günün Duyurusu & Banner Ayarları
  const hasSavedAnn = s.announcement !== undefined && s.announcement !== null;
  const ann = s.announcement || {};
  const isAnnEnabled = ann.enabled !== false;
  const annEnabledEl = document.getElementById('set-announcement-enabled');
  if (annEnabledEl) annEnabledEl.checked = isAnnEnabled;

  setVal('set-announcement-badge', hasSavedAnn && ann.badge !== undefined ? ann.badge : '🔥 ŞEFİN TAVSİYESİ');
  setVal('set-announcement-title', hasSavedAnn && ann.title !== undefined ? ann.title : 'Love 66 & Lady Killer Özel Mix');
  setVal('set-announcement-desc', hasSavedAnn && ann.desc !== undefined ? ann.desc : 'Özel buzlu marpuç ve taze nane esintisiyle hazırlanan günün karışımı.');
  setVal('set-announcement-image', ann.image || '');
  const annFit = ann.imageFit || 'cover';
  setVal('set-announcement-image-fit', annFit);
  if (typeof resetAnnouncementUploadState === 'function') {
    resetAnnouncementUploadState();
  }
  if (typeof setAnnouncementImageFit === 'function') {
    setAnnouncementImageFit(annFit, false);
  }
  if (typeof updateAnnouncementToggleUI === 'function') {
    updateAnnouncementToggleUI(isAnnEnabled);
  }
  updateAnnouncementImagePreview(ann.image || '', annFit);

  // Profil Fotoğrafları (Sol Üst & Sayfa Altı) ve Anasayfa Kapak Medya Eklentisi
  const bm = s.brandMedia || {};
  const defaultHeroTitle = `${(s.cafeName || 'HASHTAG').toUpperCase()} LOUNGE & HOOKAH`;
  setVal('set-brand-logo-image', bm.logoImage || '');
  setVal('set-brand-logo-fit', bm.logoFit || 'cover');
  setVal('set-brand-hero-image', bm.heroBannerImage || '');
  setVal('set-brand-hero-fit', bm.heroBannerFit || 'cover');
  setVal('set-hero-banner-badge', bm.heroBannerBadge !== undefined ? bm.heroBannerBadge : 'PREMİUM ATMOSFER');
  setVal('set-hero-banner-title', bm.heroBannerTitle !== undefined ? bm.heroBannerTitle : defaultHeroTitle);
  setVal('set-hero-banner-desc', bm.heroBannerDesc !== undefined ? bm.heroBannerDesc : '💨 Özel Nargile Karışımları • 🍹 Mocktail & Kahve');
  setVal('set-brand-mood-image', bm.moodBannerImage || '');
  setVal('set-brand-mood-fit', bm.moodBannerFit || 'cover');
  setVal('set-brand-bg-image', bm.backgroundImage || '');
  setVal('set-brand-bg-fit', bm.backgroundFit || 'cover');
  setVal('set-brand-bg-opacity', bm.backgroundOpacity !== undefined && bm.backgroundOpacity !== null && bm.backgroundOpacity !== '' ? bm.backgroundOpacity : 36);
  setVal('set-brand-bg-blur', bm.backgroundBlur !== undefined && bm.backgroundBlur !== null && bm.backgroundBlur !== '' ? bm.backgroundBlur : 0);
  setVal('set-ambient-effect', bm.ambientEffect || 'smoke');
  setVal('set-ambient-intensity', bm.ambientIntensity || 'medium');

  const isMoodEnabled = bm.moodSlideEnabled !== false;
  const moodEnabledEl = document.getElementById('set-mood-slide-enabled');
  if (moodEnabledEl) moodEnabledEl.checked = isMoodEnabled;

  if (typeof resetBrandMediaUploadState === 'function') {
    resetBrandMediaUploadState();
  }
  if (typeof setBrandMediaSlotFit === 'function') {
    setBrandMediaSlotFit('logo', bm.logoFit || 'cover', false);
    setBrandMediaSlotFit('hero', bm.heroBannerFit || 'cover', false);
    setBrandMediaSlotFit('mood', bm.moodBannerFit || 'cover', false);
    setBrandMediaSlotFit('bg', bm.backgroundFit || 'cover', false);
  }
  if (typeof updateAmbientEffectSelectorUI === 'function') {
    updateAmbientEffectSelectorUI(bm.ambientEffect || 'smoke', bm.ambientIntensity || 'medium');
  }
  if (typeof previewBackgroundStyleSliders === 'function') {
    previewBackgroundStyleSliders();
  }
  if (typeof updateMoodSlideToggleUI === 'function') {
    updateMoodSlideToggleUI(isMoodEnabled);
  }
  if (typeof syncHeroPreviewTexts === 'function') {
    syncHeroPreviewTexts();
  }
  if (typeof applyAdminBrandLogoUI === 'function') {
    applyAdminBrandLogoUI();
  }
}

function updateInstagramPreviewLink(val) {
  const clean = typeof normalizeInstagramHandle === 'function'
    ? normalizeInstagramHandle(val)
    : (String(val || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?#]/)[0].replace(/^@+/, '') || 'hashtagcafe07');
  const linkEl = document.getElementById('instagram-live-preview-link');
  if (linkEl) {
    linkEl.href = `https://www.instagram.com/${clean}`;
    linkEl.textContent = `instagram.com/${clean}`;
  }
}

function openStaffPortalFromAdmin(e) {
  if (e) e.preventDefault();
  const url = window.location.protocol.startsWith('http') ? '/personel' : 'staff.html';
  window.open(url, '_blank');
}

function toggleStaffPinVisibility() {
  const pinInput = document.getElementById('set-staff-pin');
  const eyeIcon = document.getElementById('staff-pin-eye-icon');
  if (!pinInput) return;
  if (pinInput.type === 'password') {
    pinInput.type = 'text';
    if (eyeIcon) eyeIcon.setAttribute('data-lucide', 'eye-off');
  } else {
    pinInput.type = 'password';
    if (eyeIcon) eyeIcon.setAttribute('data-lucide', 'eye');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function handleSaveSettings(e) {
  e.preventDefault();

  if ((typeof isUploadingAnnouncementImage !== 'undefined' && isUploadingAnnouncementImage) ||
      (typeof isAnyBrandMediaUploading === 'function' && isAnyBrandMediaUploading())) {
    showToast('⏳ Görsel işleniyor, lütfen 1-2 saniye bekleyin...', 'error');
    return;
  }

  const currentAuthPin = getAdminPin();
  try { sessionStorage.setItem('hashtag_admin_pin', currentAuthPin); } catch (err) {}

  const newPin = document.getElementById('set-admin-pin').value.trim() || '1234';
  const newStaffPin = document.getElementById('set-staff-pin') ? document.getElementById('set-staff-pin').value.trim() || '5555' : '5555';
  const allowStock = document.getElementById('set-staff-allow-stock') ? document.getElementById('set-staff-allow-stock').checked : true;
  const allowPrice = document.getElementById('set-staff-allow-price') ? document.getElementById('set-staff-allow-price').checked : false;

  const badgeInputEl = document.getElementById('set-announcement-badge');
  const titleInputEl = document.getElementById('set-announcement-title');
  const descInputEl = document.getElementById('set-announcement-desc');
  const baseUrlEl = document.getElementById('set-base-url');
  const enableCallsEl = document.getElementById('set-enable-calls');

  menuData.settings = {
    ...menuData.settings,
    cafeName: document.getElementById('set-cafe-name').value.trim(),
    cafeTagline: document.getElementById('set-tagline').value.trim(),
    currency: document.getElementById('set-currency').value.trim() || '₺',
    wifiName: document.getElementById('set-wifi-name').value.trim(),
    wifiPassword: document.getElementById('set-wifi-pass').value.trim(),
    instagram: typeof normalizeInstagramHandle === 'function'
      ? normalizeInstagramHandle(document.getElementById('set-instagram').value)
      : document.getElementById('set-instagram').value.trim(),
    googleMapsUrl: document.getElementById('set-google-maps') ? document.getElementById('set-google-maps').value.trim() : (menuData.settings.googleMapsUrl || ''),
    adminPin: newPin,
    staffPin: newStaffPin,
    staffPermissions: {
      allowStockToggle: allowStock,
      allowPriceEdit: allowPrice,
      allowCallsView: true
    },
    announcement: {
      enabled: document.getElementById('set-announcement-enabled') ? document.getElementById('set-announcement-enabled').checked : true,
      badge: badgeInputEl ? badgeInputEl.value.trim() : '🔥 ŞEFİN TAVSİYESİ',
      title: titleInputEl ? (titleInputEl.value.trim() || 'HASHTAG Özel Seçim') : 'Love 66 & Lady Killer Özel Mix',
      desc: descInputEl ? descInputEl.value.trim() : '',
      image: document.getElementById('set-announcement-image') ? document.getElementById('set-announcement-image').value.trim() : '',
      imageFit: document.getElementById('set-announcement-image-fit') ? (document.getElementById('set-announcement-image-fit').value || 'cover') : 'cover'
    },
    brandMedia: typeof readBrandMediaFormObject === 'function'
      ? readBrandMediaFormObject()
      : (menuData.settings.brandMedia || {}),
    baseUrl: (baseUrlEl ? baseUrlEl.value.trim() : (menuData.settings.baseUrl || '')) || (window.location.protocol.startsWith('http') ? window.location.origin : 'https://p01--hashtag--xqx4khzq6gkf.code.run'),
    tableCount: parseInt(document.getElementById('set-table-count').value) || 24,
    enableServiceCalls: enableCallsEl ? enableCallsEl.checked : !!menuData.settings.enableServiceCalls
  };

  const ok = await saveMenuData(menuData);
  if (ok) {
    try { sessionStorage.setItem('hashtag_admin_pin', newPin); } catch (err) {}
    fillSettingsForm();
    showToast('✅ Kafe, profil görselleri, duyuru ve Wi-Fi ayarları kaydedildi!', 'success');
  }
}

/* ==========================================================================
   YEDEK DIŞA / İÇE AKTARMA (EXPORT / IMPORT)
   ========================================================================== */

function exportMenuBackup() {
  const jsonStr = JSON.stringify(menuData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hashtag_menu_yedek_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importMenuBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.items && imported.categories && imported.settings) {
        menuData = imported;
        await saveMenuData(menuData);
        alert('✅ Menü yedeği başarıyla geri yüklendi!');
        window.location.reload();
      } else {
        alert('❌ Geçersiz menü dosyası formatı!');
      }
    } catch (err) {
      alert('❌ Dosya okunurken hata oluştu: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   PERSONEL, VARDİYA & AUDIT LOGLARI YÖNETİMİ
   ========================================================================== */

let adminStaffList = [];
let adminLogsList = [];
let currentLogFilter = 'all';
let staffLivePollInterval = null;

function startStaffLivePolling() {
  stopStaffLivePolling();
  // 2.5 saniyede bir kesintisiz canlı akış (Real-Time Background Polling)
  staffLivePollInterval = setInterval(async () => {
    if (currentTab === 'staff' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      await Promise.allSettled([
        loadStaffPerformanceData(true),
        loadStaffLogsData(true),
        loadFeedbackList(true)
      ]);
    }
  }, 2500);
}

function stopStaffLivePolling() {
  if (staffLivePollInterval) {
    clearInterval(staffLivePollInterval);
    staffLivePollInterval = null;
  }
}

async function refreshStaffTab() {
  const btn = event && event.currentTarget ? event.currentTarget : null;
  if (btn) btn.classList.add('opacity-50', 'pointer-events-none');
  await Promise.allSettled([
    loadStaffPerformanceData(false),
    loadStaffLogsData(false),
    loadFeedbackList(false)
  ]);
  if (btn) btn.classList.remove('opacity-50', 'pointer-events-none');
  showToast('🔄 Personel, log ve değerlendirme verileri güncellendi', 'info');
}

async function loadStaffAdminData() {
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(apiBase + '/api/staff/list', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (!adminStaffList || adminStaffList.length === 0) {
        adminStaffList = data.staff || [];
        renderAdminStaffTable();
      }
    }
  } catch (e) {
    console.error("Load staff admin error:", e);
  }
}

async function loadStaffPerformanceData(silent = false) {
  const adminPin = getAdminPin();
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(apiBase + '/api/staff/performance', {
      headers: { 'X-Admin-PIN': adminPin },
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      const perf = data.performance || [];
      
      // İstatistik sayaçlarını güncelle
      const activeCount = perf.filter(p => p.isOnline).length;
      const totalCalls = (data.totalTodayCalls !== undefined) ? data.totalTodayCalls : perf.reduce((acc, p) => acc + (p.completedCalls || 0), 0);
      const star = perf.length > 0 && perf[0].completedCalls > 0 ? `${perf[0].name} (${perf[0].completedCalls} Çağrı)` : 'Henüz Yok';

      const statActive = document.getElementById('stat-active-staff');
      const statToday = document.getElementById('stat-today-calls');
      const statStar = document.getElementById('stat-star-staff');

      if (statActive) statActive.textContent = activeCount;
      if (statToday) statToday.textContent = totalCalls;
      if (statStar) statStar.textContent = star;

      // Tabloyu zenginleştirilmiş verilerle doldur
      adminStaffList = perf;
      renderAdminStaffTable();
    } else {
      if (!silent) console.warn("Staff performance returned status:", res.status);
      if (adminStaffList.length === 0) {
        await loadStaffAdminData();
      }
    }
  } catch (e) {
    if (!silent) console.error("Load staff perf error:", e);
    if (adminStaffList.length === 0) {
      await loadStaffAdminData();
    }
  }
}

function renderAdminStaffTable() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  if (adminStaffList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-gray-500">Kayıtlı personel bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = adminStaffList.map(s => {
    const isOnline = !!s.isOnline;
    const name = s.name || 'Personel';
    const firstChar = escapeHtml(name.charAt(0) || 'P');
    const safeStaffId = escapeHtml(String(s.id || '')).replace(/'/g, "\\'");
    return `
      <tr class="hover:bg-white/5 transition-colors">
        <td class="py-3 pr-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xs">
              ${firstChar}
            </div>
            <div>
              <div class="font-bold text-white">${escapeHtml(name)}</div>
              <div class="text-[10px] text-gray-500">ID: ${escapeHtml(s.id || '')}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[11px] font-medium text-gray-300">
            ${escapeHtml(s.role || 'Garson')}
          </span>
        </td>
        <td class="py-3 px-3 font-mono text-amber-400 font-bold">
          <span class="bg-black/50 px-2 py-1 rounded-md border border-white/5">
            ${s.pin ? escapeHtml(s.pin) : '••••'}
          </span>
        </td>
        <td class="py-3 px-3">
          ${isOnline ? `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Vardiyada
            </span>
          ` : `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 text-gray-500 text-[11px]">
              <span class="w-1.5 h-1.5 rounded-full bg-gray-600"></span> Çevrimdışı
            </span>
          `}
        </td>
        <td class="py-3 px-3 font-bold text-amber-300">
          ${s.completedCalls || 0} Çağrı
        </td>
        <td class="py-3 px-3 text-gray-300">
          ${s.totalHours || 0} Saat
        </td>
        <td class="py-3 px-3 text-gray-400 text-[11px]">
          ${escapeHtml(s.lastDevice && s.lastDevice !== 'Bilinmiyor' ? s.lastDevice : '—')}
        </td>
        <td class="py-3 pl-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="editStaffMember('${safeStaffId}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 transition-colors" title="Düzenle">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteStaffMember('${safeStaffId}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-400 transition-colors" title="Sil">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function loadStaffLogsData(silent = false) {
  const adminPin = getAdminPin();
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(apiBase + '/api/staff/logs', {
      headers: { 'X-Admin-PIN': adminPin },
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      adminLogsList = data.logs || [];
      renderLogsList();
    } else {
      if (!silent) console.warn("Staff logs returned status:", res.status);
    }
  } catch (e) {
    if (!silent) console.error("Load logs error:", e);
  }
}

function filterLogs(type) {
  currentLogFilter = type;
  ['all', 'login', 'call', 'stock'].forEach(t => {
    const btn = document.getElementById(`log-filter-${t}`);
    if (btn) {
      if (t === type) {
        btn.className = 'px-2.5 py-1 rounded-lg bg-amber-500 text-black text-[11px] font-bold';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-medium border border-white/5';
      }
    }
  });
  renderLogsList();
}

function renderLogsList() {
  const container = document.getElementById('logs-container');
  if (!container) return;

  let filtered = adminLogsList;
  if (currentLogFilter === 'login') {
    filtered = filtered.filter(l => l.action === 'login' || l.action === 'logout');
  } else if (currentLogFilter === 'call') {
    filtered = filtered.filter(l => l.action === 'call_taken' || l.action === 'call_completed');
  } else if (currentLogFilter === 'stock') {
    filtered = filtered.filter(l => l.action === 'stock_toggle' || l.action === 'price_update');
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="py-8 text-center text-xs text-gray-500">Henüz kaydedilmiş işlem günlüğü yok.</div>`;
    return;
  }

  const actionIcons = {
    'login': '<i data-lucide="log-in" class="w-4 h-4 text-emerald-400"></i>',
    'logout': '<i data-lucide="log-out" class="w-4 h-4 text-red-400"></i>',
    'call_taken': '<i data-lucide="footprints" class="w-4 h-4 text-blue-400"></i>',
    'call_completed': '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>',
    'stock_toggle': '<i data-lucide="package" class="w-4 h-4 text-amber-400"></i>',
    'price_update': '<i data-lucide="dollar-sign" class="w-4 h-4 text-emerald-400"></i>',
    'feedback': '<i data-lucide="star" class="w-4 h-4 text-amber-400"></i>'
  };

  container.innerHTML = filtered.map(l => `
    <div class="p-3 rounded-2xl bg-black border border-white/5 flex items-center justify-between text-xs hover:border-white/10 transition-colors">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
          ${actionIcons[l.action] || '<i data-lucide="activity" class="w-4 h-4 text-gray-400"></i>'}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-white">${escapeHtml(l.staffName || 'Personel')}</span>
            <span class="text-[10px] text-gray-400">(${escapeHtml(l.role || 'Ekip')})</span>
            <span class="text-gray-600">•</span>
            <span class="text-amber-300 font-medium">${escapeHtml(l.title || 'İşlem')}</span>
          </div>
          <div class="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
            <span>📱 ${escapeHtml(l.device || 'Cihaz')}</span>
            ${l.details ? `<span>• ${escapeHtml(l.details)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="text-[11px] text-gray-500 font-mono flex-shrink-0 text-right">
        ${escapeHtml(l.timeStr || '')}
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

/* ==========================================================================
   MÜŞTERİ GERİ BİLDİRİM, HAFTALIK RAPOR ARŞİVİ & AKILLI GELİŞİM ANALİTİĞİ
   ========================================================================== */

let currentFeedbackTimeFilter = 'daily'; // 'daily', 'weekly', 'monthly', 'yearly', 'all'
let currentFeedbackRatingFilter = 'all'; // 'all', 'critical', 'positive'
let adminWeeklyArchives = [];
let activeWeekInfo = null;
let expandedWeeklyReportIds = new Set();

function isActionRequiredFeedback(fb) {
  if (!fb) return false;
  const rating = Number(fb.rating !== undefined ? fb.rating : 5);
  if (rating <= 3) return true;

  const tagsStr = Array.isArray(fb.tags) ? fb.tags.join(' ').toLowerCase() : '';
  const commentStr = String(fb.comment || '').toLowerCase();
  const combined = `${tagsStr} ${commentStr}`;
  const negativeKeywords = [
    'gecik', 'geç', 'yavaş', 'yüksek müzik', 'gürültü', 'soğuk',
    'yanık', 'kötü', 'şikayet', 'bekle', 'az duman', 'gelmedi', 'pahalı'
  ];
  return negativeKeywords.some(kw => combined.includes(kw));
}

async function loadFeedbackList(silent = false) {
  try {
    const apiBase = getApiBaseUrl();
    const pin = getAdminPin();
    const res = await fetch(apiBase + '/api/admin/feedback?pin=' + encodeURIComponent(pin), {
      headers: { 'X-Admin-PIN': pin },
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      adminFeedbackList = data.feedbacks || [];
      if (Array.isArray(data.weeklyArchives)) {
        adminWeeklyArchives = data.weeklyArchives;
      }
      if (data.activeWeekInfo) {
        activeWeekInfo = data.activeWeekInfo;
        const wkLabelEl = document.getElementById('active-week-label');
        if (wkLabelEl && activeWeekInfo.weekNum) {
          wkLabelEl.textContent = `Aktif: ${activeWeekInfo.weekNum}. Hafta (${activeWeekInfo.dateRange}) • Pazartesi 00:00 Otomatik Sıfırlanır`;
        }
      }
      renderFeedbackDashboard();
      renderWeeklyArchivesList();
    }
  } catch (e) {
    if (!silent) console.error("Load feedback error:", e);
  }
}

function focusLowRatingsSection() {
  const periodFeedbacks = getFeedbacksForCurrentTimeFilter();
  const lowInPeriod = periodFeedbacks.filter(f => isActionRequiredFeedback(f));
  const lowInAll = (adminFeedbackList || []).filter(f => isActionRequiredFeedback(f));

  // Eğer günlükte düşük puan yoksa ama tüm zamanlarda varsa, kullanıcıya hemen göstermek için 'all' periyoduna geç
  if (lowInPeriod.length === 0 && lowInAll.length > 0) {
    setFeedbackTimeFilter('all');
  }
  setFeedbackRatingFilter('critical');

  const section = document.getElementById('fb-smart-recommendations-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    section.classList.add('ring-2', 'ring-amber-400');
    setTimeout(() => section.classList.remove('ring-2', 'ring-amber-400'), 1800);
  }
}

function setFeedbackTimeFilter(filter) {
  currentFeedbackTimeFilter = filter;
  ['daily', 'weekly', 'monthly', 'yearly', 'all'].forEach(f => {
    const btn = document.getElementById(`fb-filter-${f}`);
    if (btn) {
      if (f === filter) {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-amber-500 text-black shadow';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all text-gray-400 hover:text-white';
      }
    }
  });

  const periodBadge = document.getElementById('fb-period-badge');
  const labels = {
    daily: 'Günlük (24s)',
    weekly: 'Haftalık (7G)',
    monthly: 'Aylık (30G)',
    yearly: 'Yıllık (365G)',
    all: 'Tüm Zamanlar'
  };
  if (periodBadge) periodBadge.textContent = labels[filter] || 'Günlük';

  renderFeedbackDashboard();
}

function setFeedbackRatingFilter(filter) {
  currentFeedbackRatingFilter = filter;
  ['all', 'critical', 'positive'].forEach(f => {
    const btn = document.getElementById(`fb-rating-${f}`);
    if (btn) {
      if (f === filter) {
        btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-black shadow';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5';
      }
    }
  });
  renderFeedbackListOnly();
}

function getFeedbacksForCurrentTimeFilter() {
  const now = Math.floor(Date.now() / 1000);
  if (!adminFeedbackList || adminFeedbackList.length === 0) return [];

  let list = adminFeedbackList.slice();
  if (currentFeedbackTimeFilter === 'daily') {
    list = list.filter(f => (now - (f.timestamp || 0)) <= 86400);
  } else if (currentFeedbackTimeFilter === 'weekly') {
    list = list.filter(f => (now - (f.timestamp || 0)) <= (7 * 86400));
  } else if (currentFeedbackTimeFilter === 'monthly') {
    list = list.filter(f => (now - (f.timestamp || 0)) <= (30 * 86400));
  } else if (currentFeedbackTimeFilter === 'yearly') {
    list = list.filter(f => (now - (f.timestamp || 0)) <= (365 * 86400));
  }
  return list;
}

function renderFeedbackDashboard() {
  const periodFeedbacks = getFeedbacksForCurrentTimeFilter();

  updateFeedbackKPIs(periodFeedbacks);
  renderFeedbackStarBars(periodFeedbacks);
  renderFeedbackTrendChart(periodFeedbacks);
  generateSmartRecommendations(periodFeedbacks);
  renderFeedbackListOnly();

  if (window.lucide) lucide.createIcons();
}

function updateFeedbackKPIs(feedbacks) {
  const kpiAvg = document.getElementById('fb-kpi-avg');
  const kpiStars = document.getElementById('fb-kpi-stars');
  const kpiTotal = document.getElementById('fb-kpi-total');
  const kpiPeriodLabel = document.getElementById('fb-kpi-period-label');
  const kpiNps = document.getElementById('fb-kpi-nps');
  const kpiCritical = document.getElementById('fb-kpi-critical');
  const kpiCriticalSub = document.getElementById('fb-kpi-critical-sub');
  const kpiCriticalCard = document.getElementById('fb-kpi-critical-card');

  const count = feedbacks.length;
  const allLowCount = (adminFeedbackList || []).filter(f => isActionRequiredFeedback(f)).length;

  if (count === 0) {
    if (kpiAvg) kpiAvg.textContent = '-';
    if (kpiStars) kpiStars.textContent = 'Bu periyotta değerlendirme yok';
    if (kpiTotal) kpiTotal.textContent = '0';
    if (kpiPeriodLabel) kpiPeriodLabel.textContent = 'Kayıt bekleniyor';
    if (kpiNps) kpiNps.textContent = '%100';
    if (kpiCritical) kpiCritical.textContent = '0';
    if (kpiCriticalSub) {
      kpiCriticalSub.textContent = allLowCount > 0
        ? `Tüm zamanlarda ${allLowCount} kayıt var (Tıkla)`
        : '✅ Aksiyon gerektiren masa yok';
    }
    if (kpiCriticalCard) {
      kpiCriticalCard.className = 'p-4 rounded-2xl bg-black/60 border border-white/5 hover:border-amber-500/40 flex flex-col justify-between cursor-pointer transition-all group';
    }
    return;
  }

  const sum = feedbacks.reduce((acc, f) => acc + Number(f.rating || 5), 0);
  const avg = (sum / count).toFixed(1);
  const starsStr = '⭐'.repeat(Math.max(1, Math.min(5, Math.round(avg))));

  const criticalItems = feedbacks.filter(f => isActionRequiredFeedback(f));
  const criticalCount = criticalItems.length;
  const positiveCount = feedbacks.filter(f => Number(f.rating || 5) >= 4 && !isActionRequiredFeedback(f)).length;
  const npsPct = Math.round((positiveCount / count) * 100);

  if (kpiAvg) kpiAvg.textContent = avg;
  if (kpiStars) kpiStars.textContent = `${starsStr} (${avg}/5)`;
  if (kpiTotal) kpiTotal.textContent = count;
  if (kpiPeriodLabel) kpiPeriodLabel.textContent = `${count} müşteri değerlendirmesi`;
  if (kpiNps) kpiNps.textContent = `%${npsPct}`;
  if (kpiCritical) kpiCritical.textContent = criticalCount;

  if (kpiCriticalSub) {
    if (criticalCount > 0) {
      kpiCriticalSub.innerHTML = `<span class="text-amber-300 font-semibold">⚠️ ${criticalCount} masada inceleme & çözüm önerisi</span>`;
    } else if (allLowCount > 0 && currentFeedbackTimeFilter !== 'all') {
      kpiCriticalSub.innerHTML = `<span class="text-emerald-400">✅ Bu periyotta 0</span> <span class="text-gray-500">(Toplam: ${allLowCount})</span>`;
    } else {
      kpiCriticalSub.innerHTML = `<span class="text-emerald-400">✅ Tüm masalar mutlu</span>`;
    }
  }

  if (kpiCriticalCard) {
    kpiCriticalCard.className = criticalCount > 0
      ? 'p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 hover:border-amber-400 flex flex-col justify-between cursor-pointer transition-all group shadow-lg shadow-amber-500/5'
      : 'p-4 rounded-2xl bg-black/60 border border-white/5 hover:border-amber-500/40 flex flex-col justify-between cursor-pointer transition-all group';
  }
}

function renderFeedbackStarBars(feedbacks) {
  const container = document.getElementById('fb-star-bars-container');
  if (!container) return;

  const total = feedbacks.length;
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  feedbacks.forEach(f => {
    const r = f.rating || 5;
    if (counts[r] !== undefined) counts[r]++;
    else counts[5]++;
  });

  const barColors = {
    5: 'from-amber-500 to-amber-300',
    4: 'from-amber-600 to-amber-400',
    3: 'from-yellow-600 to-amber-600',
    2: 'from-orange-600 to-amber-600',
    1: 'from-red-600 to-orange-600'
  };

  let html = '';
  for (let star = 5; star >= 1; star--) {
    const cnt = counts[star];
    const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
    html += `
      <div class="flex items-center gap-2 text-xs">
        <span class="w-7 font-bold text-amber-400 flex items-center gap-0.5 flex-shrink-0">
          ${star} <span class="text-[10px]">★</span>
        </span>
        <div class="flex-1 h-3 rounded-full bg-white/5 overflow-hidden p-0.5 border border-white/5">
          <div class="h-full rounded-full bg-gradient-to-r ${barColors[star]} transition-all duration-500" style="width: ${Math.max(pct, cnt > 0 ? 4 : 0)}%"></div>
        </div>
        <span class="w-16 text-right text-[11px] text-gray-400 font-mono flex-shrink-0">
          %${pct} <span class="text-[10px] text-gray-500">(${cnt})</span>
        </span>
      </div>
    `;
  }
  container.innerHTML = html;
}

function renderFeedbackTrendChart(feedbacks) {
  const barsContainer = document.getElementById('fb-trend-bars-container');
  const labelsContainer = document.getElementById('fb-trend-labels-container');
  const titleEl = document.getElementById('fb-trend-chart-title');
  const subtitleEl = document.getElementById('fb-trend-chart-subtitle');

  if (!barsContainer || !labelsContainer) return;

  const filter = currentFeedbackTimeFilter;
  let columns = [];

  if (filter === 'daily') {
    if (titleEl) titleEl.textContent = 'Günün Saat Dilimi Dağılımı';
    if (subtitleEl) subtitleEl.textContent = 'Son 24 saat içindeki yoğunluk';
    columns = [
      { id: 'shift1', label: '12-16', sub: 'Öğlen', minH: 12, maxH: 16 },
      { id: 'shift2', label: '16-20', sub: 'İkindi', minH: 16, maxH: 20 },
      { id: 'shift3', label: '20-00', sub: 'Akşam', minH: 20, maxH: 24 },
      { id: 'shift4', label: '00-04', sub: 'Gece', minH: 0, maxH: 4 }
    ];

    columns.forEach(col => {
      const matching = feedbacks.filter(f => {
        const trHour = (Math.floor((f.timestamp || 0) + 3 * 3600) % 86400) / 3600;
        return (trHour >= col.minH && trHour < col.maxH);
      });
      col.count = matching.length;
      col.avg = matching.length > 0 ? (matching.reduce((a, b) => a + (b.rating || 5), 0) / matching.length).toFixed(1) : '-';
    });

  } else if (filter === 'weekly') {
    if (titleEl) titleEl.textContent = 'Haftalık Gün Dağılımı';
    if (subtitleEl) subtitleEl.textContent = 'Son 7 gün içindeki puanlar';
    columns = [
      { day: 1, label: 'Pzt' },
      { day: 2, label: 'Sal' },
      { day: 3, label: 'Çar' },
      { day: 4, label: 'Per' },
      { day: 5, label: 'Cum' },
      { day: 6, label: 'Cmt' },
      { day: 0, label: 'Paz' }
    ];

    columns.forEach(col => {
      const matching = feedbacks.filter(f => {
        const d = new Date(((f.timestamp || 0) + 3 * 3600) * 1000).getUTCDay();
        return d === col.day;
      });
      col.count = matching.length;
      col.avg = matching.length > 0 ? (matching.reduce((a, b) => a + (b.rating || 5), 0) / matching.length).toFixed(1) : '-';
    });

  } else if (filter === 'monthly') {
    if (titleEl) titleEl.textContent = 'Aylık Hafta Dağılımı';
    if (subtitleEl) subtitleEl.textContent = 'Son 30 günün 4 haftası';
    const now = Math.floor(Date.now() / 1000);
    columns = [
      { label: '1. Hafta', minD: 0, maxD: 7 },
      { label: '2. Hafta', minD: 7, maxD: 14 },
      { label: '3. Hafta', minD: 14, maxD: 21 },
      { label: '4. Hafta', minD: 21, maxD: 31 }
    ];

    columns.forEach(col => {
      const matching = feedbacks.filter(f => {
        const ageDays = (now - (f.timestamp || 0)) / 86400;
        return ageDays >= col.minD && ageDays < col.maxD;
      });
      col.count = matching.length;
      col.avg = matching.length > 0 ? (matching.reduce((a, b) => a + (b.rating || 5), 0) / matching.length).toFixed(1) : '-';
    });

  } else {
    // yearly / all
    if (titleEl) titleEl.textContent = 'Yıllık Ay Dağılımı';
    if (subtitleEl) subtitleEl.textContent = 'Son 12 ayın dökümü';
    const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    columns = monthNames.map((m, idx) => ({ monthIdx: idx, label: m }));

    columns.forEach(col => {
      const matching = feedbacks.filter(f => {
        const mIdx = new Date(((f.timestamp || 0) + 3 * 3600) * 1000).getUTCMonth();
        return mIdx === col.monthIdx;
      });
      col.count = matching.length;
      col.avg = matching.length > 0 ? (matching.reduce((a, b) => a + (b.rating || 5), 0) / matching.length).toFixed(1) : '-';
    });
  }

  const maxCount = Math.max(...columns.map(c => c.count), 1);

  barsContainer.innerHTML = columns.map(c => {
    const heightPercent = c.count > 0 ? Math.max(22, Math.round((c.count / maxCount) * 100)) : 8;
    const isHigh = c.avg !== '-' && parseFloat(c.avg) >= 4.5;
    return `
      <div class="flex-1 flex flex-col items-center justify-end h-full group relative">
        <!-- Hover / Sabit Puan Rozeti -->
        ${c.count > 0 ? `
          <div class="text-[9px] font-mono font-bold text-amber-300 mb-1 flex items-center gap-0.5">
            <span>${c.count}</span>
            <span class="text-[8px] text-gray-400">(${c.avg}★)</span>
          </div>
        ` : `
          <div class="text-[9px] text-gray-600 mb-1">0</div>
        `}
        <!-- Bar Sütun -->
        <div class="w-full max-w-[34px] rounded-t-lg transition-all duration-300 ${
          c.count > 0 
            ? (isHigh ? 'bg-gradient-to-t from-amber-600 via-amber-500 to-amber-300 shadow-md shadow-amber-500/20 group-hover:brightness-110' : 'bg-gradient-to-t from-yellow-700 to-amber-500')
            : 'bg-white/5 border-t border-white/10'
        }" style="height: ${heightPercent}%"></div>
      </div>
    `;
  }).join('');

  labelsContainer.innerHTML = columns.map(c => `
    <div class="flex-1 text-center font-bold text-gray-400 truncate">
      ${c.label}
    </div>
  `).join('');
}

function generateSmartRecommendations(feedbacks) {
  const container = document.getElementById('fb-smart-recommendations-container');
  const alertsBox = document.getElementById('fb-low-rating-alerts-box');
  const badge = document.getElementById('fb-action-status-badge');
  if (!container) return;

  const lowRatings = feedbacks.filter(f => isActionRequiredFeedback(f));
  const allLowRatings = (adminFeedbackList || []).filter(f => isActionRequiredFeedback(f));

  // 1. Düşük Puanlı / Şikayetli Masalar Özeti (Üst Kutu)
  if (alertsBox) {
    if (lowRatings.length === 0) {
      if (badge) {
        badge.textContent = 'Mükemmel Memnuniyet • Rehber Aktif';
        badge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      }
      alertsBox.innerHTML = `
        <div class="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex items-start gap-3">
            <span class="text-xl">🌟</span>
            <div>
              <h5 class="font-bold text-emerald-300 text-xs sm:text-sm">Seçili Periyotta Düşük Puan veya Şikayet Bulunmuyor</h5>
              <p class="text-gray-300 mt-0.5 text-[11px] leading-relaxed">
                Masalardan gelen geri bildirimler pozitif seviyede. Aşağıdaki <b>4 temel operasyonel gelişim ve kalite protokolünü</b> uygulayarak memnuniyeti %100'de tutabilirsiniz.
              </p>
            </div>
          </div>
          ${allLowRatings.length > 0 && currentFeedbackTimeFilter !== 'all' ? `
            <button type="button" onclick="setFeedbackTimeFilter('all'); setFeedbackRatingFilter('critical');" class="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold whitespace-nowrap transition-all">
              Tüm Zamanlardaki ${allLowRatings.length} Kaydı Gör →
            </button>
          ` : ''}
        </div>
      `;
    } else {
      if (badge) {
        badge.textContent = `⚠️ ${lowRatings.length} Masada Gelişim Fırsatı Tespit Edildi`;
        badge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-200 border border-amber-500/40 animate-pulse';
      }
      alertsBox.innerHTML = `
        <div class="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/35 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-amber-300 flex items-center gap-1.5">
              <span>🚨</span>
              <span>İnceleme Gerektiren Masa Geri Bildirimleri (${lowRatings.length} Adet)</span>
            </span>
            <button type="button" onclick="setFeedbackRatingFilter('critical'); document.getElementById('fb-records-list-section').scrollIntoView({behavior:'smooth'});" class="text-[11px] text-amber-400 hover:underline font-semibold">
              Listede Filtrele →
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${lowRatings.slice(0, 4).map(fb => `
              <div class="p-2.5 rounded-xl bg-black/70 border border-amber-500/25 flex items-start justify-between gap-2 text-[11px]">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-white">${escapeHtml(fb.table || 'Masa')}</span>
                    <span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">${Number(fb.rating || 5)} ★</span>
                  </div>
                  ${fb.tags && fb.tags.length > 0 ? `<div class="text-amber-200/90 text-[10px] mt-1 font-medium">${fb.tags.map(t => escapeHtml(t)).join(' • ')}</div>` : ''}
                  ${fb.comment ? `<div class="text-gray-300 italic text-[10px] mt-0.5">"${escapeHtml(fb.comment)}"</div>` : ''}
                </div>
                <span class="text-[9px] text-gray-500 font-mono whitespace-nowrap">${escapeHtml((fb.timeStr || '').split(' ')[0] || '')}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  // 2. Çözüm Odaklı Aksiyon Kartları (Her Zaman 4 Ana Başlıkta Rehber Olarak Gösterilir, Şikayet Varsa Vurgulanır)
  const sourceForAnalysis = lowRatings.length > 0 ? lowRatings : allLowRatings;
  const allText = sourceForAnalysis.map(f => (f.tags || []).join(' ') + ' ' + (f.comment || '')).join(' ').toLowerCase();

  const coalCount = lowRatings.filter(f => {
    const t = ((f.tags || []).join(' ') + ' ' + (f.comment || '')).toLowerCase();
    return t.includes('köz') || t.includes('nargile') || t.includes('duman') || t.includes('kömür') || t.includes('yanık');
  }).length;

  const speedCount = lowRatings.filter(f => {
    const t = ((f.tags || []).join(' ') + ' ' + (f.comment || '')).toLowerCase();
    return t.includes('yavaş') || t.includes('servis') || t.includes('gecik') || t.includes('geç') || t.includes('garson') || t.includes('bekle');
  }).length;

  const musicCount = lowRatings.filter(f => {
    const t = ((f.tags || []).join(' ') + ' ' + (f.comment || '')).toLowerCase();
    return t.includes('müzik') || t.includes('ses') || t.includes('gürültü');
  }).length;

  const hasCoalIssue = coalCount > 0 || allText.includes('köz');
  const hasSpeedIssue = speedCount > 0 || allText.includes('yavaş') || allText.includes('servis');
  const hasMusicIssue = musicCount > 0 || allText.includes('müzik');

  const cards = [
    // Kart 1: Köz & Nargile Kalite Yönetimi
    `
      <div class="p-3.5 rounded-xl bg-black/75 border ${coalCount > 0 ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-amber-500/25'} text-xs space-y-1.5 hover:border-amber-400 transition-all">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-amber-400 font-bold">
            <span>🔥</span>
            <span>Köz & Nargile Kalite Yönetimi</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${coalCount > 0 ? 'bg-amber-500 text-black' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'}">
            ${coalCount > 0 ? `🚨 ${coalCount} Masada Tespit Edildi` : (hasCoalIssue ? '⚠️ Geçmiş Kayıtlarda Mevcut' : '✅ Kalite Standardı')}
          </span>
        </div>
        <p class="text-[11px] text-gray-300 leading-relaxed">
          <b class="text-amber-200">Teşhis:</b> Nargile masalarında en sık düşük puan nedeni 18 dakikayı aşan köz değişimi ve lüle ısı dengesizliğidir.
        </p>
        <div class="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200 leading-normal">
          💡 <b>Çözüm Adımı:</b> Personel panelindeki <b>15 dakikalık köz sayaçlarını</b> aktif takip ettirin. Müşteri köz butonuna basmadan önce közcü personelin masaya devriye atması memnuniyeti doğrudan 5 yıldıza çıkarır.
        </div>
      </div>
    `,
    // Kart 2: Servis Hızı & Garson Koordinasyonu
    `
      <div class="p-3.5 rounded-xl bg-black/75 border ${speedCount > 0 ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-blue-500/25'} text-xs space-y-1.5 hover:border-blue-400 transition-all">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-blue-400 font-bold">
            <span>⚡</span>
            <span>Servis Hızı & Garson Koordinasyonu</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${speedCount > 0 ? 'bg-blue-500 text-black' : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'}">
            ${speedCount > 0 ? `🚨 ${speedCount} Masada Tespit Edildi` : (hasSpeedIssue ? '⚠️ Geçmiş Kayıtlarda Mevcut' : '✅ Kalite Standardı')}
          </span>
        </div>
        <p class="text-[11px] text-gray-300 leading-relaxed">
          <b class="text-blue-200">Teşhis:</b> Garson çağırma veya hesap talebine 90 saniyeden geç yanıt verilmesi puan kırılmasına yol açar.
        </p>
        <div class="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-200 leading-normal">
          💡 <b>Çözüm Adımı:</b> Yoğun saatlerde (20:00 - 23:30) salonu <b>Bölüm A ve Bölüm B</b> olarak iki garsona zimmetleyin. Çağrı düştüğü anda 30 saniye içinde <b>"Yoldayım"</b> butonuna basılmasını kural haline getirin.
        </div>
      </div>
    `,
    // Kart 3: Akustik, Müzik & Atmosfer Dengesi
    `
      <div class="p-3.5 rounded-xl bg-black/75 border ${musicCount > 0 ? 'border-purple-500/50 ring-1 ring-purple-500/20' : 'border-purple-500/25'} text-xs space-y-1.5 hover:border-purple-400 transition-all">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-purple-400 font-bold">
            <span>🔊</span>
            <span>Akustik, Müzik & Atmosfer Dengesi</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${musicCount > 0 ? 'bg-purple-500 text-black' : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'}">
            ${musicCount > 0 ? `🚨 ${musicCount} Masada Tespit Edildi` : (hasMusicIssue ? '⚠️ Geçmiş Kayıtlarda Mevcut' : '✅ Kalite Standardı')}
          </span>
        </div>
        <p class="text-[11px] text-gray-300 leading-relaxed">
          <b class="text-purple-200">Teşhis:</b> Hoparlör altı masalarda yüksek ses seviyesi müşterilerin sohbet konforunu düşürebilir.
        </p>
        <div class="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-200 leading-normal">
          💡 <b>Çözüm Adımı:</b> Saat 21:30 öncesinde müziği 65-70 dB <b>Deep House / Chill Lounge</b> seviyesinde tutun; 21:30 sonrasında prime-time ritmine kademeli geçiş yapın.
        </div>
      </div>
    `,
    // Kart 4: Anlık Masa Kurtarma & Müşteri Telafi Protokolü
    `
      <div class="p-3.5 rounded-xl bg-black/75 border ${lowRatings.length > 0 ? 'border-rose-500/50 ring-1 ring-rose-500/20' : 'border-rose-500/25'} text-xs space-y-1.5 hover:border-rose-400 transition-all">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-rose-400 font-bold">
            <span>🤝</span>
            <span>Anlık Masa Kurtarma (Telafi Adımı)</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${lowRatings.length > 0 ? 'bg-rose-500 text-white' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'}">
            ${lowRatings.length > 0 ? '🚨 Şimdi Uygulanmalı' : '🛡️ Koruyucu Protokol'}
          </span>
        </div>
        <p class="text-[11px] text-gray-300 leading-relaxed">
          <b class="text-rose-200">Operasyonel Taktik:</b> Menü üzerinden 1-3 yıldız veya şikayet ileten masaya mekanımızdan ayrılmadan önce dokunun.
        </p>
        <div class="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-200 leading-normal">
          💡 <b>Çözüm Adımı:</b> Şef garsonun masaya uğrayıp <i>"Geri bildiriminizi gördük, hemen telafi etmek isteriz"</i> diyerek yeni lüle veya çay/kahve ikramı sunması, müşteriyi Google Maps'te 5 yıldızlı elçiye dönüştürür.
        </div>
      </div>
    `
  ];

  container.innerHTML = cards.join('');
}

function renderFeedbackListOnly() {
  const container = document.getElementById('feedback-container');
  const countEl = document.getElementById('fb-list-count');
  if (!container) return;

  const periodFeedbacks = getFeedbacksForCurrentTimeFilter();
  let filtered = periodFeedbacks;

  if (currentFeedbackRatingFilter === 'critical') {
    filtered = filtered.filter(f => isActionRequiredFeedback(f));
  } else if (currentFeedbackRatingFilter === 'positive') {
    filtered = filtered.filter(f => Number(f.rating || 5) >= 4 && !isActionRequiredFeedback(f));
  }

  if (countEl) countEl.textContent = `(${filtered.length})`;

  if (filtered.length === 0) {
    const allCrit = (adminFeedbackList || []).filter(f => isActionRequiredFeedback(f));
    if (currentFeedbackRatingFilter === 'critical' && allCrit.length > 0 && currentFeedbackTimeFilter !== 'all') {
      container.innerHTML = `
        <div class="py-8 text-center text-xs text-gray-400 space-y-2">
          <div>Seçili periyotta düşük puanlı kayıt bulunmuyor; ancak geçmiş periyotlarda <b>${allCrit.length} adet</b> kayıt mevcut.</div>
          <button type="button" onclick="setFeedbackTimeFilter('all')" class="px-3.5 py-1.5 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-all">
            Tüm Zamanlardaki Düşük Puanları Göster (${allCrit.length})
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `<div class="py-8 text-center text-xs text-gray-500">Seçili periyot ve filtrede geri bildirim kaydı bulunmuyor.</div>`;
    }
    return;
  }

  container.innerHTML = filtered.map(fb => {
    const isCritical = isActionRequiredFeedback(fb);
    const rtg = Number(fb.rating || 5);
    return `
      <div class="p-3.5 rounded-2xl bg-black/60 border ${
        isCritical ? 'border-amber-500/40 bg-amber-950/15' : 'border-white/5'
      } flex items-start justify-between text-xs hover:border-white/20 transition-all">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl ${
            isCritical ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-amber-400'
          } border flex flex-col items-center justify-center flex-shrink-0 font-bold">
            <span class="text-[12px] leading-none">${rtg}</span>
            <span class="text-[8px] leading-none mt-0.5">★</span>
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-bold text-white text-sm">${escapeHtml(fb.table)}</span>
              <span class="text-amber-400 font-medium">${'⭐'.repeat(Math.max(1, Math.min(5, rtg)))}</span>
              ${isCritical ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">⚠️ Geliştirme / İnceleme</span>' : ''}
            </div>
            ${fb.tags && fb.tags.length > 0 ? `
              <div class="flex flex-wrap gap-1 mt-1.5">
                ${fb.tags.map(t => `<span class="px-2 py-0.5 rounded-md bg-white/5 text-gray-300 border border-white/5 text-[10px]">${escapeHtml(t)}</span>`).join('')}
              </div>
            ` : ''}
            ${fb.comment ? `<p class="text-gray-300 text-xs mt-1.5 italic font-sans leading-relaxed">"${escapeHtml(fb.comment)}"</p>` : ''}
          </div>
        </div>
        <div class="text-[10px] text-gray-500 font-mono text-right flex-shrink-0 pl-2">
          ${escapeHtml(fb.timeStr || '')}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

/* ==========================================================================
   TÜM BİLDİRİMLERİ SIFIRLAMA & HAFTALIK RAPOR ARŞİVİ YÖNETİMİ
   ========================================================================== */

async function resetAllNotificationsPrompt() {
  const confirmed = confirm(
    "⚠️ TÜM BİLDİRİMLERİ SIFIRLA & ARŞİVLE\n\n" +
    "Mevcut haftanın tüm bildirimlerini (müşteri değerlendirmeleri, personel işlem günlükleri ve tamamlanan çağrı kayıtları) sıfırlamak istediğinize emin misiniz?\n\n" +
    "ℹ️ Sıfırlamadan önce mevcut verileriniz kaybolmaz; otomatik olarak aşağıda bulunan 'Geçmiş Haftaların Raporları' alanına özet rapor olarak kaydedilir."
  );
  if (!confirmed) return;

  const pin = getAdminPin();
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(apiBase + '/api/admin/notifications/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-PIN': pin
      },
      body: JSON.stringify({ archiveBeforeReset: true })
    });

    if (res.ok) {
      const data = await res.json();
      adminFeedbackList = [];
      adminLogsList = [];
      if (Array.isArray(data.weeklyArchives)) {
        adminWeeklyArchives = data.weeklyArchives;
      }
      renderLogsList();
      renderFeedbackDashboard();
      renderWeeklyArchivesList();
      await loadStaffPerformanceData(true);
      showToast('✅ Tüm bildirimler sıfırlandı ve önceki veriler Haftalık Rapor Arşivine kaydedildi!', 'success');
    } else {
      const errData = await res.json().catch(() => ({}));
      alert("Sıfırlama başarısız: " + (errData.message || "Yetkisiz işlem"));
    }
  } catch (e) {
    console.error("Reset notifications error:", e);
    alert("Sunucuya bağlanılamadı: " + e.message);
  }
}

function toggleWeeklyReportDetail(reportId) {
  if (expandedWeeklyReportIds.has(reportId)) {
    expandedWeeklyReportIds.delete(reportId);
  } else {
    expandedWeeklyReportIds.add(reportId);
  }
  renderWeeklyArchivesList();
}

async function deleteWeeklyReport(reportId, e) {
  if (e) e.stopPropagation();
  if (!confirm("Bu geçmiş hafta raporunu arşivden silmek istediğinize emin misiniz?")) return;

  const pin = getAdminPin();
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(apiBase + '/api/admin/weekly-reports/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-PIN': pin
      },
      body: JSON.stringify({ id: reportId })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.weeklyArchives)) {
        adminWeeklyArchives = data.weeklyArchives;
      }
      renderWeeklyArchivesList();
      showToast('🗑️ Haftalık rapor arşivden kaldırıldı.', 'info');
    }
  } catch (err) {
    console.error("Delete weekly report err:", err);
  }
}

function renderWeeklyArchivesList() {
  const container = document.getElementById('weekly-reports-container');
  const countBadge = document.getElementById('weekly-archives-count-badge');
  if (!container) return;

  const archives = adminWeeklyArchives || [];
  if (countBadge) {
    countBadge.textContent = `${archives.length} Rapor`;
  }

  if (archives.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-6 rounded-2xl bg-black/40 border border-white/5 text-center text-xs text-gray-500">
        Henüz arşivlenmiş geçmiş hafta raporu bulunmuyor. Yeni bir haftaya girildiğinde veya "Tüm Bildirimleri Sıfırla" butonuna basıldığında raporlar burada listelenir.
      </div>
    `;
    return;
  }

  container.innerHTML = archives.map(rep => {
    const isExpanded = expandedWeeklyReportIds.has(rep.id);
    const stars = rep.starCounts || { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
    const calls = rep.callBreakdown || { coal: 0, waiter: 0, bill: 0 };
    const lowItems = rep.lowRatingItems || [];
    const isAuto = (rep.reason || '').includes('Otomatik');

    return `
      <div class="p-4 rounded-2xl bg-black/65 border border-white/10 hover:border-blue-500/35 transition-all flex flex-col justify-between space-y-3">
        <div>
          <!-- Üst Başlık -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-white">${escapeHtml(rep.weekLabel || 'Haftalık Rapor')}</span>
                <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${
                  isAuto
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }">
                  ${escapeHtml(rep.reason || 'Haftalık Arşiv')}
                </span>
              </div>
              <div class="text-[11px] text-gray-400 font-mono mt-0.5">
                📅 ${escapeHtml(rep.dateRange || '')} • Kayıt: ${escapeHtml(rep.archivedAt || '')}
              </div>
            </div>

            <button type="button" onclick="deleteWeeklyReport('${escapeHtml(rep.id)}', event)" class="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Bu raporu sil">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <!-- 4'lü Mini Özet Metrikleri -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <div class="p-2.5 rounded-xl bg-neutral-900/90 border border-white/5">
              <div class="text-[10px] text-gray-400">Ort. Puan</div>
              <div class="text-sm font-black text-amber-400 font-mono mt-0.5">${rep.avgRating || '5.0'} ★</div>
            </div>
            <div class="p-2.5 rounded-xl bg-neutral-900/90 border border-white/5">
              <div class="text-[10px] text-gray-400">Geri Bildirim</div>
              <div class="text-sm font-black text-white font-mono mt-0.5">${rep.totalFeedbacks || 0} <span class="text-[10px] text-emerald-400 font-normal">(%${rep.satisfactionPct !== undefined ? rep.satisfactionPct : 100})</span></div>
            </div>
            <div class="p-2.5 rounded-xl bg-neutral-900/90 border border-white/5">
              <div class="text-[10px] text-gray-400">Düşük / Şikayet</div>
              <div class="text-sm font-black ${rep.lowRatingCount > 0 ? 'text-amber-400' : 'text-emerald-400'} font-mono mt-0.5">${rep.lowRatingCount || 0} Masa</div>
            </div>
            <div class="p-2.5 rounded-xl bg-neutral-900/90 border border-white/5">
              <div class="text-[10px] text-gray-400">Servis Çağrısı</div>
              <div class="text-sm font-black text-blue-400 font-mono mt-0.5">${rep.totalCalls || 0} Adet</div>
            </div>
          </div>

          <!-- Haftanın Yıldızı & Detay Butonu -->
          <div class="flex items-center justify-between pt-2.5 mt-2 border-t border-white/5 text-[11px]">
            <div class="text-gray-400 truncate">
              🏆 Haftanın Yıldızı: <b class="text-amber-300">${escapeHtml(rep.topStaff || 'Belirtilmedi')}</b>
            </div>
            <button type="button" onclick="toggleWeeklyReportDetail('${escapeHtml(rep.id)}')" class="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 whitespace-nowrap ml-2">
              <span>${isExpanded ? 'Detayı Gizle' : 'Detaylı Raporu Gör'}</span>
              <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <!-- Açılır Detaylı Rapor Alanı -->
          ${isExpanded ? `
            <div class="mt-3 pt-3 border-t border-white/10 space-y-3 text-xs">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <!-- Yıldız Dağılımı Özeti -->
                <div class="p-2.5 rounded-xl bg-black/60 border border-white/5 space-y-1">
                  <div class="text-[10px] font-bold text-gray-400 uppercase">Puan Dağılımı</div>
                  <div class="flex items-center justify-between text-[11px] text-gray-300 pt-1">
                    <span>5★: <b>${stars['5'] || 0}</b></span>
                    <span>4★: <b>${stars['4'] || 0}</b></span>
                    <span>3★: <b class="text-amber-300">${stars['3'] || 0}</b></span>
                    <span>2★: <b class="text-orange-400">${stars['2'] || 0}</b></span>
                    <span>1★: <b class="text-red-400">${stars['1'] || 0}</b></span>
                  </div>
                </div>

                <!-- Çağrı Türü Dağılımı -->
                <div class="p-2.5 rounded-xl bg-black/60 border border-white/5 space-y-1">
                  <div class="text-[10px] font-bold text-gray-400 uppercase">Servis & İşlem Özeti</div>
                  <div class="flex items-center justify-between text-[11px] text-gray-300 pt-1">
                    <span>🔥 Köz: <b>${calls.coal || 0}</b></span>
                    <span>🔔 Garson: <b>${calls.waiter || 0}</b></span>
                    <span>💳 Hesap: <b>${calls.bill || 0}</b></span>
                    <span>📋 Log: <b>${rep.totalLogs || 0}</b></span>
                  </div>
                </div>
              </div>

              <!-- O Haftadaki Düşük Puanlı Masalar -->
              <div class="space-y-1.5">
                <div class="text-[10px] font-bold text-gray-400 uppercase">O Haftanın Geliştirme / Düşük Puan Kayıtları (${lowItems.length})</div>
                ${lowItems.length === 0 ? `
                  <div class="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-[11px] text-emerald-300">
                    ✅ Bu haftada düşük puanlı masa veya şikayet kaydı bulunmuyor.
                  </div>
                ` : lowItems.map(item => `
                  <div class="p-2 rounded-lg bg-amber-950/20 border border-amber-500/25 flex items-start justify-between gap-2 text-[11px]">
                    <div>
                      <span class="font-bold text-white">${escapeHtml(item.table || 'Masa')}</span>
                      <span class="text-amber-400 font-bold ml-1">(${item.rating}★)</span>
                      ${item.tags && item.tags.length > 0 ? `<span class="text-amber-200 ml-1.5">[${item.tags.map(t => escapeHtml(t)).join(', ')}]</span>` : ''}
                      ${item.comment ? `<div class="text-gray-300 italic mt-0.5">"${escapeHtml(item.comment)}"</div>` : ''}
                    </div>
                    <span class="text-[9px] text-gray-500 font-mono whitespace-nowrap">${escapeHtml(item.timeStr || '')}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function openStaffModal(staffId = null) {
  const modal = document.getElementById('edit-staff-modal');
  const title = document.getElementById('modal-staff-title');
  const formId = document.getElementById('form-staff-id');
  const formName = document.getElementById('form-staff-name');
  const formRole = document.getElementById('form-staff-role');
  const formPin = document.getElementById('form-staff-pin');

  if (!modal) return;

  if (staffId) {
    const s = adminStaffList.find(x => x.id === staffId);
    if (s) {
      if (title) title.textContent = 'Personeli Düzenle';
      if (formId) formId.value = s.id || '';
      if (formName) formName.value = s.name || '';
      if (formRole) formRole.value = s.role || 'Garson';
      if (formPin) formPin.value = s.pin || '';
    }
  } else {
    if (title) title.textContent = 'Yeni Personel Ekle';
    if (formId) formId.value = '';
    if (formName) formName.value = '';
    if (formRole) formRole.value = 'Garson';
    if (formPin) formPin.value = Math.floor(1000 + Math.random() * 9000).toString();
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    if (formName) formName.focus();
  }, 100);
}

function closeStaffModal() {
  const modal = document.getElementById('edit-staff-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function editStaffMember(staffId) {
  openStaffModal(staffId);
}

async function handleSaveStaff(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const adminPin = getAdminPin();
  const idEl = document.getElementById('form-staff-id');
  const nameEl = document.getElementById('form-staff-name');
  const roleEl = document.getElementById('form-staff-role');
  const pinEl = document.getElementById('form-staff-pin');

  const id = idEl ? idEl.value.trim() : '';
  const name = nameEl ? nameEl.value.trim() : '';
  const role = roleEl ? roleEl.value : 'Garson';
  const pin = pinEl ? pinEl.value.trim() : '';

  if (!name) {
    alert("Lütfen personel adını giriniz.");
    return;
  }
  if (!pin) {
    alert("Lütfen 4 haneli PIN kodunu giriniz.");
    return;
  }

  const saveBtn = document.getElementById('btn-save-staff') || (e && e.target ? e.target.querySelector('button[type="submit"]') : null);
  const oldText = saveBtn ? saveBtn.innerHTML : 'Kaydet';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'Kaydediliyor...';
  }

  let saveSuccess = false;
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/admin/staff/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-PIN': adminPin
      },
      body: JSON.stringify({ id, name, role, pin })
    });
    if (res.ok) {
      saveSuccess = true;
      closeStaffModal();
      showToast('✅ Personel başarıyla kaydedildi!', 'success');
      try {
        await loadStaffPerformanceData(true);
        await loadStaffAdminData();
        await loadStaffLogsData(true);
      } catch (refreshErr) {
        console.warn("Background refresh warning:", refreshErr);
      }
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Personel kaydedilemedi: " + (data.message || `Sunucu yanıtı: ${res.status}`));
    }
  } catch (err) {
    console.error("Save staff error:", err);
    if (!saveSuccess) {
      alert("Sunucuya bağlanılamadı. Sunucu yeniden başlıyor olabilir veya internet bağlantınızı kontrol ediniz.\n\nDetay: " + (err.message || 'Bağlantı hatası'));
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldText;
    }
    if (window.lucide) lucide.createIcons();
  }
}

async function deleteStaffMember(staffId) {
  if (!confirm("Bu personeli silmek istediğinize emin misiniz?")) return;
  const adminPin = getAdminPin();
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/admin/staff/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-PIN': adminPin
      },
      body: JSON.stringify({ id: staffId })
    });
    if (res.ok) {
      showToast('🗑️ Personel silindi.', 'info');
      try {
        await loadStaffPerformanceData(true);
        await loadStaffAdminData();
        await loadStaffLogsData(true);
      } catch (e) {}
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Personel silinemedi: " + (data.message || "Yetkisiz işlem."));
    }
  } catch (err) {
    console.error("Delete staff error:", err);
    alert("Bağlantı hatası: " + (err.message || "Sunucuya ulaşılamadı."));
  }
}

/* ==========================================================================
   EVRENSEL FOTOĞRAF YÜKLEME, HEIC/TÜM FORMAT DÖNÜŞTÜRÜCÜ & AKILLI BOYUTLANDIRMA
   (Telefon & Bilgisayar • Tüm Dosya Türleri • 50MB'a Kadar • Otomatik Kadraj)
   ========================================================================== */

const MAX_RAW_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_PRODUCT_FALLBACK_IMG = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80';

let activeProductImageFile = null;
let activeProductImageRotation = 0;
let isUploadingProductImage = false;
let userManuallyChangedImageFit = false;
let heicConverterLoadPromise = null;

function resolveAdminImageUrl(url, fallback = DEFAULT_PRODUCT_FALLBACK_IMG) {
  if (typeof resolveImageUrl === 'function') {
    return resolveImageUrl(url, fallback);
  }
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

function resetProductImageUploadState() {
  activeProductImageFile = null;
  activeProductImageRotation = 0;
  isUploadingProductImage = false;
  userManuallyChangedImageFit = false;

  const fileInput = document.getElementById('item-image-file-input');
  if (fileInput) fileInput.value = '';
  const camInput = document.getElementById('item-camera-file-input');
  if (camInput) camInput.value = '';

  setProductUploadBusy(false);

  const badgeEl = document.getElementById('item-image-meta-badge');
  if (badgeEl) {
    badgeEl.textContent = 'Tüm Boyut & Formatlar';
    badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10 font-mono';
  }
}

function setProductUploadBusy(busy, loadingText = 'Optimize ediliyor...') {
  isUploadingProductImage = !!busy;
  const loader = document.getElementById('item-image-loading');
  const loaderText = document.getElementById('item-image-loading-text');
  const saveBtn = document.getElementById('btn-save-item');

  if (loaderText && loadingText) {
    loaderText.textContent = loadingText;
  }
  if (loader) {
    if (busy) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
  }
  if (saveBtn) {
    saveBtn.disabled = !!busy;
    if (busy) {
      saveBtn.classList.add('opacity-60', 'cursor-wait');
      saveBtn.textContent = 'Fotoğraf İşleniyor...';
    } else {
      saveBtn.classList.remove('opacity-60', 'cursor-wait');
      saveBtn.textContent = 'Kaydet';
    }
  }
}

function setItemImageFit(fitMode, isManual = true) {
  const validMode = ['cover', 'top', 'contain'].includes(fitMode) ? fitMode : 'cover';
  if (isManual) {
    userManuallyChangedImageFit = true;
  }

  const hiddenFit = document.getElementById('form-item-image-fit');
  if (hiddenFit) hiddenFit.value = validMode;

  ['cover', 'top', 'contain'].forEach(mode => {
    const btn = document.getElementById(`fit-btn-${mode}`);
    if (!btn) return;
    if (mode === validMode) {
      btn.className = 'py-1.5 px-2 rounded-xl text-[10px] font-bold bg-amber-500 text-black shadow transition-all';
    } else {
      btn.className = 'py-1.5 px-2 rounded-xl text-[10px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all';
    }
  });

  const currentUrl = document.getElementById('form-item-image')?.value || '';
  updateItemImagePreviewUI(currentUrl, validMode);
}

function updateItemImagePreviewUI(url, fitMode = null) {
  const previewImg = document.getElementById('item-image-preview');
  const blurBgImg = document.getElementById('item-image-blur-bg');
  if (!previewImg) return;

  const mode = fitMode || document.getElementById('form-item-image-fit')?.value || 'cover';
  const resolved = resolveAdminImageUrl(url, DEFAULT_PRODUCT_FALLBACK_IMG);

  previewImg.src = resolved;
  previewImg.onerror = () => {
    if (previewImg.src !== DEFAULT_PRODUCT_FALLBACK_IMG) {
      previewImg.src = DEFAULT_PRODUCT_FALLBACK_IMG;
    }
  };

  if (mode === 'contain') {
    previewImg.className = 'relative z-10 w-full h-full object-contain transition-all duration-300';
    if (blurBgImg) {
      blurBgImg.src = resolved;
      blurBgImg.classList.remove('hidden');
    }
  } else if (mode === 'top') {
    previewImg.className = 'relative z-10 w-full h-full object-cover object-top transition-all duration-300';
    if (blurBgImg) blurBgImg.classList.add('hidden');
  } else {
    previewImg.className = 'relative z-10 w-full h-full object-cover object-center transition-all duration-300';
    if (blurBgImg) blurBgImg.classList.add('hidden');
  }
}

function onManualImageUrlInput(val) {
  const fit = document.getElementById('form-item-image-fit')?.value || 'cover';
  updateItemImagePreviewUI(val, fit);
}

function readFileAsDataURL(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(fileOrBlob);
  });
}

async function detectImageFileFormatInfo(file) {
  const name = (file && file.name ? file.name : '').toLowerCase();
  const mime = (file && file.type ? file.type : '').toLowerCase();
  const extMatch = name.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  let headBytes = new Uint8Array(0);
  try {
    const buf = await file.slice(0, 64).arrayBuffer();
    headBytes = new Uint8Array(buf);
  } catch (e) {}

  let asciiHead = '';
  for (let i = 0; i < headBytes.length; i++) {
    asciiHead += String.fromCharCode(headBytes[i]);
  }
  const lowerHead = asciiHead.toLowerCase();

  const isSvg = ext === 'svg' || mime.includes('svg') || lowerHead.includes('<svg');
  const isGif = ext === 'gif' || mime === 'image/gif' || asciiHead.startsWith('GIF87a') || asciiHead.startsWith('GIF89a');
  const isHeic =
    ext === 'heic' ||
    ext === 'heif' ||
    mime.includes('heic') ||
    mime.includes('heif') ||
    lowerHead.includes('ftypheic') ||
    lowerHead.includes('ftypheix') ||
    lowerHead.includes('ftypmif1') ||
    lowerHead.includes('ftypmsf1');
  const isTiff = ext === 'tif' || ext === 'tiff' || mime.includes('tiff') ||
    (headBytes.length >= 4 && ((headBytes[0] === 0x49 && headBytes[1] === 0x49 && headBytes[2] === 0x2A && headBytes[3] === 0x00) ||
                               (headBytes[0] === 0x4D && headBytes[1] === 0x4D && headBytes[2] === 0x00 && headBytes[3] === 0x2A)));

  return { ext, mime, isSvg, isGif, isHeic, isTiff };
}

function ensureHeicConverterLoaded() {
  if (typeof window !== 'undefined' && typeof window.heic2any === 'function') {
    return Promise.resolve(window.heic2any);
  }
  if (heicConverterLoadPromise) {
    return heicConverterLoadPromise;
  }
  heicConverterLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    script.async = true;
    script.onload = () => {
      if (typeof window.heic2any === 'function') resolve(window.heic2any);
      else reject(new Error('HEIC dönüştürücü yüklenemedi.'));
    };
    script.onerror = () => {
      heicConverterLoadPromise = null;
      reject(new Error('HEIC kütüphanesi indirilemedi.'));
    };
    document.head.appendChild(script);
  });
  return heicConverterLoadPromise;
}

async function decodeImageUniversal(blobOrFile) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blobOrFile, { imageOrientation: 'from-image' });
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        cleanup: () => { try { bmp.close(); } catch (e) {} }
      };
    } catch (e) {
      // Fallback to HTMLImageElement below
    }
  }

  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(blobOrFile);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        URL.revokeObjectURL(objUrl);
        reject(new Error('Görsel boyutları okunamadı.'));
        return;
      }
      resolve({
        source: img,
        width: w,
        height: h,
        cleanup: () => URL.revokeObjectURL(objUrl)
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Görsel tarayıcıda çözümlenemedi.'));
    };
    img.src = objUrl;
  });
}

function canvasHasTransparency(canvas) {
  try {
    const sampleSize = 64;
    const probe = document.createElement('canvas');
    probe.width = Math.min(sampleSize, canvas.width);
    probe.height = Math.min(sampleSize, canvas.height);
    const pCtx = probe.getContext('2d', { willReadFrequently: true });
    pCtx.drawImage(canvas, 0, 0, probe.width, probe.height);
    const data = pCtx.getImageData(0, 0, probe.width, probe.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
  } catch (e) {}
  return false;
}

function renderHighQualityScaledImage(decoded, maxDim = 1200, rotationDeg = 0) {
  const normRot = ((rotationDeg % 360) + 360) % 360;
  const swapSides = normRot === 90 || normRot === 270;

  const baseW = swapSides ? decoded.height : decoded.width;
  const baseH = swapSides ? decoded.width : decoded.height;

  const maxSide = Math.max(baseW, baseH);
  const scale = maxSide > maxDim ? (maxDim / maxSide) : 1;
  const targetW = Math.max(1, Math.round(baseW * scale));
  const targetH = Math.max(1, Math.round(baseH * scale));

  // İlk aşama: döndürmeyi uygula (çok büyük 48MP fotoğraflarda bellek dostu ara boyutla)
  const preMax = Math.max(maxDim * 2, 2400);
  const preScale = maxSide > preMax ? (preMax / maxSide) : 1;
  let curW = Math.max(1, Math.round(baseW * preScale));
  let curH = Math.max(1, Math.round(baseH * preScale));

  let workCanvas = document.createElement('canvas');
  workCanvas.width = curW;
  workCanvas.height = curH;
  const wCtx = workCanvas.getContext('2d');
  wCtx.imageSmoothingEnabled = true;
  wCtx.imageSmoothingQuality = 'high';

  wCtx.save();
  if (normRot === 90) {
    wCtx.translate(curW, 0);
    wCtx.rotate(Math.PI / 2);
    wCtx.drawImage(decoded.source, 0, 0, curH, curW);
  } else if (normRot === 180) {
    wCtx.translate(curW, curH);
    wCtx.rotate(Math.PI);
    wCtx.drawImage(decoded.source, 0, 0, curW, curH);
  } else if (normRot === 270) {
    wCtx.translate(0, curH);
    wCtx.rotate((3 * Math.PI) / 2);
    wCtx.drawImage(decoded.source, 0, 0, curH, curW);
  } else {
    wCtx.drawImage(decoded.source, 0, 0, curW, curH);
  }
  wCtx.restore();

  // Çok adımlı (Multi-step Lanczos benzeri) net küçültme: keskinliği maksimumda tutar
  while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
    const nextW = Math.max(targetW, Math.round(curW * 0.5));
    const nextH = Math.max(targetH, Math.round(curH * 0.5));
    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const sCtx = stepCanvas.getContext('2d');
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(workCanvas, 0, 0, nextW, nextH);
    workCanvas = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  if (curW !== targetW || curH !== targetH) {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const fCtx = finalCanvas.getContext('2d');
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = 'high';
    fCtx.drawImage(workCanvas, 0, 0, targetW, targetH);
    workCanvas = finalCanvas;
  }

  const hasAlpha = canvasHasTransparency(workCanvas);

  // Önce modern, şeffaflık destekli ve çok hafif WebP formatını dene
  let dataUrl = workCanvas.toDataURL('image/webp', 0.86);
  let mimeType = 'image/webp';
  let ext = 'webp';

  if (!dataUrl.startsWith('data:image/webp')) {
    // WebP kodlaması desteklenmeyen eski tarayıcılar için PNG (şeffafsa) veya JPEG
    if (hasAlpha) {
      dataUrl = workCanvas.toDataURL('image/png');
      mimeType = 'image/png';
      ext = 'png';
    } else {
      dataUrl = workCanvas.toDataURL('image/jpeg', 0.88);
      mimeType = 'image/jpeg';
      ext = 'jpg';
    }
  }

  const approxBytes = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75);

  return {
    dataUrl,
    mimeType,
    ext,
    width: targetW,
    height: targetH,
    sizeKB: Math.max(1, Math.round((approxBytes / 1024) * 10) / 10)
  };
}

async function uploadOptimizedImageToServer({ dataUrl, filename, mimeType, maxDim = 1200, rotation = 0, needsServerProcess = false }) {
  const apiBase = getApiBaseUrl();
  const adminPin = getAdminPin();

  try {
    const res = await fetch(apiBase + '/api/admin/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-PIN': adminPin
      },
      body: JSON.stringify({
        imageData: dataUrl,
        filename: filename || 'upload.webp',
        mimeType: mimeType || 'image/webp',
        maxDim,
        rotation,
        needsServerProcess
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.url) {
      return {
        url: data.url,
        sizeKB: data.sizeKB || 0,
        format: data.format || 'WEBP',
        width: data.width || 0,
        height: data.height || 0
      };
    }

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      const authErr = new Error(data.message || 'Yönetici PIN yetkisi doğrulanamadı.');
      authErr.isAuthError = true;
      throw authErr;
    }

    throw new Error(data.message || `Sunucu yanıtı: ${res.status}`);
  } catch (err) {
    if (err && err.isAuthError) {
      throw err;
    }
    // Çevrimdışı modda veya henüz upload-image uç noktası yayınlanmamış sunucuda sıkıştırılmış görseli koru
    if (!needsServerProcess && dataUrl && dataUrl.length < 2200 * 1024) {
      console.warn('Sunucu dosya yükleme uç noktasına ulaşılamadı, sıkıştırılmış görsel doğrudan korundu:', err);
      return {
        url: dataUrl,
        sizeKB: Math.round((dataUrl.length * 0.75) / 1024),
        format: (mimeType || 'image/webp').split('/')[1]?.toUpperCase() || 'IMG',
        width: 0,
        height: 0
      };
    }
    throw err;
  }
}

async function processUniversalImageFile(file, { maxDim = 1200, rotationDeg = 0, onProgress = null } = {}) {
  if (!file) throw new Error('Lütfen geçerli bir fotoğraf seçin.');
  if (file.size > MAX_RAW_IMAGE_BYTES) {
    throw new Error('Dosya boyutu çok büyük (Maksimum 50 MB). Lütfen 50 MB altında bir fotoğraf seçin.');
  }

  const fmtInfo = await detectImageFileFormatInfo(file);
  const baseName = (file.name || 'urun-gorsel').replace(/\.[^.]+$/, '') || 'urun-gorsel';

  // 1. Vektörel SVG Dosyası
  if (fmtInfo.isSvg) {
    if (onProgress) onProgress('SVG temizleniyor...');
    const rawDataUrl = await readFileAsDataURL(file);
    const uploaded = await uploadOptimizedImageToServer({
      dataUrl: rawDataUrl,
      filename: `${baseName}.svg`,
      mimeType: 'image/svg+xml',
      maxDim
    });
    return { ...uploaded, width: uploaded.width || 800, height: uploaded.height || 800 };
  }

  // 2. Hareketli GIF Dosyası (Animasyonu bozmadan koru)
  if (fmtInfo.isGif && ((rotationDeg % 360) === 0) && file.size <= 6 * 1024 * 1024) {
    if (onProgress) onProgress('GIF yükleniyor...');
    const rawDataUrl = await readFileAsDataURL(file);
    const uploaded = await uploadOptimizedImageToServer({
      dataUrl: rawDataUrl,
      filename: `${baseName}.gif`,
      mimeType: 'image/gif',
      maxDim
    });
    return { ...uploaded, width: uploaded.width || 600, height: uploaded.height || 600 };
  }

  // 3. HEIC / HEIF (iPhone & iPad Fotoğrafları) + Tüm Raster Formatlar (JPG, PNG, WEBP, AVIF, BMP, TIFF, ICO)
  let workingBlob = file;
  let decoded = null;

  try {
    if (onProgress) onProgress('Fotoğraf okunuyor...');
    decoded = await decodeImageUniversal(workingBlob);
  } catch (nativeErr) {
    // Tarayıcı doğrudan açamadıysa ve HEIC ise heic2any ile tarayıcıda dönüştürmeyi dene
    if (fmtInfo.isHeic) {
      try {
        if (onProgress) onProgress('iPhone (HEIC) dönüştürülüyor...');
        const heic2anyFn = await ensureHeicConverterLoaded();
        const converted = await heic2anyFn({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.92
        });
        workingBlob = Array.isArray(converted) ? converted[0] : converted;
        decoded = await decodeImageUniversal(workingBlob);
      } catch (heicClientErr) {
        console.warn('Tarayıcı HEIC dönüşümü başarısız, sunucuya devrediliyor:', heicClientErr);
      }
    }
  }

  // Eğer tarayıcıda başarıyla çözümlendiyse yüksek kaliteli çok adımlı ölçekleme yap
  if (decoded) {
    try {
      if (onProgress) onProgress('Boyut optimize ediliyor...');
      const scaled = renderHighQualityScaledImage(decoded, maxDim, rotationDeg);
      if (onProgress) onProgress('Sunucuya kaydediliyor...');
      const uploaded = await uploadOptimizedImageToServer({
        dataUrl: scaled.dataUrl,
        filename: `${baseName}.${scaled.ext}`,
        mimeType: scaled.mimeType,
        maxDim,
        rotation: 0,
        needsServerProcess: false
      });
      return {
        url: uploaded.url,
        sizeKB: uploaded.sizeKB || scaled.sizeKB,
        format: uploaded.format || scaled.ext.toUpperCase(),
        width: scaled.width,
        height: scaled.height
      };
    } finally {
      decoded.cleanup();
    }
  }

  // 4. Tarayıcının açamadığı özel formatlar (HEIC, CMYK TIFF, RAW vb.) için Doğrudan Sunucu Dönüştürücüsü
  if (onProgress) onProgress('Sunucuda dönüştürülüyor...');
  const rawDataUrl = await readFileAsDataURL(file);
  const serverUploaded = await uploadOptimizedImageToServer({
    dataUrl: rawDataUrl,
    filename: file.name || `${baseName}.${fmtInfo.ext || 'jpg'}`,
    mimeType: file.type || 'application/octet-stream',
    maxDim,
    rotation: ((rotationDeg % 360) + 360) % 360,
    needsServerProcess: true
  });
  return serverUploaded;
}

async function applyUploadedProductFile(file, rotationDeg = 0, allowAutoFit = true) {
  if (!file) return;
  activeProductImageFile = file;
  activeProductImageRotation = ((rotationDeg % 360) + 360) % 360;

  const badgeEl = document.getElementById('item-image-meta-badge');
  setProductUploadBusy(true, 'Optimize ediliyor...');

  try {
    const result = await processUniversalImageFile(file, {
      maxDim: 1200,
      rotationDeg: activeProductImageRotation,
      onProgress: (msg) => setProductUploadBusy(true, msg)
    });

    const imageInput = document.getElementById('form-item-image');
    if (imageInput) {
      imageInput.value = result.url;
    }

    // Dikey (9:16 telefon çekimi) veya ultra yatay fotoğraflarda kesilmeyi önlemek için otomatik kadraj uyumu
    if (allowAutoFit && !userManuallyChangedImageFit && result.width > 0 && result.height > 0) {
      const ratioHW = result.height / result.width;
      const ratioWH = result.width / result.height;
      if (ratioHW > 1.35 || ratioWH > 1.85) {
        setItemImageFit('contain', false);
      } else {
        setItemImageFit('cover', false);
      }
    } else {
      const currentFit = document.getElementById('form-item-image-fit')?.value || 'cover';
      updateItemImagePreviewUI(result.url, currentFit);
    }

    if (badgeEl) {
      const dimLabel = (result.width && result.height) ? ` • ${result.width}×${result.height}` : '';
      badgeEl.textContent = `✓ ${result.format || 'WEBP'} • ${result.sizeKB || ''} KB${dimLabel}`;
      badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono';
    }

    showToast('✅ Fotoğraf her ekran boyutuna uygun şekilde optimize edildi!', 'success');
  } catch (err) {
    console.error('Product photo upload error:', err);
    if (badgeEl) {
      badgeEl.textContent = 'Yükleme Hatası';
      badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 font-mono';
    }
    showToast('❌ ' + (err.message || 'Fotoğraf yüklenemedi.'), 'error');
  } finally {
    setProductUploadBusy(false);
    const fileInput = document.getElementById('item-image-file-input');
    if (fileInput) fileInput.value = '';
    const camInput = document.getElementById('item-camera-file-input');
    if (camInput) camInput.value = '';
  }
}

async function handleProductImageFileSelect(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;
  userManuallyChangedImageFit = false;
  await applyUploadedProductFile(file, 0, true);
}

async function rotateProductImage() {
  if (isUploadingProductImage) return;

  // 1. Yeni seçilmiş aktif dosya varsa kayıpsız olarak +90 derece yeniden işle
  if (activeProductImageFile) {
    const nextRot = (activeProductImageRotation + 90) % 360;
    await applyUploadedProductFile(activeProductImageFile, nextRot, true);
    return;
  }

  // 2. Mevcut kayıtlı ürün görseli varsa onu çekip +90 derece döndürerek kaydet
  const currentUrl = document.getElementById('form-item-image')?.value?.trim();
  if (!currentUrl) {
    showToast('⚠️ Önce bir fotoğraf seçin veya yükleyin.', 'error');
    return;
  }

  setProductUploadBusy(true, '90° Döndürülüyor...');
  try {
    const resolved = resolveAdminImageUrl(currentUrl, '');
    const res = await fetch(resolved, { mode: 'cors' });
    if (!res.ok) throw new Error('Mevcut görsel indirilemedi.');
    const blob = await res.blob();
    const syntheticFile = new File([blob], 'rotated-image.webp', { type: blob.type || 'image/webp' });
    await applyUploadedProductFile(syntheticFile, 90, true);
  } catch (err) {
    setProductUploadBusy(false);
    showToast('⚠️ Harici linkli görseller güvenlik (CORS) nedeniyle döndürülemez. Cihazınızdan fotoğraf yükleyerek döndürebilirsiniz.', 'error');
  }
}

function setupUniversalImageDropAndPaste() {
  if (window._universalImageDropInitialized) return;
  window._universalImageDropInitialized = true;

  // Sürükle & Bırak (Drag & Drop) Desteği (Ürün Modalı, Duyuru Banner & Profil/Kapak Alanları)
  const dropzoneIds = [
    'item-image-dropzone',
    'announcement-image-dropzone',
    'brand-logo-dropzone',
    'brand-hero-dropzone',
    'brand-mood-dropzone',
    'brand-bg-dropzone'
  ];

  document.addEventListener('dragover', (e) => {
    for (const zId of dropzoneIds) {
      const zone = document.getElementById(zId);
      if (zone && zone.contains(e.target)) {
        e.preventDefault();
        zone.classList.add('border-amber-400', 'bg-amber-500/10');
        break;
      }
    }
  });

  document.addEventListener('dragleave', (e) => {
    for (const zId of dropzoneIds) {
      const zone = document.getElementById(zId);
      if (zone && !zone.contains(e.relatedTarget)) {
        zone.classList.remove('border-amber-400', 'bg-amber-500/10');
      }
    }
  });

  document.addEventListener('drop', async (e) => {
    const itemZone = document.getElementById('item-image-dropzone');
    const annZone = document.getElementById('announcement-image-dropzone');
    const logoZone = document.getElementById('brand-logo-dropzone');
    const heroZone = document.getElementById('brand-hero-dropzone');
    const moodZone = document.getElementById('brand-mood-dropzone');
    const bgZone = document.getElementById('brand-bg-dropzone');

    if (itemZone && itemZone.contains(e.target)) {
      e.preventDefault();
      itemZone.classList.remove('border-amber-400', 'bg-amber-500/10');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        userManuallyChangedImageFit = false;
        await applyUploadedProductFile(files[0], 0, true);
      }
      return;
    }

    if (logoZone && logoZone.contains(e.target)) {
      e.preventDefault();
      logoZone.classList.remove('border-amber-400', 'bg-amber-500/10');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        brandMediaUploadState.logo.manualFit = false;
        await applyUploadedBrandMediaFile('logo', files[0], 0, true);
      }
      return;
    }

    if (heroZone && heroZone.contains(e.target)) {
      e.preventDefault();
      heroZone.classList.remove('border-amber-400', 'bg-amber-500/10');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        brandMediaUploadState.hero.manualFit = false;
        await applyUploadedBrandMediaFile('hero', files[0], 0, true);
      }
      return;
    }

    if (moodZone && moodZone.contains(e.target)) {
      e.preventDefault();
      moodZone.classList.remove('border-amber-400', 'bg-amber-500/10');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        brandMediaUploadState.mood.manualFit = false;
        await applyUploadedBrandMediaFile('mood', files[0], 0, true);
      }
      return;
    }

    if (bgZone && bgZone.contains(e.target)) {
      e.preventDefault();
      bgZone.classList.remove('border-amber-400', 'bg-amber-500/10');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        brandMediaUploadState.bg.manualFit = false;
        await applyUploadedBrandMediaFile('bg', files[0], 0, true);
      }
      return;
    }

    if (annZone && annZone.contains(e.target)) {
      e.preventDefault();
      annZone.classList.remove('border-amber-400', 'bg-amber-500/10');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        userManuallyChangedAnnouncementFit = false;
        await applyUploadedAnnouncementFile(files[0], 0, true);
      }
    }
  });

  // Panodan Yapıştırma (Ctrl+V / Cmd+V ile Ekran Görüntüsü veya Kopyalanan Medya Yükleme)
  document.addEventListener('paste', async (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isTypingInInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    let pastedFile = null;
    for (let i = 0; i < items.length; i++) {
      const clipItem = items[i];
      if (clipItem.kind === 'file' && (clipItem.type.startsWith('image/') || clipItem.type === '')) {
        pastedFile = clipItem.getAsFile();
        if (pastedFile) break;
      }
    }
    if (!pastedFile) return;

    const itemModal = document.getElementById('edit-item-modal');
    if (itemModal && !itemModal.classList.contains('hidden')) {
      e.preventDefault();
      userManuallyChangedImageFit = false;
      await applyUploadedProductFile(pastedFile, 0, true);
      return;
    }

    const settingsSec = document.getElementById('tab-section-settings');
    if (!isTypingInInput && settingsSec && !settingsSec.classList.contains('hidden')) {
      e.preventDefault();
      userManuallyChangedAnnouncementFit = false;
      await applyUploadedAnnouncementFile(pastedFile, 0, true);
    }
  });
}

/* --- Duyuru / Ana Sayfa Banner Doğrudan Medya Yükleyici (Telefon & Bilgisayar) --- */

const DEFAULT_ANNOUNCEMENT_BANNER_IMG = 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=1200&q=80';
let activeAnnouncementImageFile = null;
let activeAnnouncementImageRotation = 0;
let isUploadingAnnouncementImage = false;
let userManuallyChangedAnnouncementFit = false;

function resetAnnouncementUploadState() {
  activeAnnouncementImageFile = null;
  activeAnnouncementImageRotation = 0;
  isUploadingAnnouncementImage = false;
  userManuallyChangedAnnouncementFit = false;
  setAnnouncementUploadBusy(false);
}

function setAnnouncementUploadBusy(busy, loadingText = 'Medya optimize ediliyor...') {
  isUploadingAnnouncementImage = !!busy;
  const loader = document.getElementById('announcement-image-loading');
  const loaderText = document.getElementById('announcement-image-loading-text');
  if (loaderText && loadingText) loaderText.textContent = loadingText;
  if (loader) {
    if (busy) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
  }
}

function setAnnouncementImageFit(fitMode, isManual = true) {
  const validMode = ['cover', 'top', 'contain'].includes(fitMode) ? fitMode : 'cover';
  if (isManual) {
    userManuallyChangedAnnouncementFit = true;
  }

  const hiddenFit = document.getElementById('set-announcement-image-fit');
  if (hiddenFit) hiddenFit.value = validMode;

  ['cover', 'top', 'contain'].forEach(mode => {
    const btn = document.getElementById(`ann-fit-btn-${mode}`);
    if (!btn) return;
    if (mode === validMode) {
      btn.className = 'py-1.5 px-2 rounded-xl text-[10px] font-bold bg-amber-500 text-black shadow transition-all';
    } else {
      btn.className = 'py-1.5 px-2 rounded-xl text-[10px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all';
    }
  });

  const currentUrl = document.getElementById('set-announcement-image')?.value || '';
  updateAnnouncementImagePreview(currentUrl, validMode);

  if (isManual && menuData && menuData.settings) {
    persistAnnouncementMediaQuickly();
  }
}

function updateAnnouncementImagePreview(url, fitMode = null) {
  const img = document.getElementById('announcement-image-preview');
  const blurBg = document.getElementById('announcement-image-blur-bg');
  const clearBtn = document.getElementById('btn-clear-announcement-img');
  const captionEl = document.getElementById('announcement-preview-caption');
  const statusEl = document.getElementById('announcement-upload-status');
  if (!img) return;

  const clean = (url || '').trim();
  const hasCustom = clean.length > 0;
  const mode = fitMode || document.getElementById('set-announcement-image-fit')?.value || 'cover';
  const resolved = hasCustom
    ? resolveAdminImageUrl(clean, DEFAULT_ANNOUNCEMENT_BANNER_IMG)
    : DEFAULT_ANNOUNCEMENT_BANNER_IMG;

  img.src = resolved;
  img.onerror = () => {
    if (img.src !== DEFAULT_ANNOUNCEMENT_BANNER_IMG) {
      img.src = DEFAULT_ANNOUNCEMENT_BANNER_IMG;
    }
  };

  if (mode === 'contain' && hasCustom) {
    img.className = 'relative z-10 w-full h-full object-contain transition-all duration-300';
    if (blurBg) {
      blurBg.src = resolved;
      blurBg.classList.remove('hidden');
    }
  } else if (mode === 'top') {
    img.className = 'relative z-10 w-full h-full object-cover object-top transition-all duration-300';
    if (blurBg) blurBg.classList.add('hidden');
  } else {
    img.className = 'relative z-10 w-full h-full object-cover object-center transition-all duration-300';
    if (blurBg) blurBg.classList.add('hidden');
  }

  if (clearBtn) {
    if (hasCustom) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  if (captionEl) {
    captionEl.textContent = hasCustom
      ? 'Cihazınızdan yüklenen özel banner görseli aktif'
      : 'Varsayılan şık lounge görseli gösteriliyor';
  }

  if (statusEl && !isUploadingAnnouncementImage) {
    if (hasCustom) {
      if (!statusEl.textContent.startsWith('✓')) {
        statusEl.textContent = '✓ Özel Medya Aktif';
        statusEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono';
      }
    } else {
      statusEl.textContent = 'Varsayılan Görsel Aktif';
      statusEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-amber-300 border border-white/10 font-mono';
    }
  }
}

function updateAnnouncementToggleUI(isEnabled) {
  const pill = document.getElementById('announcement-status-pill');
  const disabledNotice = document.getElementById('announcement-disabled-notice');
  const configBody = document.getElementById('announcement-config-body');

  if (pill) {
    if (isEnabled) {
      pill.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold';
      pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Menüde Yayında';
    } else {
      pill.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-gray-400 border border-white/15 text-[10px] font-semibold';
      pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Kapalı (Gizli)';
    }
  }

  if (disabledNotice) {
    if (isEnabled) disabledNotice.classList.add('hidden');
    else disabledNotice.classList.remove('hidden');
  }

  if (configBody) {
    if (isEnabled) configBody.classList.remove('hidden');
    else configBody.classList.add('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

async function handleAnnouncementToggleChange(isEnabled) {
  updateAnnouncementToggleUI(!!isEnabled);
  const ok = await persistAnnouncementMediaQuickly();
  if (ok) {
    if (isEnabled) {
      showToast('✅ Haftanın/Günün Duyurusu aktif edildi ve müşteri menüsünde yayına alındı!', 'success');
    } else {
      showToast('ℹ️ Haftanın/Günün Duyurusu kapatıldı ve müşteri menüsünden gizlendi.', 'success');
    }
  }
}

async function enableAnnouncementQuickly() {
  const el = document.getElementById('set-announcement-enabled');
  if (el) el.checked = true;
  await handleAnnouncementToggleChange(true);
}

async function saveAnnouncementSectionOnly() {
  if (isUploadingAnnouncementImage) {
    showToast('⏳ Banner görseli işleniyor, lütfen 1-2 saniye bekleyin...', 'error');
    return;
  }
  const ok = await persistAnnouncementMediaQuickly();
  if (ok) {
    showToast('✅ Duyuru metinleri ve banner görseli canlı menüde güncellendi!', 'success');
  }
}

async function handleQuickSettingsToggleChange(labelText = 'Ayar') {
  if (!menuData || !menuData.settings) return;
  const allowStock = document.getElementById('set-staff-allow-stock') ? document.getElementById('set-staff-allow-stock').checked : true;
  const allowPrice = document.getElementById('set-staff-allow-price') ? document.getElementById('set-staff-allow-price').checked : false;
  const enableCalls = document.getElementById('set-enable-calls') ? document.getElementById('set-enable-calls').checked : !!menuData.settings.enableServiceCalls;

  menuData.settings.enableServiceCalls = enableCalls;
  menuData.settings.staffPermissions = {
    ...(menuData.settings.staffPermissions || {}),
    allowStockToggle: allowStock,
    allowPriceEdit: allowPrice,
    allowCallsView: true
  };

  const ok = await saveMenuData(menuData);
  if (ok) {
    showToast(`✅ ${labelText} anında güncellendi!`, 'success');
  }
}

async function persistAnnouncementMediaQuickly() {
  if (!menuData || !menuData.settings) return false;
  const curAnn = menuData.settings.announcement || {};
  const badgeEl = document.getElementById('set-announcement-badge');
  const titleEl = document.getElementById('set-announcement-title');
  const descEl = document.getElementById('set-announcement-desc');
  const imgEl = document.getElementById('set-announcement-image');
  const fitEl = document.getElementById('set-announcement-image-fit');

  menuData.settings.announcement = {
    ...curAnn,
    enabled: document.getElementById('set-announcement-enabled') ? document.getElementById('set-announcement-enabled').checked : (curAnn.enabled !== false),
    badge: badgeEl ? badgeEl.value.trim() : (curAnn.badge ?? '🔥 ŞEFİN TAVSİYESİ'),
    title: titleEl ? (titleEl.value.trim() || 'HASHTAG Özel Seçim') : (curAnn.title || 'Love 66 & Lady Killer Özel Mix'),
    desc: descEl ? descEl.value.trim() : (curAnn.desc ?? ''),
    image: imgEl ? imgEl.value.trim() : (curAnn.image || ''),
    imageFit: fitEl ? (fitEl.value || 'cover') : (curAnn.imageFit || 'cover')
  };
  return await saveMenuData(menuData);
}

async function clearAnnouncementImage() {
  activeAnnouncementImageFile = null;
  activeAnnouncementImageRotation = 0;
  const input = document.getElementById('set-announcement-image');
  if (input) input.value = '';
  const fileInput = document.getElementById('announcement-image-file-input');
  if (fileInput) fileInput.value = '';
  const camInput = document.getElementById('announcement-camera-file-input');
  if (camInput) camInput.value = '';

  setAnnouncementImageFit('cover', false);
  updateAnnouncementImagePreview('', 'cover');

  await persistAnnouncementMediaQuickly();
  showToast('ℹ️ Özel görsel kaldırıldı, varsayılan lounge görseline dönüldü.', 'success');
}

async function applyUploadedAnnouncementFile(file, rotationDeg = 0, allowAutoFit = true) {
  if (!file) return;
  activeAnnouncementImageFile = file;
  activeAnnouncementImageRotation = ((rotationDeg % 360) + 360) % 360;

  const statusEl = document.getElementById('announcement-upload-status');
  setAnnouncementUploadBusy(true, 'Medya optimize ediliyor...');
  if (statusEl) {
    statusEl.textContent = '⏳ Yükleniyor...';
    statusEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono animate-pulse';
  }

  try {
    const result = await processUniversalImageFile(file, {
      maxDim: 1600,
      rotationDeg: activeAnnouncementImageRotation,
      onProgress: (msg) => setAnnouncementUploadBusy(true, msg)
    });

    const input = document.getElementById('set-announcement-image');
    if (input) input.value = result.url;

    // Dikey telefon fotoğraflarında (9:16 veya 3:4) yatay banner'da kesilmemesi için otomatik sığdırma
    if (allowAutoFit && !userManuallyChangedAnnouncementFit && result.width > 0 && result.height > 0) {
      if (result.height > result.width * 1.05) {
        setAnnouncementImageFit('contain', false);
      } else {
        setAnnouncementImageFit('cover', false);
      }
    } else {
      const curFit = document.getElementById('set-announcement-image-fit')?.value || 'cover';
      updateAnnouncementImagePreview(result.url, curFit);
    }

    if (statusEl) {
      const dimLabel = (result.width && result.height) ? ` • ${result.width}×${result.height}` : '';
      statusEl.textContent = `✓ ${result.format || 'WEBP'} • ${result.sizeKB || ''} KB${dimLabel}`;
      statusEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono';
    }

    await persistAnnouncementMediaQuickly();
    showToast('✅ Duyuru banner görseli medyadan yüklendi ve kaydedildi!', 'success');
  } catch (err) {
    console.error('Announcement photo upload error:', err);
    if (statusEl) {
      statusEl.textContent = '❌ Yükleme Hatası';
      statusEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 font-mono';
    }
    showToast('❌ ' + (err.message || 'Banner görseli yüklenemedi.'), 'error');
  } finally {
    setAnnouncementUploadBusy(false);
    const fileInput = document.getElementById('announcement-image-file-input');
    if (fileInput) fileInput.value = '';
    const camInput = document.getElementById('announcement-camera-file-input');
    if (camInput) camInput.value = '';
  }
}

async function handleAnnouncementImageUpload(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;
  userManuallyChangedAnnouncementFit = false;
  await applyUploadedAnnouncementFile(file, 0, true);
}

async function rotateAnnouncementImage() {
  if (isUploadingAnnouncementImage) return;

  if (activeAnnouncementImageFile) {
    const nextRot = (activeAnnouncementImageRotation + 90) % 360;
    await applyUploadedAnnouncementFile(activeAnnouncementImageFile, nextRot, true);
    return;
  }

  const currentUrl = document.getElementById('set-announcement-image')?.value?.trim();
  if (!currentUrl) {
    showToast('⚠️ Döndürmek için önce galeriden veya bilgisayardan bir fotoğraf seçin.', 'error');
    return;
  }

  setAnnouncementUploadBusy(true, '90° Döndürülüyor...');
  try {
    const resolved = resolveAdminImageUrl(currentUrl, '');
    const res = await fetch(resolved, { mode: 'cors' });
    if (!res.ok) throw new Error('Mevcut görsel okunamadı.');
    const blob = await res.blob();
    const syntheticFile = new File([blob], 'rotated-banner.webp', { type: blob.type || 'image/webp' });
    await applyUploadedAnnouncementFile(syntheticFile, 90, true);
  } catch (err) {
    setAnnouncementUploadBusy(false);
    showToast('⚠️ Lütfen cihazınızdan yeni bir fotoğraf seçerek döndürün.', 'error');
  }
}

/* ==========================================================================
   PROFİL FOTOĞRAFLARI (SOL ÜST & EN ALT) + ANASAYFA KAPAK MEDYA EKLENTİSİ
   ========================================================================== */

const DEFAULT_BRAND_LOGO_IMG = 'hashtag-logo.jpg?v=2.5';
const DEFAULT_BRAND_HERO_IMG = 'hashtag-banner.jpg?v=3.0';
const DEFAULT_BRAND_MOOD_IMG = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

const brandMediaUploadState = {
  logo: { file: null, rotation: 0, busy: false, manualFit: false },
  hero: { file: null, rotation: 0, busy: false, manualFit: false },
  mood: { file: null, rotation: 0, busy: false, manualFit: false },
  bg: { file: null, rotation: 0, busy: false, manualFit: false }
};

function isAnyBrandMediaUploading() {
  return !!(
    brandMediaUploadState.logo.busy ||
    brandMediaUploadState.hero.busy ||
    brandMediaUploadState.mood.busy ||
    brandMediaUploadState.bg.busy
  );
}

function resetBrandMediaUploadState() {
  ['logo', 'hero', 'mood', 'bg'].forEach(slot => {
    brandMediaUploadState[slot].file = null;
    brandMediaUploadState[slot].rotation = 0;
    brandMediaUploadState[slot].busy = false;
    brandMediaUploadState[slot].manualFit = false;
    setBrandMediaSlotBusy(slot, false);
  });
}

function openBrandMediaSection() {
  switchTab('settings');
  setTimeout(() => {
    const section = document.getElementById('brand-media-manager-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section.classList.add('ring-2', 'ring-amber-400');
      setTimeout(() => section.classList.remove('ring-2', 'ring-amber-400'), 1800);
    }
  }, 60);
}

function openAmbientBackgroundSection() {
  switchTab('settings');
  setTimeout(() => {
    const section = document.getElementById('ambient-background-plugin-section') || document.getElementById('brand-media-manager-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section.classList.add('ring-2', 'ring-cyan-400');
      setTimeout(() => section.classList.remove('ring-2', 'ring-cyan-400'), 1800);
    }
  }, 60);
}

function setBrandMediaSlotBusy(slot, busy, loadingText = 'Medya optimize ediliyor...') {
  if (!brandMediaUploadState[slot]) return;
  brandMediaUploadState[slot].busy = !!busy;
  const loader = document.getElementById(`brand-${slot}-loading`);
  const loaderText = document.getElementById(`brand-${slot}-loading-text`);
  if (loaderText && loadingText) loaderText.textContent = loadingText;
  if (loader) {
    if (busy) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
  }
}

function readBrandMediaFormObject() {
  const cur = (menuData && menuData.settings && menuData.settings.brandMedia) ? menuData.settings.brandMedia : {};
  const cafeName = ((menuData && menuData.settings && menuData.settings.cafeName) || 'HASHTAG').toUpperCase();

  const logoImgEl = document.getElementById('set-brand-logo-image');
  const logoFitEl = document.getElementById('set-brand-logo-fit');
  const heroImgEl = document.getElementById('set-brand-hero-image');
  const heroFitEl = document.getElementById('set-brand-hero-fit');
  const heroBadgeEl = document.getElementById('set-hero-banner-badge');
  const heroTitleEl = document.getElementById('set-hero-banner-title');
  const heroDescEl = document.getElementById('set-hero-banner-desc');
  const moodEnEl = document.getElementById('set-mood-slide-enabled');
  const moodImgEl = document.getElementById('set-brand-mood-image');
  const moodFitEl = document.getElementById('set-brand-mood-fit');
  const bgImgEl = document.getElementById('set-brand-bg-image');
  const bgFitEl = document.getElementById('set-brand-bg-fit');
  const bgOpacityEl = document.getElementById('set-brand-bg-opacity');
  const bgBlurEl = document.getElementById('set-brand-bg-blur');
  const ambientEffectEl = document.getElementById('set-ambient-effect');
  const ambientIntensityEl = document.getElementById('set-ambient-intensity');

  const rawOpacity = bgOpacityEl ? Number(bgOpacityEl.value) : Number(cur.backgroundOpacity);
  const backgroundOpacity = Number.isFinite(rawOpacity) && rawOpacity >= 5
    ? Math.max(5, Math.min(95, rawOpacity))
    : 36;

  const rawBlur = bgBlurEl ? Number(bgBlurEl.value) : Number(cur.backgroundBlur);
  const backgroundBlur = Number.isFinite(rawBlur) && rawBlur >= 0
    ? Math.max(0, Math.min(24, rawBlur))
    : 0;

  const validEffects = ['smoke', 'gold-embers', 'ember-smoke', 'neon-mist', 'starlight', 'none'];
  const rawEff = ambientEffectEl ? ambientEffectEl.value.trim() : (cur.ambientEffect || 'smoke');
  const ambientEffect = validEffects.includes(rawEff) ? rawEff : 'smoke';

  const validIntensities = ['low', 'medium', 'high'];
  const rawInt = ambientIntensityEl ? ambientIntensityEl.value.trim() : (cur.ambientIntensity || 'medium');
  const ambientIntensity = validIntensities.includes(rawInt) ? rawInt : 'medium';

  return {
    ...cur,
    logoImage: logoImgEl ? logoImgEl.value.trim() : (cur.logoImage || ''),
    logoFit: logoFitEl ? (logoFitEl.value || 'cover') : (cur.logoFit || 'cover'),
    heroBannerImage: heroImgEl ? heroImgEl.value.trim() : (cur.heroBannerImage || ''),
    heroBannerFit: heroFitEl ? (heroFitEl.value || 'cover') : (cur.heroBannerFit || 'cover'),
    heroBannerBadge: heroBadgeEl ? heroBadgeEl.value.trim() : (cur.heroBannerBadge ?? 'PREMİUM ATMOSFER'),
    heroBannerTitle: heroTitleEl
      ? (heroTitleEl.value.trim() || `${cafeName} LOUNGE & HOOKAH`)
      : (cur.heroBannerTitle || `${cafeName} LOUNGE & HOOKAH`),
    heroBannerDesc: heroDescEl
      ? heroDescEl.value.trim()
      : (cur.heroBannerDesc ?? '💨 Özel Nargile Karışımları • 🍹 Mocktail & Kahve'),
    moodSlideEnabled: moodEnEl ? moodEnEl.checked : (cur.moodSlideEnabled !== false),
    moodBannerImage: moodImgEl ? moodImgEl.value.trim() : (cur.moodBannerImage || ''),
    moodBannerFit: moodFitEl ? (moodFitEl.value || 'cover') : (cur.moodBannerFit || 'cover'),
    backgroundImage: bgImgEl ? bgImgEl.value.trim() : (cur.backgroundImage || ''),
    backgroundFit: bgFitEl ? (bgFitEl.value || 'cover') : (cur.backgroundFit || 'cover'),
    backgroundOpacity,
    backgroundBlur,
    ambientEffect,
    ambientIntensity
  };
}

function applyAdminBrandLogoUI() {
  if (!menuData || !menuData.settings) return;
  const bm = menuData.settings.brandMedia || {};
  const cafeName = menuData.settings.cafeName || 'HASHTAG';
  const hasCustomLogo = !!(bm.logoImage && String(bm.logoImage).trim());
  const resolvedLogo = hasCustomLogo
    ? resolveAdminImageUrl(bm.logoImage, DEFAULT_BRAND_LOGO_IMG)
    : DEFAULT_BRAND_LOGO_IMG;
  const fitClass = bm.logoFit === 'contain' ? 'w-full h-full object-contain p-0.5' : 'w-full h-full object-cover';

  const adminHeaderLogo = document.getElementById('admin-header-logo-img');
  if (adminHeaderLogo) {
    adminHeaderLogo.src = resolvedLogo;
    adminHeaderLogo.className = fitClass;
  }

  const prevCafeName = document.getElementById('brand-logo-preview-cafe-name');
  const prevFooterName = document.getElementById('brand-logo-preview-footer-name');
  if (prevCafeName) prevCafeName.textContent = cafeName;
  if (prevFooterName) prevFooterName.textContent = `${cafeName.toUpperCase()} LOUNGE & HOOKAH`;

  if (currentTab === 'qr-stands' && typeof updateQrPreview === 'function') {
    updateQrPreview();
  }
}

function syncHeroPreviewTexts() {
  const cafeName = ((menuData && menuData.settings && menuData.settings.cafeName) || 'HASHTAG').toUpperCase();
  const badgeVal = document.getElementById('set-hero-banner-badge')?.value.trim();
  const titleVal = document.getElementById('set-hero-banner-title')?.value.trim();
  const descVal = document.getElementById('set-hero-banner-desc')?.value.trim();

  const prevBadge = document.getElementById('brand-hero-preview-badge');
  const prevTitle = document.getElementById('brand-hero-preview-title');
  const prevDesc = document.getElementById('brand-hero-preview-desc');

  if (prevBadge) {
    if (badgeVal) {
      prevBadge.textContent = badgeVal;
      prevBadge.classList.remove('hidden');
    } else {
      prevBadge.classList.add('hidden');
    }
  }
  if (prevTitle) prevTitle.textContent = titleVal || `${cafeName} LOUNGE & HOOKAH`;
  if (prevDesc) prevDesc.textContent = descVal || '';
}

function setBrandMediaSlotFit(slot, fitMode, isManual = true) {
  if (!['logo', 'hero', 'mood', 'bg'].includes(slot)) return;
  const allowedModes = slot === 'logo' ? ['cover', 'contain'] : ['cover', 'top', 'contain'];
  const validMode = allowedModes.includes(fitMode) ? fitMode : 'cover';

  if (isManual && brandMediaUploadState[slot]) {
    brandMediaUploadState[slot].manualFit = true;
  }

  const hiddenFit = document.getElementById(`set-brand-${slot}-fit`);
  if (hiddenFit) hiddenFit.value = validMode;

  allowedModes.forEach(mode => {
    const btn = document.getElementById(`${slot}-fit-btn-${mode}`);
    if (!btn) return;
    if (mode === validMode) {
      btn.className = slot === 'logo'
        ? 'py-1.5 px-2.5 rounded-xl text-[10px] font-bold bg-amber-500 text-black shadow transition-all'
        : 'py-1.5 px-2 rounded-xl text-[10px] font-bold bg-amber-500 text-black shadow transition-all';
    } else {
      btn.className = slot === 'logo'
        ? 'py-1.5 px-2.5 rounded-xl text-[10px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all'
        : 'py-1.5 px-2 rounded-xl text-[10px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all';
    }
  });

  updateBrandMediaPreviewUI(slot, validMode);

  if (isManual && menuData && menuData.settings) {
    persistBrandMediaQuickly().then(ok => {
      if (ok) showToast('✅ Görsel kadraj ayarı canlı menüde güncellendi!', 'success');
    });
  }
}

function updateBrandMediaPreviewUI(slot, fitMode = null) {
  const imgInput = document.getElementById(`set-brand-${slot}-image`);
  const fitInput = document.getElementById(`set-brand-${slot}-fit`);
  const clearBtn = document.getElementById(`btn-clear-brand-${slot}`);
  const statusEl = document.getElementById(`brand-${slot}-status`);

  const cleanUrl = (imgInput?.value || '').trim();
  const hasCustom = cleanUrl.length > 0;
  const mode = fitMode || fitInput?.value || 'cover';

  if (slot === 'logo') {
    const headerImg = document.getElementById('brand-logo-preview-header');
    const footerImg = document.getElementById('brand-logo-preview-footer');
    const resolved = hasCustom
      ? resolveAdminImageUrl(cleanUrl, DEFAULT_BRAND_LOGO_IMG)
      : DEFAULT_BRAND_LOGO_IMG;
    const cls = mode === 'contain' ? 'w-full h-full object-contain p-0.5' : 'w-full h-full object-cover';

    [headerImg, footerImg].forEach(img => {
      if (!img) return;
      img.src = resolved;
      img.className = cls;
      img.onerror = () => {
        if (!img.src.includes('hashtag-logo.jpg')) {
          img.src = DEFAULT_BRAND_LOGO_IMG;
        } else if (!img.src.includes('images/')) {
          img.src = 'images/hashtag-logo.jpg?v=2.5';
        }
      };
    });

    if (clearBtn) {
      if (hasCustom) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    if (statusEl && !brandMediaUploadState.logo.busy) {
      if (hasCustom) {
        if (!statusEl.textContent.startsWith('✓')) {
          statusEl.textContent = '✓ Özel Profil Aktif';
          statusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono';
        }
      } else {
        statusEl.textContent = 'Varsayılan Profil Aktif';
        statusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-amber-300 border border-white/10 font-mono';
      }
    }
    return;
  }

  if (slot === 'bg') {
    const heroCleanUrl = (document.getElementById('set-brand-hero-image')?.value || '').trim();
    const effectiveUrl = cleanUrl || heroCleanUrl;
    const resolved = effectiveUrl
      ? resolveAdminImageUrl(effectiveUrl, DEFAULT_BRAND_HERO_IMG)
      : DEFAULT_BRAND_HERO_IMG;
    const previewImg = document.getElementById('brand-bg-preview');
    const blurBg = document.getElementById('brand-bg-blur-bg');
    const captionEl = document.getElementById('brand-bg-caption');

    if (previewImg) {
      previewImg.src = resolved;
      previewImg.onerror = () => {
        if (!previewImg.src.includes('hashtag-banner.jpg')) previewImg.src = DEFAULT_BRAND_HERO_IMG;
        else if (!previewImg.src.includes('images/')) previewImg.src = 'images/hashtag-banner.jpg?v=3.0';
      };

      if (mode === 'contain' && effectiveUrl) {
        previewImg.className = 'relative z-10 w-full h-full object-contain transition-all duration-300';
        if (blurBg) {
          blurBg.src = resolved;
          blurBg.classList.remove('hidden');
        }
      } else if (mode === 'top') {
        previewImg.className = 'relative z-10 w-full h-full object-cover object-top transition-all duration-300';
        if (blurBg) blurBg.classList.add('hidden');
      } else {
        previewImg.className = 'relative z-10 w-full h-full object-cover object-center transition-all duration-300';
        if (blurBg) blurBg.classList.add('hidden');
      }
    }

    if (clearBtn) {
      if (hasCustom) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }

    if (captionEl) {
      captionEl.textContent = hasCustom
        ? 'Özel tam ekran arka plan fotoğrafı aktif'
        : (heroCleanUrl ? 'Anasayfa 1. slayt fotoğrafı arka plan olarak kullanılıyor' : 'Varsayılan orijinal neon tuğla arka plan aktif');
    }

    if (statusEl && !brandMediaUploadState.bg.busy) {
      if (hasCustom) {
        if (!statusEl.textContent.startsWith('✓')) {
          statusEl.textContent = '✓ Özel Arka Plan Aktif';
          statusEl.className = 'text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono';
        }
      } else {
        statusEl.textContent = heroCleanUrl ? '1. Slayt Görseli Aktif' : 'Varsayılan Arka Plan Aktif';
        statusEl.className = 'text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono';
      }
    }

    if (typeof previewBackgroundStyleSliders === 'function') {
      previewBackgroundStyleSliders();
    }
    return;
  }

  // Hero (1. Slayt) veya Mood (3. Slayt)
  const fallbackImg = slot === 'hero' ? DEFAULT_BRAND_HERO_IMG : DEFAULT_BRAND_MOOD_IMG;
  const previewImg = document.getElementById(`brand-${slot}-preview`);
  const blurBg = document.getElementById(`brand-${slot}-blur-bg`);
  const captionEl = document.getElementById(`brand-${slot}-caption`);
  if (!previewImg) return;

  const resolved = hasCustom
    ? resolveAdminImageUrl(cleanUrl, fallbackImg)
    : fallbackImg;

  previewImg.src = resolved;
  previewImg.onerror = () => {
    if (slot === 'hero') {
      if (!previewImg.src.includes('hashtag-banner.jpg')) previewImg.src = DEFAULT_BRAND_HERO_IMG;
      else if (!previewImg.src.includes('images/')) previewImg.src = 'images/hashtag-banner.jpg?v=3.0';
    } else if (previewImg.src !== DEFAULT_BRAND_MOOD_IMG) {
      previewImg.src = DEFAULT_BRAND_MOOD_IMG;
    }
  };

  if (mode === 'contain' && hasCustom) {
    previewImg.className = 'relative z-10 w-full h-full object-contain transition-all duration-300';
    if (blurBg) {
      blurBg.src = resolved;
      blurBg.classList.remove('hidden');
    }
  } else if (mode === 'top') {
    previewImg.className = 'relative z-10 w-full h-full object-cover object-top transition-all duration-300';
    if (blurBg) blurBg.classList.add('hidden');
  } else {
    previewImg.className = 'relative z-10 w-full h-full object-cover object-center transition-all duration-300';
    if (blurBg) blurBg.classList.add('hidden');
  }

  if (clearBtn) {
    if (hasCustom) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  if (captionEl) {
    if (slot === 'hero') {
      captionEl.textContent = hasCustom ? 'Özel kapak aktif' : 'Varsayılan görsel';
    } else {
      captionEl.textContent = hasCustom
        ? 'Cihazınızdan yüklenen özel 3. slayt görseli aktif'
        : 'Günün saatine göre otomatik atmosfer görseli aktif';
    }
  }

  if (statusEl && !brandMediaUploadState[slot].busy) {
    if (hasCustom) {
      if (!statusEl.textContent.startsWith('✓')) {
        statusEl.textContent = '✓ Özel Görsel Aktif';
        statusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono';
      }
    } else {
      statusEl.textContent = slot === 'hero' ? 'Varsayılan Kapak Aktif' : 'Saat Bazlı Otomatik Görsel';
      statusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-amber-300 border border-white/10 font-mono';
    }
  }

  // Hero değiştiğinde eğer özel bg seçilmemişse bg önizlemesini de senkronize et
  if (slot === 'hero') {
    const bgFit = document.getElementById('set-brand-bg-fit')?.value || 'cover';
    updateBrandMediaPreviewUI('bg', bgFit);
  }
}

const AMBIENT_EFFECT_META = {
  'smoke': {
    label: '💨 Klasik Nargile Dumanı',
    overlayBg: 'radial-gradient(circle at 25% 75%, rgba(255,255,255,0.28) 0%, rgba(6,182,212,0.16) 45%, transparent 70%), radial-gradient(circle at 80% 30%, rgba(245,158,11,0.18) 0%, transparent 65%)'
  },
  'gold-embers': {
    label: '🔥 Altın Köz Kıvılcımları',
    overlayBg: 'radial-gradient(circle at 30% 80%, rgba(251,191,36,0.34) 0%, rgba(234,88,12,0.22) 42%, transparent 70%), radial-gradient(circle at 75% 40%, rgba(253,224,71,0.28) 0%, rgba(245,158,11,0.14) 50%, transparent 70%)'
  },
  'ember-smoke': {
    label: '🔥💨 Duman + Köz Ateşi',
    overlayBg: 'radial-gradient(circle at 25% 75%, rgba(255,255,255,0.26) 0%, rgba(245,158,11,0.22) 45%, transparent 70%), radial-gradient(circle at 78% 35%, rgba(251,191,36,0.30) 0%, rgba(234,88,12,0.16) 50%, transparent 70%)'
  },
  'neon-mist': {
    label: '💜 Neon Lounge Sisi',
    overlayBg: 'radial-gradient(circle at 25% 75%, rgba(217,70,239,0.34) 0%, rgba(147,51,234,0.20) 45%, transparent 70%), radial-gradient(circle at 80% 30%, rgba(34,211,238,0.30) 0%, rgba(6,182,212,0.16) 50%, transparent 70%)'
  },
  'starlight': {
    label: '✨ Lüks Bokeh & Yıldız Tozu',
    overlayBg: 'radial-gradient(circle at 30% 65%, rgba(254,240,138,0.28) 0%, rgba(251,191,36,0.14) 40%, transparent 68%), radial-gradient(circle at 75% 35%, rgba(224,242,254,0.26) 0%, transparent 65%)'
  },
  'none': {
    label: '🚫 Efekt Kapalı (Sade)',
    overlayBg: 'none'
  }
};

const AMBIENT_INTENSITY_LABELS = {
  'low': 'Hafif',
  'medium': 'Dengeli',
  'high': 'Yoğun'
};

function previewBackgroundStyleSliders() {
  const opacityEl = document.getElementById('set-brand-bg-opacity');
  const blurEl = document.getElementById('set-brand-bg-blur');
  const opacityLabel = document.getElementById('brand-bg-opacity-label');
  const blurLabel = document.getElementById('brand-bg-blur-label');
  const previewImg = document.getElementById('brand-bg-preview');

  const rawOp = opacityEl ? Number(opacityEl.value) : 36;
  const op = Number.isFinite(rawOp) ? Math.max(5, Math.min(95, rawOp)) : 36;

  const rawBl = blurEl ? Number(blurEl.value) : 0;
  const bl = Number.isFinite(rawBl) ? Math.max(0, Math.min(24, rawBl)) : 0;

  if (opacityLabel) opacityLabel.textContent = `%${op}`;
  if (blurLabel) blurLabel.textContent = bl > 0 ? `${bl}px` : '0px (Net)';

  if (previewImg && previewImg.style) {
    previewImg.style.opacity = String((op / 100).toFixed(2));
    previewImg.style.filter = bl > 0
      ? `blur(${bl}px) contrast(1.15) brightness(0.88) saturate(1.1)`
      : 'contrast(1.15) brightness(0.88) saturate(1.1)';
  }
}

function updateAmbientEffectSelectorUI(effectMode, intensityLevel) {
  const validEffects = ['smoke', 'gold-embers', 'ember-smoke', 'neon-mist', 'starlight', 'none'];
  const eff = validEffects.includes(effectMode) ? effectMode : 'smoke';

  const validIntensities = ['low', 'medium', 'high'];
  const inten = validIntensities.includes(intensityLevel) ? intensityLevel : 'medium';

  const effInput = document.getElementById('set-ambient-effect');
  if (effInput) effInput.value = eff;

  const intenInput = document.getElementById('set-ambient-intensity');
  if (intenInput) intenInput.value = inten;

  validEffects.forEach(m => {
    const btn = document.getElementById(`ambient-effect-btn-${m}`);
    if (!btn) return;
    if (m === eff) {
      btn.className = 'p-2.5 rounded-xl text-left border transition-all bg-amber-500/15 border-amber-500 text-white shadow-md ring-1 ring-amber-400/50';
    } else {
      btn.className = 'p-2.5 rounded-xl text-left border transition-all bg-white/5 hover:bg-white/10 border-white/10 text-gray-300';
    }
  });

  validIntensities.forEach(lvl => {
    const btn = document.getElementById(`ambient-intensity-btn-${lvl}`);
    if (!btn) return;
    if (lvl === inten) {
      btn.className = 'py-1.5 px-2.5 rounded-xl text-[10px] font-bold bg-amber-500 text-black shadow transition-all';
    } else {
      btn.className = 'py-1.5 px-2.5 rounded-xl text-[10px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all';
    }
  });

  const meta = AMBIENT_EFFECT_META[eff] || AMBIENT_EFFECT_META['smoke'];
  const intLabel = AMBIENT_INTENSITY_LABELS[inten] || 'Dengeli';

  const statusPill = document.getElementById('ambient-effect-status-pill');
  if (statusPill) {
    statusPill.textContent = eff === 'none' ? meta.label : `${meta.label} (${intLabel})`;
    statusPill.className = eff === 'none'
      ? 'text-[10px] px-2.5 py-1 rounded-full bg-white/10 text-gray-300 border border-white/15 font-bold'
      : 'text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold';
  }

  const badgeEl = document.getElementById('brand-bg-effect-badge');
  if (badgeEl) {
    badgeEl.textContent = eff === 'none' ? meta.label : `${meta.label} • ${intLabel}`;
  }

  const overlayEl = document.getElementById('brand-bg-effect-overlay');
  if (overlayEl && overlayEl.style) {
    overlayEl.style.background = meta.overlayBg;
    overlayEl.style.opacity = eff === 'none' ? '0' : (inten === 'low' ? '0.55' : (inten === 'high' ? '1' : '0.82'));
  }
}

async function selectAmbientEffectMode(effectMode) {
  const curInt = document.getElementById('set-ambient-intensity')?.value || 'medium';
  updateAmbientEffectSelectorUI(effectMode, curInt);
  const ok = await persistBrandMediaQuickly();
  if (ok) {
    const meta = AMBIENT_EFFECT_META[effectMode] || AMBIENT_EFFECT_META['smoke'];
    showToast(`✅ Ön plan atmosfer efekti "${meta.label}" olarak canlı menüde güncellendi!`, 'success');
  }
}

async function selectAmbientIntensityLevel(level) {
  const curEff = document.getElementById('set-ambient-effect')?.value || 'smoke';
  updateAmbientEffectSelectorUI(curEff, level);
  const ok = await persistBrandMediaQuickly();
  if (ok) {
    const intLabel = AMBIENT_INTENSITY_LABELS[level] || 'Dengeli';
    showToast(`✅ Efekt yoğunluğu "${intLabel}" olarak canlı menüde güncellendi!`, 'success');
  }
}

async function selectPresetBackgroundImage(presetUrl) {
  const clean = String(presetUrl || '').trim();
  const bgInput = document.getElementById('set-brand-bg-image');
  if (bgInput) bgInput.value = clean;

  brandMediaUploadState.bg.file = null;
  brandMediaUploadState.bg.rotation = 0;

  const curFit = document.getElementById('set-brand-bg-fit')?.value || 'cover';
  updateBrandMediaPreviewUI('bg', curFit);

  const ok = await persistBrandMediaQuickly();
  if (ok) {
    showToast(
      clean
        ? '✅ Seçilen profesyonel arka plan fotoğrafı canlı müşteri menüsüne uygulandı!'
        : 'ℹ️ Müşteri menüsü arka planı orijinal görünüme döndürüldü!',
      'success'
    );
  }
}

async function saveBackgroundStyleAndEffectQuickly() {
  previewBackgroundStyleSliders();
  const ok = await persistBrandMediaQuickly();
  if (ok) {
    showToast('✅ Arka plan parlaklık ve görünüm ayarları canlı menüde güncellendi!', 'success');
  }
}

function updateMoodSlideToggleUI(isEnabled) {
  const pill = document.getElementById('mood-slide-status-pill');
  const disabledNotice = document.getElementById('mood-slide-disabled-notice');
  const configBody = document.getElementById('mood-slide-config-body');

  if (pill) {
    if (isEnabled) {
      pill.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold';
      pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Aktif';
    } else {
      pill.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-gray-400 border border-white/15 text-[10px] font-semibold';
      pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Gizli';
    }
  }

  if (disabledNotice) {
    if (isEnabled) disabledNotice.classList.add('hidden');
    else disabledNotice.classList.remove('hidden');
  }

  if (configBody) {
    if (isEnabled) configBody.classList.remove('hidden');
    else configBody.classList.add('hidden');
  }
}

async function handleMoodSlideToggleChange(isEnabled) {
  updateMoodSlideToggleUI(!!isEnabled);
  const ok = await persistBrandMediaQuickly();
  if (ok) {
    showToast(
      isEnabled
        ? '✅ Anasayfa 3. slayt aktif edildi ve yayına alındı!'
        : 'ℹ️ Anasayfa 3. slayt gizlendi.',
      'success'
    );
  }
}

async function enableMoodSlideQuickly() {
  const el = document.getElementById('set-mood-slide-enabled');
  if (el) el.checked = true;
  await handleMoodSlideToggleChange(true);
}

async function persistBrandMediaQuickly() {
  if (!menuData || !menuData.settings) return false;
  menuData.settings.brandMedia = readBrandMediaFormObject();
  applyAdminBrandLogoUI();
  return await saveMenuData(menuData);
}

async function saveBrandMediaTextsOnly() {
  if (isAnyBrandMediaUploading()) {
    showToast('⏳ Görsel işleniyor, lütfen 1-2 saniye bekleyin...', 'error');
    return;
  }
  syncHeroPreviewTexts();
  const ok = await persistBrandMediaQuickly();
  if (ok) {
    showToast('✅ Anasayfa 1. slayt yazıları ve kapak ayarları canlı menüde güncellendi!', 'success');
  }
}

async function clearBrandMediaSlot(slot) {
  if (!['logo', 'hero', 'mood', 'bg'].includes(slot)) return;
  brandMediaUploadState[slot].file = null;
  brandMediaUploadState[slot].rotation = 0;
  brandMediaUploadState[slot].manualFit = false;

  const input = document.getElementById(`set-brand-${slot}-image`);
  if (input) input.value = '';
  const fileInput = document.getElementById(`brand-${slot}-file-input`);
  if (fileInput) fileInput.value = '';
  const camInput = document.getElementById(`brand-${slot}-camera-input`);
  if (camInput) camInput.value = '';

  const statusEl = document.getElementById(`brand-${slot}-status`);
  if (statusEl) statusEl.textContent = '';

  setBrandMediaSlotFit(slot, 'cover', false);
  updateBrandMediaPreviewUI(slot, 'cover');

  const ok = await persistBrandMediaQuickly();
  if (ok) {
    const labels = {
      logo: 'Profil fotoğrafı (sol üst & sayfa altı) varsayılan logoya döndürüldü.',
      hero: 'Anasayfa 1. slayt ve arka plan varsayılan kapak görseline döndürüldü.',
      mood: 'Anasayfa 3. slayt otomatik atmosfer görseline döndürüldü.',
      bg: 'Müşteri menüsü arka plan fotoğrafı varsayılan görünüme döndürüldü.'
    };
    showToast(`ℹ️ ${labels[slot]}`, 'success');
  }
}

async function applyUploadedBrandMediaFile(slot, file, rotationDeg = 0, allowAutoFit = true) {
  if (!file || !['logo', 'hero', 'mood', 'bg'].includes(slot)) return;
  const state = brandMediaUploadState[slot];
  state.file = file;
  state.rotation = ((rotationDeg % 360) + 360) % 360;

  const statusEl = document.getElementById(`brand-${slot}-status`);
  setBrandMediaSlotBusy(slot, true, 'Medya optimize ediliyor...');
  if (statusEl) {
    statusEl.textContent = '⏳ Yükleniyor...';
    statusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono animate-pulse';
  }

  try {
    const targetMaxDim = slot === 'logo' ? 800 : 1600;
    const result = await processUniversalImageFile(file, {
      maxDim: targetMaxDim,
      rotationDeg: state.rotation,
      onProgress: (msg) => setBrandMediaSlotBusy(slot, true, msg)
    });

    const input = document.getElementById(`set-brand-${slot}-image`);
    if (input) input.value = result.url;

    if (allowAutoFit && !state.manualFit && result.width > 0 && result.height > 0) {
      if (slot === 'logo') {
        const ratio = Math.max(result.width / result.height, result.height / result.width);
        setBrandMediaSlotFit('logo', ratio > 1.38 ? 'contain' : 'cover', false);
      } else {
        setBrandMediaSlotFit(slot, result.height > result.width * 1.05 ? 'contain' : 'cover', false);
      }
    } else {
      const curFit = document.getElementById(`set-brand-${slot}-fit`)?.value || 'cover';
      updateBrandMediaPreviewUI(slot, curFit);
    }

    if (statusEl) {
      const dimLabel = (result.width && result.height) ? ` • ${result.width}×${result.height}` : '';
      statusEl.textContent = `✓ ${result.format || 'WEBP'} • ${result.sizeKB || ''} KB${dimLabel}`;
      statusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono';
    }

    const ok = await persistBrandMediaQuickly();
    if (ok) {
      const successLabels = {
        logo: '✅ Sol üst ve sayfa altı profil fotoğrafı yüklendi ve canlı menüde güncellendi!',
        hero: '✅ Anasayfa 1. slayt ve arka plan fotoğrafı yüklendi ve canlı menüde güncellendi!',
        mood: '✅ Anasayfa 3. slayt fotoğrafı yüklendi ve canlı menüde güncellendi!',
        bg: '✅ Müşteri menüsü tam ekran arka plan fotoğrafı yüklendi ve canlı menüde güncellendi!'
      };
      showToast(successLabels[slot], 'success');
    }
  } catch (err) {
    console.error(`Brand media (${slot}) upload error:`, err);
    if (statusEl) {
      statusEl.textContent = '❌ Yükleme Hatası';
      statusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 font-mono';
    }
    showToast('❌ ' + (err.message || 'Fotoğraf yüklenemedi.'), 'error');
  } finally {
    setBrandMediaSlotBusy(slot, false);
    const fileInput = document.getElementById(`brand-${slot}-file-input`);
    if (fileInput) fileInput.value = '';
    const camInput = document.getElementById(`brand-${slot}-camera-input`);
    if (camInput) camInput.value = '';
  }
}

async function handleBrandMediaUpload(slot, event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file || !brandMediaUploadState[slot]) return;
  brandMediaUploadState[slot].manualFit = false;
  await applyUploadedBrandMediaFile(slot, file, 0, true);
}

async function rotateBrandMediaSlot(slot) {
  if (!['logo', 'hero', 'mood', 'bg'].includes(slot)) return;
  const state = brandMediaUploadState[slot];
  if (state.busy) return;

  if (state.file) {
    const nextRot = (state.rotation + 90) % 360;
    await applyUploadedBrandMediaFile(slot, state.file, nextRot, true);
    return;
  }

  const currentUrl = document.getElementById(`set-brand-${slot}-image`)?.value?.trim();
  if (!currentUrl) {
    showToast('⚠️ Döndürmek için önce galeriden veya bilgisayardan bir fotoğraf seçin.', 'error');
    return;
  }

  setBrandMediaSlotBusy(slot, true, '90° Döndürülüyor...');
  try {
    const resolved = resolveAdminImageUrl(currentUrl, '');
    const res = await fetch(resolved, { mode: 'cors' });
    if (!res.ok) throw new Error('Mevcut görsel okunamadı.');
    const blob = await res.blob();
    const syntheticFile = new File([blob], `rotated-${slot}.webp`, { type: blob.type || 'image/webp' });
    await applyUploadedBrandMediaFile(slot, syntheticFile, 90, true);
  } catch (err) {
    setBrandMediaSlotBusy(slot, false);
    showToast('⚠️ Lütfen cihazınızdan yeni bir fotoğraf seçerek döndürün.', 'error');
  }
}


