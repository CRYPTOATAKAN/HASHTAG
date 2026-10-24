// HASHTAG Lounge & Hookah - Personel & Vardiya Portalı JavaScript Motoru

let currentStaff = JSON.parse(sessionStorage.getItem('hashtag_current_staff') || 'null');
let selectedStaffToLogin = null;
let currentDevice = detectDevice();
let currentTab = 'calls';
let currentFilter = 'all';
let currentStockCategory = 'all';
let stockSearchQuery = '';
let activeCalls = [];
let knownCallIds = new Set();
let activeHookahTimers = {};
let menuData = null;
let staffList = [];
let audioEnabled = true;
let audioCtx = null;
let pollInterval = null;
let lastStaffMenuVersion = null;

const staffSyncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hashtag_menu_sync') : null;
if (staffSyncChannel) {
  staffSyncChannel.onmessage = async (ev) => {
    if (ev.data === 'sync') {
      await loadMenuData();
      if (currentStockCategory !== 'all' && menuData && Array.isArray(menuData.categories)) {
        if (!menuData.categories.some(c => c.id === currentStockCategory)) {
          currentStockCategory = 'all';
        }
      }
      renderStockCategories();
      renderStockItems();
      renderTablesGrid();
    }
  };
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =========================================================================
// 1. CİHAZ TESPİTİ (USER-AGENT ANALİZİ)
// =========================================================================

function detectDevice() {
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) {
    return 'Apple iPhone (iOS)';
  } else if (/iPad/i.test(ua)) {
    return 'Apple iPad';
  } else if (/Android/i.test(ua)) {
    const match = ua.match(/Android[^;]+; ([^;]+)\)/);
    if (match && match[1]) {
      const model = match[1].replace(/Build\/.*/, '').trim();
      return `Android (${model})`;
    }
    return 'Android Cihaz';
  } else if (/Macintosh/i.test(ua)) {
    return 'Mac / macOS';
  } else if (/Windows/i.test(ua)) {
    return 'Windows PC';
  }
  return 'Mobil / Web Cihaz';
}

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return '';
  }
  return 'https://p01--hashtag--xqx4khzq6gkf.code.run';
}

function resolveStaffImageUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return '';
  const clean = url.trim();
  if (clean.startsWith('/uploads/')) {
    const apiBase = getApiBaseUrl();
    return apiBase ? `${apiBase}${clean}` : clean;
  }
  return clean;
}

// =========================================================================
// 2. PERSONEL SEÇİMİ & PIN DOĞRULAMA (VARDİYA GİRİŞİ)
// =========================================================================

async function fetchStaffList() {
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/staff/list', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      staffList = data.staff || [];
      renderStaffSelectionGrid();
    }
  } catch (e) {
    console.warn("Fetch staff list error:", e);
    // Fallback
    staffList = [
      { id: 'staff-1', name: 'Ahmet Yılmaz', role: 'Garson', avatar: 'waiter' },
      { id: 'staff-2', name: 'Murat Demir', role: 'Közcü', avatar: 'hookah' },
      { id: 'staff-3', name: 'Can Polat', role: 'Bar / Kasa', avatar: 'bar' }
    ];
    renderStaffSelectionGrid();
  }
}

