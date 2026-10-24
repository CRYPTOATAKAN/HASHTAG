// HASHTAG Lounge & Hookah - Personel & Garson Portalı JavaScript Motoru

let staffAuthPin = sessionStorage.getItem('hashtag_staff_pin') || null;
let currentTab = 'calls';
let currentFilter = 'all';
let currentStockCategory = 'all';
let stockSearchQuery = '';
let activeCalls = [];
let knownCallIds = new Set();
let menuData = null;
let audioEnabled = true;
let audioCtx = null;
let pollInterval = null;

// =========================================================================
// 1. PIN GİRİŞİ & OTURUM YÖNETİMİ
// =========================================================================

function keypadPress(digit) {
  const input = document.getElementById('staff-pin-input');
  if (input && input.value.length < 6) {
    input.value += digit;
  }
}

function keypadClear() {
  const input = document.getElementById('staff-pin-input');
  if (input) {
    input.value = '';
  }
}

async function handlePinSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('staff-pin-input');
  const errorEl = document.getElementById('pin-error');
  const pin = input ? input.value.trim() : '';

  if (!pin) return;

  // Ses motorunu kullanıcı etkileşimiyle ilk kez uyandır (Web Audio Context Kilidi)
  unlockAudio();

  // Menü verisinden veya varsayılan ayarlardan PIN doğrula
  let isValid = false;
  if (!menuData) await loadMenuData();

  const settings = menuData ? menuData.settings : (window.DEFAULT_MENU_DATA ? window.DEFAULT_MENU_DATA.settings : {});
  const staffPin = settings.staffPin || "5555";
  const adminPin = settings.adminPin || "1234";

  if (pin === staffPin || pin === adminPin) {
    isValid = true;
  }

  if (isValid) {
    staffAuthPin = pin;
    sessionStorage.setItem('hashtag_staff_pin', pin);
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('staff-app').classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    
    // Lucide ikonlarını yenile
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Verileri başlat ve polling kur
    initStaffDashboard();
  } else {
    if (errorEl) errorEl.classList.remove('hidden');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function staffLogout() {
  staffAuthPin = null;
  sessionStorage.removeItem('hashtag_staff_pin');
  document.getElementById('staff-app').classList.add('hidden');
  document.getElementById('login-modal').classList.remove('hidden');
  const input = document.getElementById('staff-pin-input');
  if (input) {
    input.value = '';
    input.focus();
  }
}

// =========================================================================
// 2. SESLİ UYARI & BİLDİRİM MOTORU (WEB AUDIO API & PUSH)
// =========================================================================

function unlockAudio() {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (err) {
    console.warn("Audio Context unlock error:", err);
  }
}

// Köz İste Zili: Çift tonlu sıcak nargile akoru (D5 -> A5)
function playCoalChime() {
  if (!audioEnabled) return;
  unlockAudio();
  if (!audioCtx) return;

  try {
    const now = audioCtx.currentTime;
    
    // Ton 1: D5 (587.33 Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.4, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Ton 2: A5 (880.00 Hz)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.00, now + 0.15);
    gain2.gain.setValueAtTime(0, now + 0.15);
    gain2.gain.linearRampToValueAtTime(0.5, now + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.85);
  } catch (e) {
    console.warn("Chime error:", e);
  }
}

// Garson Çağrısı Zili: Parlak servis çanı (E5 -> B5)
function playWaiterChime() {
  if (!audioEnabled) return;
  unlockAudio();
  if (!audioCtx) return;

  try {
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.12); // B5
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.9);
  } catch (e) {
    console.warn("Chime error:", e);
  }
}

function testOrToggleAudio() {
  unlockAudio();
  playCoalChime();
  if ('vibrate' in navigator) navigator.vibrate([150, 80, 150]);
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert("Tarayıcınız bildirim özelliğini desteklemiyor.");
    return;
  }

  const perm = await Notification.requestPermission();
  updateNotifyBtnState();

  if (perm === 'granted') {
    new Notification("🔥 HASHTAG Personel Portalı", {
      body: "Bildirimler başarıyla açıldı! Masa çağrıları kilit ekranınıza gelecek.",
      icon: "hashtag-logo.jpg"
    });
  }
}

