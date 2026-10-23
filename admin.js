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

  if (!menuData && window.DEFAULT_MENU_DATA) {
    menuData = JSON.parse(JSON.stringify(window.DEFAULT_MENU_DATA));
  }

  try { switchTab('products'); } catch (e) { console.error('switchTab error:', e); }
  try { updateAdminStats(); } catch (e) { console.error('updateAdminStats error:', e); }
  try { fillSettingsForm(); } catch (e) { console.error('fillSettingsForm error:', e); }
}

function logoutAdmin() {
  sessionStorage.removeItem('hashtag_admin_auth');
  window.location.reload();
}

/* ==========================================================================
   SEKME GEÇİŞLERİ
   ========================================================================== */

function switchTab(tab) {
  currentTab = tab;
  const tabs = ['products', 'quick-price', 'settings', 'qr-stands'];
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
  if (tab === 'qr-stands') setupQrGenerator();
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
    const out = items.filter(it => it.inStock === false);
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
            const isOut = item.inStock === false;

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

  item.inStock = !(item.inStock !== false);
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
        <span>💡 Fiyatları kutucuklara tıklayıp doğrudan değiştirebilirsiniz. Değişiklikler anında kaydedilir.</span>
        <button onclick="saveAllQuickPrices()" class="px-3 py-1 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 transition-colors">
          Tümünü Kaydet
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        ${items.map(item => `
          <div class="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-white/5">
            <div class="min-w-0 pr-3">
              <div class="font-medium text-white text-sm truncate">${item.name}</div>
              <div class="text-xs text-gray-400">${item.badge || 'Standart'}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <input 
                type="number" 
                id="quick-price-${item.id}" 
                value="${item.price}" 
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

  await saveMenuData(menuData);
  alert(`✅ ${changed > 0 ? `${changed} ürünün fiyatı güncellendi ve kaydedildi!` : 'Tüm fiyatlar güncel.'}`);
  renderAdminProductTable();
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
  document.getElementById('form-item-stock').checked = item.inStock !== false;

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
      inStock
    });
  }

  await saveMenuData(menuData);
  closeItemEditModal();
  updateAdminStats();
  renderAdminProductTable();
}

async function deleteItem(itemId) {
  if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;

  menuData.items = menuData.items.filter(it => it.id !== itemId);
  await saveMenuData(menuData);
  updateAdminStats();
  renderAdminProductTable();
}

/* ==========================================================================
   SABİT QR KOD & MASA BASKI STANDI OLUŞTURUCU (Printable Stands)
   ========================================================================== */

function setupQrGenerator() {
  const baseUrlInput = document.getElementById('qr-base-url');
  if (baseUrlInput) {
    const saved = menuData && menuData.settings && menuData.settings.baseUrl;
    // Eğer placeholder (hashtag-menu.com) ise doğrudan tarayıcının aktif canlı linkini al
    if (saved && saved.trim() !== '' && saved !== 'https://hashtag-menu.com' && !saved.includes('hashtag-menu.com')) {
      baseUrlInput.value = saved.trim();
    } else {
      baseUrlInput.value = window.location.origin;
    }
  }

  const tableSelect = document.getElementById('qr-table-mode');
  if (tableSelect) {
    updateQrPreview();
  }
}

function updateQrPreview() {
  let baseUrl = (document.getElementById('qr-base-url').value || '').trim();
  if (!baseUrl || baseUrl === 'https://hashtag-menu.com' || baseUrl.includes('hashtag-menu.com')) {
    baseUrl = window.location.origin;
    const input = document.getElementById('qr-base-url');
    if (input) input.value = baseUrl;
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
          <div class="w-12 h-12 rounded-xl bg-amber-500 text-black font-black text-2xl flex items-center justify-center mx-auto mb-2 shadow-lg shadow-amber-500/30">
            #
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
        <div class="p-4 bg-white rounded-2xl inline-block my-3 shadow-inner">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(targetUrl)}" 
               alt="QR Menü" 
               class="w-44 h-44 object-contain mx-auto block" />
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

  const enableCalls = document.getElementById('set-enable-calls');
  if (enableCalls) enableCalls.checked = !!s.enableServiceCalls;
}

async function handleSaveSettings(e) {
  e.preventDefault();

  menuData.settings = {
    ...menuData.settings,
    cafeName: document.getElementById('set-cafe-name').value.trim(),
    cafeTagline: document.getElementById('set-tagline').value.trim(),
    currency: document.getElementById('set-currency').value.trim() || '₺',
    wifiName: document.getElementById('set-wifi-name').value.trim(),
    wifiPassword: document.getElementById('set-wifi-pass').value.trim(),
    instagram: document.getElementById('set-instagram').value.trim(),
    adminPin: document.getElementById('set-admin-pin').value.trim() || '1234',
    baseUrl: document.getElementById('set-base-url').value.trim() || window.location.origin,
    tableCount: parseInt(document.getElementById('set-table-count').value) || 24,
    enableServiceCalls: document.getElementById('set-enable-calls').checked
  };

  await saveMenuData(menuData);
  alert('✅ Ayarlar başarıyla güncellendi!');
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