function renderStaffSelectionGrid() {
  const container = document.getElementById('staff-members-grid');
  if (!container) return;

  const roleIcons = {
    'Garson': 'user-check',
    'Közcü': 'flame',
    'Bar / Kasa': 'wine',
    'Bar': 'wine',
    'Kasa': 'credit-card'
  };

  container.innerHTML = staffList.map(s => `
    <button 
      onclick="selectStaffMember('${s.id}')"
      class="w-full p-3 rounded-2xl bg-black border border-white/10 hover:border-amber-500/60 hover:bg-neutral-900 flex items-center justify-between text-left transition-all active:scale-98 group shadow-sm"
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold transition-colors">
          <i data-lucide="${roleIcons[s.role] || 'user'}" class="w-5 h-5"></i>
        </div>
        <div>
          <h4 class="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">${s.name}</h4>
          <p class="text-[11px] text-gray-400">${s.role}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        ${s.isOnline ? `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Vardiyada
          </span>
        ` : ''}
        <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 group-hover:text-amber-400 transition-colors"></i>
      </div>
    </button>
  `).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectStaffMember(staffId) {
  const staff = staffList.find(s => s.id === staffId);
  if (!staff) return;

  selectedStaffToLogin = staff;
  document.getElementById('step-select-staff').classList.add('hidden');
  document.getElementById('step-enter-pin').classList.remove('hidden');

  document.getElementById('selected-staff-name').textContent = staff.name;
  document.getElementById('selected-staff-role').textContent = staff.role;

  const input = document.getElementById('staff-pin-input');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function selectAdminLogin() {
  selectedStaffToLogin = { id: 'admin', name: 'Yönetici', role: 'Yönetici' };
  document.getElementById('step-select-staff').classList.add('hidden');
  document.getElementById('step-enter-pin').classList.remove('hidden');

  document.getElementById('selected-staff-name').textContent = 'Yönetici Girişi';
  document.getElementById('selected-staff-role').textContent = 'Tam Yetki';

  const input = document.getElementById('staff-pin-input');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function backToStaffSelection() {
  selectedStaffToLogin = null;
  document.getElementById('step-enter-pin').classList.add('hidden');
  document.getElementById('step-select-staff').classList.remove('hidden');
  const errorEl = document.getElementById('pin-error');
  if (errorEl) errorEl.classList.add('hidden');
}

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

async function handleStaffPinSubmit(e) {
  if (e) e.preventDefault();
  if (!selectedStaffToLogin) return;

  const input = document.getElementById('staff-pin-input');
  const errorEl = document.getElementById('pin-error');
  const pin = input ? input.value.trim() : '';

  if (!pin) return;

  unlockAudio();

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: selectedStaffToLogin.id,
        pin: pin,
        device: currentDevice
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      currentStaff = data.staff;
      sessionStorage.setItem('hashtag_current_staff', JSON.stringify(currentStaff));
      
      document.getElementById('login-modal').classList.add('hidden');
      document.getElementById('staff-app').classList.remove('hidden');
      if (errorEl) errorEl.classList.add('hidden');

      updateHeaderStaffInfo();
      initStaffDashboard();
      
      // Kilit Ekranı Web Push aboneliğini otomatik kontrol et/başlat
      autoRegisterWebPush();
    } else {
      if (errorEl) {
        errorEl.textContent = data.message || "Hatalı PIN Kodu!";
        errorEl.classList.remove('hidden');
      }
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  } catch (err) {
    console.error("Staff login error:", err);
    if (errorEl) {
      errorEl.textContent = "Giriş yapılamadı, lütfen sunucu bağlantınızı kontrol edin.";
      errorEl.classList.remove('hidden');
    }
  }
}

async function staffLogout() {
  if (!confirm("Vardiyanızı bitirip çıkış yapmak istiyor musunuz?")) return;

  try {
    if (currentStaff) {
      const apiBase = getApiBaseUrl();
      await fetch(apiBase + '/api/staff/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: currentStaff.id,
          device: currentDevice
        })
      });
    }
  } catch (e) {
    console.warn("Logout error:", e);
  }

  currentStaff = null;
  sessionStorage.removeItem('hashtag_current_staff');
  if (pollInterval) clearInterval(pollInterval);

  document.getElementById('staff-app').classList.add('hidden');
  document.getElementById('login-modal').classList.remove('hidden');
  backToStaffSelection();
  fetchStaffList();
}

function updateHeaderStaffInfo() {
  if (!currentStaff) return;
  const nameEl = document.getElementById('header-staff-name');
  const roleEl = document.getElementById('header-staff-role');
  const devEl = document.getElementById('header-device-text');

  if (nameEl) nameEl.textContent = currentStaff.name;
  if (roleEl) roleEl.innerHTML = `${currentStaff.role} • <span class="text-gray-500">${currentDevice}</span>`;
  if (devEl) devEl.textContent = currentDevice;
}

