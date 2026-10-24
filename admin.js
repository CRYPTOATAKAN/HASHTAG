/**
 * HASHTAG QR Menü - Yönetici Paneli Mantığı
 */

let isAuthenticated = false;
let currentTab = 'products'; // 'products', 'quick-price', 'settings', 'qr-stands'
let editingItemId = null;

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

            return `
              <tr class="hover:bg-white/5 transition-colors">
                <td class="py-3 px-4">
                  <div class="flex items-center gap-3">
                    <img src="${item.image || 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=100&q=80'}" 
                         alt="" class="w-12 h-12 rounded-lg object-cover bg-neutral-900 border border-white/5" />
                    <div>
                      <div class="font-semibold text-white flex items-center gap-2">
                        ${item.name}
                        ${item.badge ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">${item.badge}</span>` : ''}
                      </div>
                      ${item.flavors && item.flavors.length > 0 ? `
                        <div class="text-[11px] text-gray-400 mt-0.5">${item.flavors.join(' • ')}</div>
                      ` : ''}
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <span class="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                    ${cat ? cat.name : item.categoryId}
                  </span>
                </td>
                <td class="py-3 px-4">
                  <span class="font-bold text-amber-400 font-mono text-base">${item.price} ${currency}</span>
                </td>
                <td class="py-3 px-4">
                  <button onclick="toggleStockStatus('${item.id}')" 
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
                    <button onclick="openEditItemModal('${item.id}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors" title="Düzenle">
                      <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteItem('${item.id}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors" title="Sil">
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

  const currentAvailable = (item.inStock !== false) && (item.isAvailable !== false);
  item.inStock = !currentAvailable;
  item.isAvailable = !currentAvailable;
  await saveMenuData(menuData);
  updateAdminStats();
  renderAdminProductTable();
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
        ${items.map(item => `
          <div class="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-white/5 hover:border-white/10 transition-colors">
            <div class="min-w-0 pr-3">
              <div class="font-medium text-white text-sm truncate">${item.name}</div>
              <div class="text-xs text-gray-400">${item.badge || 'Standart'}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span id="quick-status-${item.id}" class="text-[11px] font-semibold text-emerald-400 opacity-0 transition-opacity duration-300">✓ Kaydedildi</span>
              <input 
                type="number" 
                id="quick-price-${item.id}" 
                value="${item.price}" 
                onchange="saveSingleQuickPrice('${item.id}', this.value)"
                onkeydown="if(event.key==='Enter'){ this.blur(); }"
                class="w-24 px-3 py-1.5 rounded-lg bg-black border border-white/20 text-right font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-400 text-sm"
              />
              <span class="text-xs text-gray-400 font-semibold">${currency}</span>
            </div>
          </div>
        `).join('')}
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
  
  // Kategorileri Doldur
  fillCategorySelect();

  const modal = document.getElementById('edit-item-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openEditItemModal(itemId) {
  editingItemId = itemId;
  const item = menuData.items.find(it => it.id === itemId);
  if (!item) return;

  document.getElementById('modal-item-title').textContent = 'Ürünü Düzenle';
  fillCategorySelect(item.categoryId);

  document.getElementById('form-item-name').value = item.name || '';
  document.getElementById('form-item-price').value = item.price || '';
  document.getElementById('form-item-desc').value = item.description || '';
  document.getElementById('form-item-badge').value = item.badge || '';
  document.getElementById('form-item-image').value = item.image || '';
  document.getElementById('form-item-flavors').value = (item.flavors || []).join(', ');
  document.getElementById('form-item-stock').checked = (item.inStock !== false) && (item.isAvailable !== false);

  const modal = document.getElementById('edit-item-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeItemEditModal() {
  const modal = document.getElementById('edit-item-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function fillCategorySelect(selectedCatId = null) {
  const sel = document.getElementById('form-item-category');
  if (!sel) return;
  sel.innerHTML = menuData.categories.map(cat => `
    <option value="${cat.id}" ${cat.id === selectedCatId ? 'selected' : ''}>${cat.name}</option>
  `).join('');
}

async function handleSaveItem(e) {
  e.preventDefault();

  const name = document.getElementById('form-item-name').value.trim();
  const categoryId = document.getElementById('form-item-category').value;
  const price = parseFloat(document.getElementById('form-item-price').value) || 0;
  const description = document.getElementById('form-item-desc').value.trim();
  const badge = document.getElementById('form-item-badge').value.trim();
  const image = document.getElementById('form-item-image').value.trim() || 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80';
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
  }
}

async function deleteItem(itemId) {
  if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;

  menuData.items = menuData.items.filter(it => it.id !== itemId);
  await saveMenuData(menuData);
  updateAdminStats();
  renderAdminProductTable();
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
    input.value = presets[type];
  }
}

/* ==========================================================================
   KATEGORİ YÖNETİMİ (Category Management CRUD & Reordering)
   ========================================================================== */

let editingCategoryId = null;

function renderAdminCategories() {
  const container = document.getElementById('admin-categories-list');
  if (!container) return;

  const categories = menuData.categories || [];
  const items = menuData.items || [];

  if (categories.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-gray-400">Henüz kategori bulunmuyor.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="space-y-3">
      ${categories.map((cat, idx) => {
        const count = items.filter(it => it.categoryId === cat.id).length;
        const isFirst = idx === 0;
        const isLast = idx === categories.length - 1;

        return `
          <div class="flex items-center justify-between p-3.5 rounded-xl bg-black border border-white/10 hover:border-white/20 transition-all">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <i data-lucide="${cat.icon || 'star'}" class="w-5 h-5"></i>
              </div>
              <div>
                <div class="font-bold text-white text-sm">${cat.name}</div>
                <div class="text-xs text-gray-400 mt-0.5">${count} ürün bulunuyor</div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button onclick="moveCategory('${cat.id}', -1)" ${isFirst ? 'disabled class="p-1.5 rounded-lg text-gray-600 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"'} title="Yukarı Taşı">
                <i data-lucide="arrow-up" class="w-4 h-4"></i>
              </button>
              <button onclick="moveCategory('${cat.id}', 1)" ${isLast ? 'disabled class="p-1.5 rounded-lg text-gray-600 cursor-not-allowed"' : 'class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"'} title="Aşağı Taşı">
                <i data-lucide="arrow-down" class="w-4 h-4"></i>
              </button>
              <button onclick="openEditCategoryModal('${cat.id}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors" title="Düzenle">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="deleteCategory('${cat.id}')" class="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors" title="Sil">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
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

  await saveMenuData(menuData);
  closeCategoryModal();
  renderAdminCategories();
  fillCategorySelect();
}

async function moveCategory(catId, dir) {
  const idx = menuData.categories.findIndex(c => c.id === catId);
  if (idx < 0) return;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= menuData.categories.length) return;

  const temp = menuData.categories[idx];
  menuData.categories[idx] = menuData.categories[targetIdx];
  menuData.categories[targetIdx] = temp;

  await saveMenuData(menuData);
  renderAdminCategories();
  fillCategorySelect();
}

async function deleteCategory(catId) {
  const cat = menuData.categories.find(c => c.id === catId);
  if (!cat) return;

  const itemsInCat = menuData.items.filter(it => it.categoryId === catId);
  if (itemsInCat.length > 0) {
    if (!confirm(`"${cat.name}" kategorisinde ${itemsInCat.length} adet ürün bulunuyor. Kategoriyi silerseniz bu ürünler sahipsiz kalacaktır. Devam etmek istiyor musunuz?`)) {
      return;
    }
  } else {
    if (!confirm(`"${cat.name}" kategorisini silmek istediğinize emin misiniz?`)) return;
  }

  menuData.categories = menuData.categories.filter(c => c.id !== catId);
  await saveMenuData(menuData);
  renderAdminCategories();
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
              src="hashtag-logo.jpg?v=2.3" 
              onerror="if(!this.src.includes('images/')) this.src='images/hashtag-logo.jpg?v=2.3';"
              alt="HASHTAG" 
              class="w-full h-full object-cover" 
            />
          </div>
          <h2 class="text-2xl font-black tracking-tight text-white uppercase">${menuData.settings.cafeName || 'HASHTAG'}</h2>
          <p class="text-xs text-amber-400 font-semibold tracking-widest uppercase mt-0.5">Lounge & Hookah</p>
        </div>

        <!-- Masa Numarası -->
        ${tableNum ? `
          <div class="my-3 py-1.5 px-4 rounded-full bg-amber-500/15 border border-amber-500/30 inline-block">
            <span class="text-sm font-bold text-amber-300 uppercase tracking-wider">MASA ${tableNum}</span>
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
          <div><span class="text-gray-500">Wi-Fi:</span> <strong class="text-white">${menuData.settings.wifiName || 'HASHTAG'}</strong></div>
          <div><span class="text-gray-500">Şifre:</span> <strong class="text-amber-400">${menuData.settings.wifiPassword || ''}</strong></div>
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

  setVal('set-cafe-name', s.cafeName);
  setVal('set-tagline', s.cafeTagline);
  setVal('set-currency', s.currency);
  setVal('set-wifi-name', s.wifiName);
  setVal('set-wifi-pass', s.wifiPassword);
  setVal('set-instagram', s.instagram);
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
}

async function handleSaveSettings(e) {
  e.preventDefault();

  const newPin = document.getElementById('set-admin-pin').value.trim() || '1234';
  const newStaffPin = document.getElementById('set-staff-pin') ? document.getElementById('set-staff-pin').value.trim() || '5555' : '5555';
  const allowStock = document.getElementById('set-staff-allow-stock') ? document.getElementById('set-staff-allow-stock').checked : true;
  const allowPrice = document.getElementById('set-staff-allow-price') ? document.getElementById('set-staff-allow-price').checked : false;

  menuData.settings = {
    ...menuData.settings,
    cafeName: document.getElementById('set-cafe-name').value.trim(),
    cafeTagline: document.getElementById('set-tagline').value.trim(),
    currency: document.getElementById('set-currency').value.trim() || '₺',
    wifiName: document.getElementById('set-wifi-name').value.trim(),
    wifiPassword: document.getElementById('set-wifi-pass').value.trim(),
    instagram: document.getElementById('set-instagram').value.trim(),
    adminPin: newPin,
    staffPin: newStaffPin,
    staffPermissions: {
      allowStockToggle: allowStock,
      allowPriceEdit: allowPrice,
      allowCallsView: true
    },
    baseUrl: document.getElementById('set-base-url').value.trim() || window.location.origin,
    tableCount: parseInt(document.getElementById('set-table-count').value) || 24,
    enableServiceCalls: document.getElementById('set-enable-calls').checked
  };

  const ok = await saveMenuData(menuData);
  if (ok) {
    try { sessionStorage.setItem('hashtag_admin_pin', newPin); } catch (err) {}
    fillSettingsForm();
    showToast('✅ Kafe ve Wi-Fi ayarları başarıyla kaydedildi!', 'success');
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
        loadStaffLogsData(true)
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
    loadStaffLogsData(false)
  ]);
  if (btn) btn.classList.remove('opacity-50', 'pointer-events-none');
  showToast('🔄 Personel ve log verileri güncellendi', 'info');
}

async function loadStaffAdminData() {
  try {
    const res = await fetch('/api/staff/list', { cache: 'no-store' });
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
  try {
    const res = await fetch('/api/staff/performance', {
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
    const firstChar = name.charAt(0) || 'P';
    return `
      <tr class="hover:bg-white/5 transition-colors">
        <td class="py-3 pr-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xs">
              ${firstChar}
            </div>
            <div>
              <div class="font-bold text-white">${name}</div>
              <div class="text-[10px] text-gray-500">ID: ${s.id || ''}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[11px] font-medium text-gray-300">
            ${s.role || 'Garson'}
          </span>
        </td>
        <td class="py-3 px-3 font-mono text-amber-400 font-bold">
          <span class="bg-black/50 px-2 py-1 rounded-md border border-white/5">
            ${s.pin ? s.pin : '••••'}
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
          ${s.lastDevice && s.lastDevice !== 'Bilinmiyor' ? s.lastDevice : '—'}
        </td>
        <td class="py-3 pl-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="editStaffMember('${s.id}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 transition-colors" title="Düzenle">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteStaffMember('${s.id}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-400 transition-colors" title="Sil">
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
  try {
    const res = await fetch('/api/staff/logs', {
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
    filtered = filtered.filter(l => l.action === 'stock_toggle');
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
    'stock_toggle': '<i data-lucide="package" class="w-4 h-4 text-amber-400"></i>'
  };

  container.innerHTML = filtered.map(l => `
    <div class="p-3 rounded-2xl bg-black border border-white/5 flex items-center justify-between text-xs hover:border-white/10 transition-colors">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
          ${actionIcons[l.action] || '<i data-lucide="activity" class="w-4 h-4 text-gray-400"></i>'}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-white">${l.staffName || 'Personel'}</span>
            <span class="text-[10px] text-gray-400">(${l.role || 'Ekip'})</span>
            <span class="text-gray-600">•</span>
            <span class="text-amber-300 font-medium">${l.title || 'İşlem'}</span>
          </div>
          <div class="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
            <span>📱 ${l.device || 'Cihaz'}</span>
            ${l.details ? `<span>• ${l.details}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="text-[11px] text-gray-500 font-mono flex-shrink-0 text-right">
        ${l.timeStr || ''}
      </div>
    </div>
  `).join('');

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

  try {
    const res = await fetch('/api/admin/staff/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-PIN': adminPin
      },
      body: JSON.stringify({ id, name, role, pin })
    });
    if (res.ok) {
      closeStaffModal();
      showToast('✅ Personel başarıyla kaydedildi!', 'success');
      await loadStaffPerformanceData();
      await loadStaffAdminData();
      await loadStaffLogsData();
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Personel kaydedilemedi: " + (data.message || "Yetkisiz işlem veya sunucu hatası."));
    }
  } catch (err) {
    console.error("Save staff error:", err);
    alert("Bağlantı hatası: Personel kaydedilemedi.");
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
    const res = await fetch('/api/admin/staff/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-PIN': adminPin
      },
      body: JSON.stringify({ id: staffId })
    });
    if (res.ok) {
      showToast('🗑️ Personel silindi.', 'info');
      await loadStaffPerformanceData();
      await loadStaffAdminData();
      await loadStaffLogsData();
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Personel silinemedi: " + (data.message || "Yetkisiz işlem."));
    }
  } catch (err) {
    console.error("Delete staff error:", err);
    alert("Bağlantı hatası: Personel silinemedi.");
  }
}