function updateNotifyBtnState() {
  const btn = document.getElementById('notify-perm-btn');
  if (!btn || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i><span class="hidden sm:inline text-emerald-400">Bildirim Açık</span>`;
    btn.classList.add('border-emerald-500/30', 'bg-emerald-500/10');
  } else {
    btn.innerHTML = `<i data-lucide="bell" class="w-4 h-4 text-blue-400"></i><span class="hidden sm:inline">Bildirimleri Aç</span>`;
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function triggerCallNotification(call) {
  // 1. Ses Çal
  if (call.type === 'coal') {
    playCoalChime();
  } else {
    playWaiterChime();
  }

  // 2. Titreşim (Mobil Cihazlar İçin)
  if ('vibrate' in navigator) {
    navigator.vibrate([250, 100, 250, 100, 350]);
  }

  // 3. Sistem / Kilit Ekranı Bildirimi (PWA / Web Notification)
  if ('Notification' in window && Notification.permission === 'granted') {
    const title = call.type === 'coal' 
      ? `🔥 ${call.table}: Köz Değişimi İstedi!`
      : (call.type === 'bill' ? `💳 ${call.table}: Hesap İstedi!` : `🛎️ ${call.table}: Garson Çağırıyor!`);
    
    const body = call.note ? `Not: ${call.note}` : `${call.table} numaralı masa servis bekliyor.`;

    try {
      new Notification(title, {
        body: body,
        icon: 'hashtag-logo.jpg',
        badge: 'hashtag-logo.jpg',
        tag: call.id,
        renotify: true
      });
    } catch (e) {
      console.warn("Notification trigger error:", e);
    }
  }
}

// =========================================================================
// 3. ÇAĞRI VERİSİ & POLLING YÖNETİMİ
// =========================================================================

async function fetchCalls() {
  try {
    const res = await fetch('/api/calls', { cache: 'no-store' });
    if (!res.ok) throw new Error("Fetch calls failed");
    const data = await res.json();
    return data.calls || [];
  } catch (e) {
    // Fallback: Localstorage veya boş
    const local = localStorage.getItem('hashtag_calls_mock');
    return local ? JSON.parse(local) : [];
  }
}

async function updateCallsLoop() {
  const calls = await fetchCalls();
  
  // Yeni gelen bekleyen çağrıları tespit et
  let hasNewPending = false;
  calls.forEach(call => {
    if (call.status === 'pending' && !knownCallIds.has(call.id)) {
      hasNewPending = true;
      triggerCallNotification(call);
    }
    knownCallIds.add(call.id);
  });

  activeCalls = calls;
  renderCallsView();
  renderTablesGrid();
}

function renderCallsView() {
  const container = document.getElementById('active-calls-container');
  const emptyView = document.getElementById('no-calls-view');
  const completedSection = document.getElementById('completed-calls-section');
  const completedContainer = document.getElementById('completed-calls-container');
  const badgeCount = document.getElementById('badge-calls-count');

  if (!container) return;

  // Filtreleme
  let filtered = activeCalls;
  if (currentFilter !== 'all') {
    filtered = filtered.filter(c => c.type === currentFilter);
  }

  const pendingCalls = filtered.filter(c => c.status === 'pending' || c.status === 'in_progress');
  const completedCalls = filtered.filter(c => c.status === 'completed');

  if (badgeCount) {
    badgeCount.textContent = pendingCalls.length;
    badgeCount.className = pendingCalls.length > 0 
      ? 'px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black animate-pulse'
      : 'px-2 py-0.5 rounded-full bg-white/10 text-gray-400 text-[10px] font-semibold';
  }

  if (pendingCalls.length === 0) {
    container.innerHTML = '';
    if (emptyView) emptyView.classList.remove('hidden');
  } else {
    if (emptyView) emptyView.classList.add('hidden');
    container.innerHTML = pendingCalls.map(call => renderCallCard(call)).join('');
  }

  // Tamamlananlar bölümü
  if (completedCalls.length > 0) {
    if (completedSection) completedSection.classList.remove('hidden');
    if (completedContainer) {
      completedContainer.innerHTML = completedCalls.slice(0, 5).map(c => renderCompletedCard(c)).join('');
    }
  } else {
    if (completedSection) completedSection.classList.add('hidden');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function getElapsedText(timestamp) {
  if (!timestamp) return 'Şimdi';
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (sec < 60) return `${sec} sn önce`;
  const min = Math.floor(sec / 60);
  return `${min} dk önce`;
}

function renderCallCard(call) {
  const isCoal = call.type === 'coal';
  const isBill = call.type === 'bill';
  const isInProgress = call.status === 'in_progress';

  const pulseClass = isCoal ? 'call-pulse-coal' : 'call-pulse-waiter';
  const typeBg = isCoal 
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
    : (isBill ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30');

  const elapsed = getElapsedText(call.createdTimestamp);

  return `
    <div class="relative rounded-2xl bg-neutral-900/90 border border-white/10 p-4 shadow-xl transition-all ${!isInProgress ? pulseClass : 'border-blue-500/40 bg-blue-950/20'}">
      <div class="flex items-start justify-between gap-3">
        
        <!-- Masa ve Tür Bilgisi -->
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-2xl bg-black border border-white/15 flex flex-col items-center justify-center font-black text-amber-400 shadow-inner">
            <span class="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">MASA</span>
            <span class="text-xl leading-none mt-0.5 text-white">${call.table.replace(/\D/g, '') || call.table}</span>
          </div>

          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-bold tracking-wide uppercase ${typeBg}">
                <i data-lucide="${call.icon || 'bell'}" class="w-3.5 h-3.5 ${isCoal ? 'flame-anim text-amber-400' : ''}"></i>
                ${call.typeName || (isCoal ? 'Köz Değişimi' : 'Garson Çağrısı')}
              </span>
              
              ${isInProgress ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">
                  🏃 ${call.handler || 'Yolda'}
                </span>
              ` : `
                <span class="text-[11px] font-medium text-amber-400 animate-pulse">Yeni Çağrı</span>
              `}
            </div>

            <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
              <span class="flex items-center gap-1">
                <i data-lucide="clock" class="w-3 h-3 text-gray-500"></i> ${elapsed}
              </span>
              ${call.note ? `<span class="text-gray-300 bg-white/5 px-2 py-0.5 rounded-md">"${call.note}"</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Eylemler (Butonlar) -->
        <div class="flex items-center gap-2">
          ${!isInProgress ? `
            <button 
              onclick="updateCallStatus('${call.id}', 'in_progress')" 
              class="px-3.5 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-md"
            >
              <i data-lucide="footprints" class="w-4 h-4 text-blue-400"></i>
              <span>Yoldayım</span>
            </button>
          ` : ''}

          <button 
            onclick="updateCallStatus('${call.id}', 'completed')" 
            class="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
          >
            <i data-lucide="check" class="w-4 h-4"></i>
            <span>Tamamla</span>
          </button>
        </div>

      </div>
    </div>
  `;
}

function renderCompletedCard(c) {
  return `
    <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>
        <span class="font-bold text-gray-300">${c.table}</span>
        <span>•</span>
        <span>${c.typeName}</span>
      </div>
      <span class="text-[11px] text-gray-500">${getElapsedText(c.createdTimestamp)}</span>
    </div>
  `;
}

async function updateCallStatus(callId, newStatus) {
  try {
    const res = await fetch('/api/calls/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-PIN': staffAuthPin || '5555'
      },
      body: JSON.stringify({
        callId,
        status: newStatus,
        handler: 'Personel'
      })
    });
    if (res.ok) {
      await updateCallsLoop();
    }
  } catch (e) {
    console.error("Status update error:", e);
  }
}

async function clearCompletedCalls() {
  if (!confirm("Tamamlanan çağrı geçmişi temizlensin mi?")) return;
  try {
    await fetch('/api/calls/clear', {
      method: 'POST',
      headers: { 'X-Staff-PIN': staffAuthPin || '5555' }
    });
    await updateCallsLoop();
  } catch (e) {
    console.error("Clear calls error:", e);
  }
}

function filterCalls(type) {
  currentFilter = type;
  ['all', 'coal', 'waiter', 'bill'].forEach(t => {
    const btn = document.getElementById(`filter-${t}`);
    if (btn) {
      if (t === type) {
        btn.className = 'px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-bold transition-all';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium border border-white/10 transition-all flex items-center gap-1';
      }
    }
  });
  renderCallsView();
}

// =========================================================================
// 4. KISITLI YETKİLİ ÜRÜN STOK YÖNETİMİ (TÜKENDİ / MEVCUT)
// =========================================================================

async function loadMenuData() {
  try {
    const res = await fetch('/api/menu', { cache: 'no-store' });
    if (res.ok) {
      menuData = await res.json();
      return;
    }
  } catch (e) {}

  if (window.DEFAULT_MENU_DATA) {
    menuData = JSON.parse(JSON.stringify(window.DEFAULT_MENU_DATA));
  }
}

function renderStockCategories() {
  const container = document.getElementById('stock-categories-pills');
  if (!container || !menuData) return;

  const cats = [{ id: 'all', name: 'Tüm Ürünler' }, ...(menuData.categories || [])];
  container.innerHTML = cats.map(c => `
    <button 
      onclick="filterStockCategory('${c.id}')" 
      class="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${currentStockCategory === c.id ? 'bg-amber-500 text-black font-bold' : 'bg-neutral-900 border border-white/10 text-gray-300 hover:text-white'}"
    >
      ${c.name}
    </button>
  `).join('');
}

function filterStockCategory(catId) {
  currentStockCategory = catId;
  renderStockCategories();
  renderStockItems();
}

function handleStockSearch(val) {
  stockSearchQuery = (val || '').toLowerCase().trim();
  renderStockItems();
}

function renderStockItems() {
  const container = document.getElementById('stock-items-container');
  if (!container || !menuData) return;

  let items = menuData.items || [];

  if (currentStockCategory !== 'all') {
    items = items.filter(it => it.categoryId === currentStockCategory);
  }

  if (stockSearchQuery) {
    items = items.filter(it => 
      it.name.toLowerCase().includes(stockSearchQuery) || 
      (it.description && it.description.toLowerCase().includes(stockSearchQuery))
    );
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-gray-500">Ürün bulunamadı.</div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const isAvailable = item.isAvailable !== false;
    return `
      <div class="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-900/80 border border-white/10 transition-colors ${!isAvailable ? 'opacity-60 bg-red-950/10 border-red-500/20' : ''}">
        
        <!-- Ürün Bilgisi (Salt Okunur - Fiyat ASLA Değiştirilemez) -->
        <div class="flex items-center gap-3 pr-2 flex-1 min-w-0">
          <div class="w-11 h-11 rounded-xl bg-black border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
            ${item.image 
              ? `<img src="${item.image}" alt="" class="w-full h-full object-cover" onerror="this.src='hashtag-logo.jpg'" />`
              : `<i data-lucide="package" class="w-5 h-5 text-gray-500"></i>`}
          </div>

          <div class="min-w-0 flex-1">
            <h4 class="text-sm font-bold text-white truncate">${item.name}</h4>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-xs font-mono font-semibold text-amber-400">${item.price} ₺</span>
              <span class="text-[10px] text-gray-500">•</span>
              <span class="text-[11px] ${isAvailable ? 'text-emerald-400 font-medium' : 'text-red-400 font-bold'}">
                ${isAvailable ? 'Mevcut' : 'Tükendi'}
              </span>
            </div>
          </div>
        </div>

        <!-- Stok Aç-Kapa Anahtarı -->
        <button 
          onclick="toggleItemStock('${item.id}', ${!isAvailable})" 
          class="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 flex-shrink-0 ${isAvailable ? 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20'}"
        >
          <i data-lucide="${isAvailable ? 'slash' : 'check'}" class="w-3.5 h-3.5"></i>
          <span>${isAvailable ? 'Tükendi Yap' : 'Stokta Var'}</span>
        </button>

      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function toggleItemStock(itemId, newAvailable) {
  // Optimistic UI güncelleme
  if (menuData && menuData.items) {
    const item = menuData.items.find(i => i.id === itemId);
    if (item) item.isAvailable = newAvailable;
    renderStockItems();
  }

  try {
    const res = await fetch('/api/staff/toggle-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Staff-PIN': staffAuthPin || '5555'
      },
      body: JSON.stringify({
        itemId,
        isAvailable: newAvailable
      })
    });
    if (!res.ok) {
      alert("Stok durumu güncellenemedi veya yetkiniz yok.");
      await loadMenuData();
      renderStockItems();
    }
  } catch (e) {
    console.error("Toggle stock error:", e);
  }
}

// =========================================================================
// 5. MASA HARİTASI (1-24 MASA GÖRÜNÜMÜ)
// =========================================================================

function renderTablesGrid() {
  const container = document.getElementById('tables-grid-container');
  if (!container || !menuData) return;

  const tableCount = (menuData.settings && menuData.settings.tableCount) || 24;
  const callsByTable = {};
  
  activeCalls.filter(c => c.status === 'pending' || c.status === 'in_progress').forEach(c => {
    const num = c.table.replace(/\D/g, '') || c.table;
    callsByTable[num] = c;
  });

  let html = '';
  for (let i = 1; i <= tableCount; i++) {
    const call = callsByTable[String(i)];
    const hasCall = !!call;
    const isCoal = hasCall && call.type === 'coal';
    const isBill = hasCall && call.type === 'bill';

    let cardBg = 'bg-neutral-900 border-white/10 hover:border-white/20';
    let icon = '';

    if (hasCall) {
      if (isCoal) {
        cardBg = 'bg-amber-500/20 border-amber-500/60 call-pulse-coal';
        icon = '<i data-lucide="flame" class="w-4 h-4 text-amber-400 flame-anim"></i>';
      } else if (isBill) {
        cardBg = 'bg-emerald-500/20 border-emerald-500/60';
        icon = '<i data-lucide="credit-card" class="w-4 h-4 text-emerald-400"></i>';
      } else {
        cardBg = 'bg-cyan-500/20 border-cyan-500/60 call-pulse-waiter';
        icon = '<i data-lucide="bell" class="w-4 h-4 text-cyan-400 animate-bounce"></i>';
      }
    }

    html += `
      <div class="p-3 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${cardBg}">
        <span class="text-[10px] text-gray-400 font-semibold uppercase">Masa</span>
        <span class="text-xl font-black ${hasCall ? 'text-amber-300' : 'text-white'}">${i}</span>
        <div class="h-5 flex items-center justify-center mt-1">
          ${icon || '<span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>'}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// =========================================================================
// 6. SEKME GEÇİŞLERİ & BAŞLATMA
// =========================================================================

function switchTab(tabId) {
  currentTab = tabId;

  ['calls', 'stock', 'tables'].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    
    if (btn && content) {
      if (t === tabId) {
        btn.classList.add('border-amber-500', 'text-amber-400');
        btn.classList.remove('border-transparent', 'text-gray-400');
        content.classList.remove('hidden');
      } else {
        btn.classList.remove('border-amber-500', 'text-amber-400');
        btn.classList.add('border-transparent', 'text-gray-400');
        content.classList.add('hidden');
      }
    }
  });

  if (tabId === 'stock') {
    renderStockCategories();
    renderStockItems();
  } else if (tabId === 'tables') {
    renderTablesGrid();
  }
}

async function initStaffDashboard() {
  await loadMenuData();
  updateNotifyBtnState();
  await updateCallsLoop();

  // Her 2.5 saniyede bir yeni çağrı kontrolü
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(updateCallsLoop, 2500);

  // Service Worker kaydı (PWA & Kilit ekranı bildirimleri için)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn("SW register error:", err);
    });
  }
}

// Sayfa yüklendiğinde otomatik kontrol
document.addEventListener('DOMContentLoaded', async () => {
  await loadMenuData();

  if (staffAuthPin) {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('staff-app').classList.remove('hidden');
    initStaffDashboard();
  } else {
    document.getElementById('login-modal').classList.remove('hidden');
    const input = document.getElementById('staff-pin-input');
    if (input) input.focus();
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
});