// =========================================================================
// 3. WEB PUSH (KİLİT EKRANI BİLDİRİM SİSTEMİ - APNs & FCM)
// =========================================================================

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function enableWebPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert("Cihazınız Web Push bildirimini desteklemiyor veya tarayıcı kısıtlaması var.\n\nİpucu: iPhone kullanıyorsanız Safari menüsünden 'Ana Ekrana Ekle' yapınız.");
    return;
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      alert("Bildirim izni verilmedi. Lütfen telefon ayarlarından bildirimlere izin veriniz.");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    
    const apiBase = getApiBaseUrl();
    const vapidRes = await fetch(apiBase + '/api/push/vapid-public-key');
    const vapidData = await vapidRes.json();
    const publicKey = vapidData.publicKey;

    if (!publicKey) {
      alert("Push sunucu anahtarı alınamadı.");
      return;
    }

    // PushManager'a abone ol
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey)
    });

    // Aboneliği sunucumuza kaydet
    await fetch(apiBase + '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription,
        staffId: currentStaff ? currentStaff.id : 'unknown',
        staffName: currentStaff ? currentStaff.name : 'Personel',
        device: currentDevice
      })
    });

    updatePushBtnState(true);
    alert("✅ Kilit ekranı bildirimleri başarıyla aktif edildi!\n\nTelefonunuz kilitliyken bile masa çağrıları ekrana sesli ve titreşimli olarak düşecektir.");
  } catch (err) {
    console.error("Web Push registration error:", err);
    alert(`Bildirim kurulum hatası: ${err.message}`);
  }
}

async function autoRegisterWebPush() {
  if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub && currentStaff) {
        const apiBase = getApiBaseUrl();
        await fetch(apiBase + '/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub,
            staffId: currentStaff.id,
            staffName: currentStaff.name,
            device: currentDevice
          })
        });
        updatePushBtnState(true);
      }
    } catch (e) {}
  }
}

function updatePushBtnState(isSubscribed) {
  const btn = document.getElementById('notify-perm-btn');
  const label = document.getElementById('notify-perm-label');
  if (!btn) return;

  if (isSubscribed || (window.Notification && Notification.permission === 'granted')) {
    btn.className = 'px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-400 flex items-center gap-1.5';
    if (label) label.textContent = 'Kilit Bildirimi Aktif';
  } else {
    btn.className = 'px-2.5 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-xs font-medium text-blue-300 flex items-center gap-1.5';
    if (label) label.textContent = 'Kilit Bildirimini Aç';
  }
}

// =========================================================================
// 4. SESLİ UYARI MOTORU (WEB AUDIO API SYNTHESIZER)
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
    console.warn("Audio unlock err:", err);
  }
}

function playCoalChime() {
  if (!audioEnabled) return;
  unlockAudio();
  if (!audioCtx) return;

  try {
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.4, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.00, now + 0.15); // A5
    gain2.gain.setValueAtTime(0, now + 0.15);
    gain2.gain.linearRampToValueAtTime(0.5, now + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.85);
  } catch (e) {}
}

function playWaiterChime() {
  if (!audioEnabled) return;
  unlockAudio();
  if (!audioCtx) return;

  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.9);
  } catch (e) {}
}

function testOrToggleAudio() {
  unlockAudio();
  playCoalChime();
  if ('vibrate' in navigator) navigator.vibrate([150, 80, 150]);
}

function triggerInAppAlert(call) {
  if (call.type === 'coal') {
    playCoalChime();
  } else {
    playWaiterChime();
  }
  if ('vibrate' in navigator) {
    navigator.vibrate([250, 100, 250, 100, 350]);
  }
}

// =========================================================================
// 5. ÇAĞRI VERİSİ & POLLING MOTORU
// =========================================================================

async function fetchCalls() {
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/calls', { cache: 'no-store' });
    if (!res.ok) throw new Error("Fetch calls failed");
    const data = await res.json();
    if (data.hookahTimers) {
      activeHookahTimers = data.hookahTimers;
    }
    return data.calls || [];
  } catch (e) {
    return [];
  }
}

async function resetTableHookahTimer(tableName) {
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/staff/hookah-timer/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: tableName,
        staffName: currentStaff ? currentStaff.name : 'Personel'
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.timers) activeHookahTimers = data.timers;
      renderTablesGrid();
    }
  } catch (e) {
    console.error("Reset hookah timer error:", e);
  }
}

async function updateCallsLoop() {
  const calls = await fetchCalls();
  
  calls.forEach(call => {
    if (call.status === 'pending' && !knownCallIds.has(call.id)) {
      triggerInAppAlert(call);
    }
    knownCallIds.add(call.id);
  });

  activeCalls = calls;
  renderCallsView();
  renderTablesGrid();

  // Menü versiyonu değiştiyse (kategori/ürün/fiyat/stok/masa sayısı güncellemesi) anında eşitle
  try {
    const apiBase = getApiBaseUrl();
    const vRes = await fetch(apiBase + '/api/menu/version?_t=' + Date.now(), { cache: 'no-store' });
    if (vRes.ok) {
      const vData = await vRes.json();
      if (vData && vData.version) {
        if (lastStaffMenuVersion === null) {
          lastStaffMenuVersion = vData.version;
        } else if (vData.version !== lastStaffMenuVersion) {
          lastStaffMenuVersion = vData.version;
          await loadMenuData();
          if (currentStockCategory !== 'all' && menuData && Array.isArray(menuData.categories)) {
            if (!menuData.categories.some(c => c.id === currentStockCategory)) {
              currentStockCategory = 'all';
            }
          }
          renderStockCategories();
          const isEditingPrice = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('staff-price-input');
          if (!isEditingPrice) {
            renderStockItems();
          }
          renderTablesGrid();
        }
      }
    }
  } catch (e) {}
}

function getElapsedText(timestamp) {
  if (!timestamp) return 'Şimdi';
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (sec < 60) return `${sec} sn önce`;
  const min = Math.floor(sec / 60);
  return `${min} dk önce`;
}

function renderCallsView() {
  const container = document.getElementById('active-calls-container');
  const emptyView = document.getElementById('no-calls-view');
  const completedSection = document.getElementById('completed-calls-section');
  const completedContainer = document.getElementById('completed-calls-container');
  const badgeCount = document.getElementById('badge-calls-count');

  if (!container) return;

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

  if (completedCalls.length > 0) {
    if (completedSection) completedSection.classList.remove('hidden');
    if (completedContainer) {
      completedContainer.innerHTML = completedCalls.slice(0, 5).map(c => `
        <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-400">
          <div class="flex items-center gap-2">
            <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>
            <span class="font-bold text-gray-300">${escapeHtml(c.table)}</span>
            <span>•</span>
            <span>${escapeHtml(c.typeName)}</span>
            ${c.handler ? `<span class="text-amber-400 font-medium">(${escapeHtml(c.handler)})</span>` : ''}
          </div>
          <span class="text-[11px] text-gray-500">${getElapsedText(c.createdTimestamp)}</span>
        </div>
      `).join('');
    }
  } else {
    if (completedSection) completedSection.classList.add('hidden');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
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
        
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-2xl bg-black border border-white/15 flex flex-col items-center justify-center font-black text-amber-400 shadow-inner">
            <span class="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">MASA</span>
            <span class="text-xl leading-none mt-0.5 text-white">${escapeHtml(call.table.replace(/\D/g, '') || call.table)}</span>
          </div>

          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-bold tracking-wide uppercase ${typeBg}">
                <i data-lucide="${call.icon || 'bell'}" class="w-3.5 h-3.5 ${isCoal ? 'flame-anim text-amber-400' : ''}"></i>
                ${escapeHtml(call.typeName || (isCoal ? 'Köz Değişimi' : 'Garson Çağrısı'))}
              </span>
              
              ${isInProgress ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">
                  🏃 ${escapeHtml(call.handler || 'Yolda')}
                </span>
              ` : `
                <span class="text-[11px] font-medium text-amber-400 animate-pulse">Yeni Çağrı</span>
              `}
            </div>

            <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
              <span class="flex items-center gap-1">
                <i data-lucide="clock" class="w-3 h-3 text-gray-500"></i> ${elapsed}
              </span>
              ${call.note ? `<span class="text-gray-300 bg-white/5 px-2 py-0.5 rounded-md">"${escapeHtml(call.note)}"</span>` : ''}
            </div>
          </div>
        </div>

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

async function updateCallStatus(callId, newStatus) {
  try {
    const handlerName = currentStaff ? currentStaff.name : 'Personel';
    const handlerId = currentStaff ? currentStaff.id : '';
    const apiBase = getApiBaseUrl();

    const res = await fetch(apiBase + '/api/calls/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        status: newStatus,
        handler: handlerName,
        handlerId: handlerId,
        device: currentDevice
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
    const apiBase = getApiBaseUrl();
    await fetch(apiBase + '/api/calls/clear', { method: 'POST' });
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
// 6. KISITLI YETKİLİ ÜRÜN STOK YÖNETİMİ
// =========================================================================

function applyStaffBrandLogo() {
  const logoEl = document.getElementById('staff-login-logo-img');
  if (!logoEl || !menuData || !menuData.settings) return;
  const bm = menuData.settings.brandMedia || {};
  const customLogo = bm.logoImage && String(bm.logoImage).trim()
    ? resolveStaffImageUrl(bm.logoImage)
    : '';
  logoEl.src = customLogo || 'hashtag-logo.jpg?v=2.7';
  logoEl.className = bm.logoFit === 'contain'
    ? 'w-full h-full object-contain p-0.5'
    : 'w-full h-full object-cover';
}

async function loadMenuData() {
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/menu?_t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      menuData = await res.json();
      if (menuData && (menuData._version || menuData.updatedAt)) {
        lastStaffMenuVersion = menuData._version || menuData.updatedAt;
      }
      applyStaffBrandLogo();
      return;
    }
  } catch (e) {}

  if (window.DEFAULT_MENU_DATA) {
    menuData = JSON.parse(JSON.stringify(window.DEFAULT_MENU_DATA));
    applyStaffBrandLogo();
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

function showStaffToast(message, type = 'success') {
  let toast = document.getElementById('hashtag-staff-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'hashtag-staff-toast';
    document.body.appendChild(toast);
  }
  toast.className = type === 'success'
    ? 'fixed top-5 right-5 z-[9999] px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs transition-all duration-300 bg-emerald-500 text-black flex items-center gap-2 shadow-emerald-500/30'
    : 'fixed top-5 right-5 z-[9999] px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs transition-all duration-300 bg-red-500 text-white flex items-center gap-2 shadow-red-500/30';
  toast.textContent = message;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.transform = 'translateY(-20px)';
    toast.style.opacity = '0';
  }, 3000);
}

function renderStockItems() {
  const container = document.getElementById('stock-items-container');
  if (!container || !menuData) return;

  const canToggleStock = menuData.settings?.staffPermissions?.allowStockToggle !== false;
  const canEditPrice = menuData.settings?.staffPermissions?.allowPriceEdit === true;
  const currency = escapeHtml(menuData.settings?.currency || '₺');

  // Üst bilgi kutusunu aktif yetkilere göre canlı güncelle
  const bannerTitleEl = document.getElementById('staff-stock-mode-title');
  const bannerDescEl = document.getElementById('staff-stock-mode-desc');
  if (bannerTitleEl && bannerDescEl) {
    if (canToggleStock && canEditPrice) {
      bannerTitleEl.textContent = 'Personel Stok & Fiyat Modu (Yetkiler Açık)';
      bannerDescEl.innerHTML = 'Yönetici izniyle ürünlerin hem <b class="text-emerald-400">stok durumunu</b> değiştirebilir hem de <b class="text-amber-300">fiyatlarını</b> anlık güncelleyebilirsiniz.';
    } else if (canToggleStock && !canEditPrice) {
      bannerTitleEl.textContent = 'Personel Stok Modu (Fiyat Kilitli)';
      bannerDescEl.innerHTML = 'Biten ürünleri tek tıkla <b class="text-red-400">"Tükendi"</b> yapabilirsiniz. Fiyat değiştirme yetkisi yönetici tarafından kapalıdır.';
    } else if (!canToggleStock && canEditPrice) {
      bannerTitleEl.textContent = 'Personel Fiyat Modu (Stok Kilitli)';
      bannerDescEl.innerHTML = 'Ürün <b class="text-amber-300">fiyatlarını</b> güncelleyebilirsiniz. Stok durumu değiştirme yetkisi yönetici tarafından kapalıdır.';
    } else {
      bannerTitleEl.textContent = 'Salt Görüntüleme Modu (Yetkiler Kapalı)';
      bannerDescEl.innerHTML = 'Stok ve fiyat değiştirme yetkileri yönetici tarafından kapatılmıştır. Ürünler yalnızca görüntülenebilir.';
    }
  }

  let items = menuData.items || [];

  if (currentStockCategory !== 'all') {
    items = items.filter(it => it.categoryId === currentStockCategory);
  }

  if (stockSearchQuery) {
    items = items.filter(it => 
      (it.name || '').toLowerCase().includes(stockSearchQuery) || 
      (it.description && it.description.toLowerCase().includes(stockSearchQuery))
    );
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-gray-500">Ürün bulunamadı.</div>`;
    return;
  }

  const permissionNotice = (!canToggleStock && !canEditPrice)
    ? `<div class="col-span-full p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2.5 mb-2">
         <i data-lucide="shield-alert" class="w-4 h-4 text-red-400 flex-shrink-0"></i>
         <div>
           <b class="text-white">Yetki Kısıtlaması:</b> Stok ve fiyat değiştirme yetkisi yönetici tarafından kapatılmıştır. Ürünler yalnızca görüntülenebilir.
         </div>
       </div>`
    : '';

  container.innerHTML = permissionNotice + items.map(item => {
    const isAvailable = (item.isAvailable !== false) && (item.inStock !== false);
    const safeId = String(item.id || '').replace(/'/g, "\\'");

    return `
      <div class="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-neutral-900/80 border border-white/10 transition-colors ${!isAvailable ? 'opacity-70 bg-red-950/10 border-red-500/20' : ''}">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3 pr-2 flex-1 min-w-0">
            <div class="w-11 h-11 rounded-xl bg-black border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
              ${item.image 
                ? `<img src="${resolveStaffImageUrl(item.image)}" alt="" class="w-full h-full ${item.imageFit === 'contain' ? 'object-contain' : (item.imageFit === 'top' ? 'object-cover object-top' : 'object-cover')}" onerror="this.src='hashtag-logo.jpg'" />`
                : `<i data-lucide="package" class="w-5 h-5 text-gray-500"></i>`}
            </div>

            <div class="min-w-0 flex-1">
              <h4 class="text-sm font-bold text-white truncate">${escapeHtml(item.name)}</h4>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs font-mono font-semibold text-amber-400">${item.price} ${currency}</span>
                ${!canEditPrice ? `<i data-lucide="lock" class="w-3 h-3 text-gray-600" title="Fiyat düzenleme yetkisi kapalı"></i>` : ''}
                <span class="text-[10px] text-gray-500">•</span>
                <span class="text-[11px] ${isAvailable ? 'text-emerald-400 font-medium' : 'text-red-400 font-bold'}">
                  ${isAvailable ? 'Mevcut' : 'Tükendi'}
                </span>
              </div>
            </div>
          </div>

          ${canToggleStock ? `
            <button 
              onclick="toggleItemStock('${safeId}', ${!isAvailable})" 
              class="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 flex-shrink-0 ${isAvailable ? 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20'}"
            >
              <i data-lucide="${isAvailable ? 'slash' : 'check'}" class="w-3.5 h-3.5"></i>
              <span>${isAvailable ? 'Tükendi Yap' : 'Stokta Var'}</span>
            </button>
          ` : `
            <button 
              disabled 
              class="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 opacity-50 cursor-not-allowed bg-neutral-800 text-gray-400 border border-white/10 flex-shrink-0"
              title="Yönetici stok durumu değiştirme yetkisini kapattı"
            >
              <i data-lucide="lock" class="w-3.5 h-3.5"></i>
              <span>Stok Kilitli</span>
            </button>
          `}
        </div>

        ${canEditPrice ? `
          <div class="pt-2.5 border-t border-white/5 flex items-center justify-between gap-2">
            <span class="text-[11px] text-gray-400 font-medium flex items-center gap-1">
              <i data-lucide="dollar-sign" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>Fiyat Düzenle:</span>
            </span>
            <div class="flex items-center gap-1.5">
              <input
                type="number"
                step="any"
                min="0"
                id="staff-price-${escapeHtml(item.id)}"
                value="${item.price}"
                onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveStaffItemPrice('${safeId}'); }"
                class="staff-price-input w-24 px-2.5 py-1.5 rounded-xl bg-black border border-amber-500/30 focus:border-amber-400 text-right font-mono font-bold text-xs text-amber-400 focus:outline-none"
              />
              <span class="text-xs font-bold text-gray-400">${currency}</span>
              <button
                type="button"
                id="staff-price-btn-${escapeHtml(item.id)}"
                onclick="saveStaffItemPrice('${safeId}')"
                class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-sm shadow-amber-500/20"
              >
                <i data-lucide="save" class="w-3.5 h-3.5"></i>
                <span>Kaydet</span>
              </button>
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function saveStaffItemPrice(itemId) {
  const canEditPrice = menuData?.settings?.staffPermissions?.allowPriceEdit === true;
  if (!canEditPrice) {
    alert("⚠️ Ürün fiyatı değiştirme yetkisi yönetici tarafından kapatılmıştır.");
    return;
  }

  const inputEl = document.getElementById(`staff-price-${itemId}`);
  const btnEl = document.getElementById(`staff-price-btn-${itemId}`);
  if (!inputEl) return;

  const parsed = parseFloat(inputEl.value);
  if (isNaN(parsed) || parsed < 0 || parsed > 1000000) {
    showStaffToast('⚠️ Lütfen geçerli bir fiyat girin.', 'error');
    return;
  }

  const cleanPrice = Number.isInteger(parsed) ? parsed : Math.round(parsed * 100) / 100;
  const origBtnHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = '...';
  }

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/staff/update-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        price: cleanPrice,
        staffId: currentStaff ? currentStaff.id : '',
        staffName: currentStaff ? currentStaff.name : 'Personel',
        device: currentDevice
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showStaffToast('⚠️ ' + (errData.message || 'Fiyat güncellenemedi veya yetkiniz yok.'), 'error');
      await loadMenuData();
      renderStockItems();
      return;
    }

    await loadMenuData();
    try { localStorage.setItem('hashtag_menu_cache', JSON.stringify(menuData)); } catch (e) {}
    if (staffSyncChannel) {
      try { staffSyncChannel.postMessage('sync'); } catch (e) {}
    }

    const updatedItem = (menuData?.items || []).find(i => i.id === itemId);
    const cur = menuData?.settings?.currency || '₺';
    showStaffToast(`✅ "${updatedItem ? updatedItem.name : 'Ürün'}" fiyatı ${cleanPrice} ${cur} olarak güncellendi!`);
    renderStockItems();
  } catch (e) {
    console.error("Update price error:", e);
    showStaffToast('⚠️ Sunucu bağlantı hatası, fiyat kaydedilemedi.', 'error');
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = origBtnHtml;
    }
  }
}

async function toggleItemStock(itemId, newAvailable) {
  const canToggleStock = menuData?.settings?.staffPermissions?.allowStockToggle !== false;
  if (!canToggleStock) {
    alert("⚠️ Ürün stok durumu değiştirme yetkisi yönetici tarafından kapatılmıştır.");
    return;
  }

  if (menuData && menuData.items) {
    const item = menuData.items.find(i => i.id === itemId);
    if (item) {
      item.isAvailable = newAvailable;
      item.inStock = newAvailable;
    }
    renderStockItems();
  }

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(apiBase + '/api/staff/toggle-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        isAvailable: newAvailable,
        staffId: currentStaff ? currentStaff.id : '',
        staffName: currentStaff ? currentStaff.name : 'Personel',
        device: currentDevice
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.message || "Stok durumu güncellenemedi veya yetkiniz yok.");
      await loadMenuData();
      renderStockItems();
    } else {
      await loadMenuData();
      try { localStorage.setItem('hashtag_menu_cache', JSON.stringify(menuData)); } catch (e) {}
      if (staffSyncChannel) {
        try { staffSyncChannel.postMessage('sync'); } catch (e) {}
      }
    }
  } catch (e) {
    console.error("Toggle stock error:", e);
  }
}

// =========================================================================
// 7. MASA HARİTASI
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

    const tableName = `Masa ${i}`;
    const hTimer = activeHookahTimers && activeHookahTimers[tableName];
    let timerBadge = '';
    if (hTimer && hTimer.lastCoalTime) {
      const min = Math.max(0, Math.floor((Date.now() / 1000 - hTimer.lastCoalTime) / 60));
      if (min >= 45) {
        timerBadge = `<button onclick="resetTableHookahTimer('${tableName}')" class="mt-1.5 px-2 py-0.5 rounded-lg bg-red-500/25 text-red-300 border border-red-500/40 text-[9px] font-black animate-pulse hover:bg-red-500/40 transition-all flex items-center gap-1" title="Köz yenileme zamanı! Sıfırlamak için tıkla">🔥 ${min} dk (Tazele!)</button>`;
      } else if (min >= 30) {
        timerBadge = `<button onclick="resetTableHookahTimer('${tableName}')" class="mt-1.5 px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold hover:bg-amber-500/30 transition-all flex items-center gap-1" title="Köz yenilendiyse tıkla">🔥 ${min} dk</button>`;
      } else {
        timerBadge = `<button onclick="resetTableHookahTimer('${tableName}')" class="mt-1.5 px-1.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-medium hover:bg-emerald-500/20 transition-all" title="Köz taze. Sıfırlamak için tıkla">🔥 ${min} dk</button>`;
      }
    }

    html += `
      <div class="p-3 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${cardBg}">
        <span class="text-[10px] text-gray-400 font-semibold uppercase">Masa</span>
        <span class="text-xl font-black ${hasCall ? 'text-amber-300' : 'text-white'}">${i}</span>
        <div class="h-5 flex items-center justify-center mt-1">
          ${icon || '<span class="w-1.5 h-1.5 rounded-full bg-white/20"></span>'}
        </div>
        ${timerBadge}
      </div>
    `;
  }

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// =========================================================================
// 8. SEKME GEÇİŞLERİ & BAŞLATMA
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
    loadMenuData().then(() => {
      renderStockCategories();
      renderStockItems();
    });
  } else if (tabId === 'tables') {
    renderTablesGrid();
  }
}

async function initStaffDashboard() {
  await loadMenuData();
  await updateCallsLoop();

  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(updateCallsLoop, 2500);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn("SW register error:", err);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const badgeEl = document.getElementById('detected-device-badge');
  if (badgeEl) badgeEl.textContent = currentDevice;

  await loadMenuData();
  await fetchStaffList();

  if (currentStaff) {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('staff-app').classList.remove('hidden');
    updateHeaderStaffInfo();
    initStaffDashboard();
    autoRegisterWebPush();
  } else {
    document.getElementById('login-modal').classList.remove('hidden');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
});
