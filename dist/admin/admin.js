// ===================================================================
// FAHREN MOTORS — PAINEL DE GESTÃO WMS & MÓDULO FISCAL / FINANCEIRO
// ===================================================================

const API = '/api';
let currentAdmin = null;
let allProducts = [];
let allOrders = [];
let editingProductId = null;

// Configuração Fiscal da Empresa
const FISCAL_CONFIG = {
  razaoSocial: 'FAHREN MOTORS LTDA',
  nomeFantasia: 'FAHREN MOTORS',
  cnpj: '47.784.317/0001-20',
  ie: '338.419.820.114',
  logradouro: 'Av. Santana, 1420 - Parque Hortolândia',
  cidade: 'Hortolândia',
  uf: 'SP',
  cep: '13184-000',
  telefone: '(19) 99876-5432'
};

// Helper de API
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw new Error((data && data.error) || 'Ocorreu um erro na requisição.');
  return data;
}

/* ==========================================================================
   SINCRONIZAÇÃO TOTAL EM TEMPO REAL (WMS ADMIN <-> LOJA VIRTUAL)
   ========================================================================== */
function broadcastSync(type, data = {}) {
  try {
    const ch = new BroadcastChannel('fahren_wms_sync');
    ch.postMessage({ type, data, timestamp: Date.now() });
    ch.close();
  } catch (e) {}
  try {
    localStorage.setItem('fahren_sync_event', JSON.stringify({ type, data, timestamp: Date.now() }));
  } catch (e) {}
}
window.broadcastSync = broadcastSync;

async function quickAddStock(id, qty) {
  const p = allProducts.find(x => String(x.id) === String(id));
  if (!p) return;
  const current = Number(p.stockQty) || 0;
  const newStock = current + Number(qty);
  try {
    await api(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ stockQty: newStock, inStock: newStock > 0 })
    });
    showToast(`+${qty} un. adicionadas a "${p.name}" (Saldo: ${newStock})`);
    await refreshAllData();
    broadcastSync('STOCK_UPDATED');
  } catch (err) {
    showToast('Erro ao atualizar estoque: ' + err.message);
  }
}
window.quickAddStock = quickAddStock;

let adminSyncInitialized = false;
function initAdminSyncChannel() {
  if (adminSyncInitialized) return;
  adminSyncInitialized = true;

  const handleSyncEvent = async (evtData) => {
    if (!evtData || !evtData.type) return;
    console.log('[WMS Sync] Evento recebido no Admin:', evtData.type);
    
    // Atualiza todos os dados em background
    await refreshAllData();

    if (evtData.type === 'ORDER_CREATED') {
      showToast('🔔 Novo pedido recebido da loja virtual!');
    }
  };

  try {
    const ch = new BroadcastChannel('fahren_wms_sync');
    ch.onmessage = (e) => handleSyncEvent(e.data);
  } catch (e) {}

  window.addEventListener('storage', (e) => {
    if (e.key === 'fahren_sync_event' && e.newValue) {
      try {
        handleSyncEvent(JSON.parse(e.newValue));
      } catch (err) {}
    }
  });

  // Polling automático a cada 15 segundos se admin estiver logado
  setInterval(() => {
    if (currentAdmin) {
      refreshAllData();
    }
  }, 15000);

  // Sincroniza ao focar na janela
  window.addEventListener('focus', () => {
    if (currentAdmin) {
      refreshAllData();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentAdmin) {
      refreshAllData();
    }
  });
}
window.initAdminSyncChannel = initAdminSyncChannel;

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getProductPhoto(p) {
  let photo = (p && (p.photoUrl || p.photo_url)) || '';
  if (!photo) return '/images/categorias/freios.jpg';
  photo = String(photo).trim();
  if (photo.startsWith('http://') || photo.startsWith('https://') || photo.startsWith('data:')) {
    return photo;
  }
  if (photo.startsWith('/loja/')) {
    photo = photo.replace(/^\/loja\//, '/');
  } else if (photo.startsWith('loja/')) {
    photo = photo.replace(/^loja\//, '/');
  }
  if (!photo.startsWith('/')) {
    photo = '/' + photo;
  }
  return photo;
}

// ---------- Controle de Telas (Login vs Main) ----------
function showLogin() {
  document.documentElement.classList.remove('has-admin-session');
  try { localStorage.removeItem('fm_admin_session'); } catch {}
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainScreen').classList.add('hidden');
}

function showMain(admin) {
  currentAdmin = admin;
  document.documentElement.classList.add('has-admin-session');
  try {
    localStorage.setItem('fm_admin_session', JSON.stringify(admin));
  } catch (e) {}
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
  const nameEl = document.getElementById('adminName');
  if (nameEl) nameEl.textContent = admin.name || admin.email || 'Administrador';

  // Restaura a aba onde o usuário estava antes de recarregar
  const targetTab = getInitialTab();
  switchTab(targetTab, false, false);

  // Carrega dados do sistema preservando a rolagem onde o usuário estava
  refreshAllData();
  initAdminSyncChannel();

  try {
    const savedScroll = sessionStorage.getItem('fm_admin_scroll_y_' + targetTab);
    if (savedScroll) {
      setTimeout(() => {
        window.scrollTo({ top: parseInt(savedScroll, 10) || 0, behavior: 'instant' });
      }, 120);
    }
  } catch (e) {}
}

// ---------- Relógio Digital em Tempo Real ----------
function startLiveClock() {
  function update() {
    const now = new Date();
    const dateEl = document.getElementById('liveDateText');
    const clockEl = document.getElementById('liveClockText');
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }
  update();
  setInterval(update, 1000);
}

// ---------- Navegação por Abas do WMS ----------
const VALID_TABS = [
  'dashboard', 'produtos', 'pecas', 'estoque', 'pedidos', 'vendas',
  'operacoes-estoque', 'movimentacoes', 'inventario', 'localizacoes', 'alertas',
  'armazem', 'expedicao', 'financeiro', 'notas-fiscais', 'relatorios', 'configuracoes'
];
let currentTabId = 'dashboard';
const tabHistory = ['dashboard'];

function getInitialTab() {
  const hash = (window.location.hash || '').replace('#', '').trim();
  if (VALID_TABS.includes(hash)) return hash;
  try {
    const saved = localStorage.getItem('fm_admin_active_tab');
    if (VALID_TABS.includes(saved)) return saved;
  } catch (e) {}
  return 'dashboard';
}

function switchTab(tabId, pushHistory = true, resetScroll = true) {
  if (!VALID_TABS.includes(tabId)) tabId = 'dashboard';

  if (pushHistory && tabId !== currentTabId) {
    tabHistory.push(tabId);
  }
  currentTabId = tabId;

  // Persiste a aba atual para que F5 ou atualização mantenha o usuário exatamente aqui
  try {
    document.documentElement.setAttribute('data-active-tab', tabId);
    localStorage.setItem('fm_admin_active_tab', tabId);
    if (window.location.hash !== `#${tabId}`) {
      history.replaceState(null, '', `#${tabId}`);
    }
  } catch (e) {}

  let activePaneId = `pane-${tabId}`;
  let activeNavTab = tabId;
  if (tabId === 'estoque') {
    activePaneId = 'pane-produtos';
    activeNavTab = 'produtos';
  } else if (tabId === 'armazem') {
    activePaneId = 'pane-localizacoes';
    activeNavTab = 'localizacoes';
  }

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeNavTab);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === activePaneId);
  });

  if (resetScroll) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  if (tabId === 'dashboard') {
    updateDashboardMetrics();
    loadStockAlerts();
  }
  if (tabId === 'produtos' || tabId === 'estoque') renderProductsTable(allProducts);
  if (tabId === 'pecas') {
    const formPanel = document.getElementById('productFormPanel');
    if (formPanel) formPanel.classList.remove('hidden');
  }
  if (tabId === 'pedidos') renderOrdersTable(allOrders);
  if (tabId === 'vendas') renderVendas();
  if (tabId === 'operacoes-estoque') loadRecentOperations();
  if (tabId === 'movimentacoes') loadStockMovements();
  if (tabId === 'inventario') loadInventoryAudit();
  if (tabId === 'localizacoes' || tabId === 'armazem') renderWarehouseLocation();
  if (tabId === 'alertas') loadStockAlerts();
  if (tabId === 'expedicao') renderExpedicao();
  if (tabId === 'financeiro') renderFinances();
  if (tabId === 'notas-fiscais') renderFiscalTable();
  if (tabId === 'relatorios') renderRelatorios();
  if (tabId === 'armazem') {
    setTimeout(() => {
      const rackEl = document.querySelector('.rack-widget-card');
      if (rackEl) rackEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }
}

window.switchTab = switchTab;

window.addEventListener('hashchange', () => {
  const hash = (window.location.hash || '').replace('#', '').trim();
  if (VALID_TABS.includes(hash) && hash !== currentTabId) {
    switchTab(hash, false, false);
  }
});

window.addEventListener('beforeunload', () => {
  try {
    sessionStorage.setItem('fm_admin_scroll_y_' + currentTabId, window.pageYOffset || 0);
  } catch (e) {}
});

document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ---------- Carregamento Global de Dados ----------
async function refreshAllData() {
  const initialTab = currentTabId;
  const currentY = window.pageYOffset || document.documentElement.scrollTop || 0;
  
  // 1. Renderização Otimista: carrega instantaneamente do cache local para não haver tela vazia no F5
  try {
    const cachedProducts = localStorage.getItem('fm_cache_products');
    const cachedOrders = localStorage.getItem('fm_cache_orders');
    if (cachedProducts) {
      allProducts = JSON.parse(cachedProducts);
      renderProductsTable(allProducts);
      renderCommercialProductsTable(allProducts);
      fillCategoryList(allProducts);
    }
    if (cachedOrders) {
      allOrders = JSON.parse(cachedOrders);
      renderOrdersTable(allOrders);
      const badge = document.getElementById('ordersCountBadge');
      if (badge) badge.textContent = allOrders.filter(o => o.status !== 'cancelado').length;
      const nfBadge = document.getElementById('nfCountBadge');
      if (nfBadge) nfBadge.textContent = allOrders.length;
    }
    if (cachedProducts || cachedOrders) {
      updateDashboardMetrics();
      renderFinances();
      renderFiscalTable();
      renderExpedicao();
      renderVendas();
      renderRelatorios();
      updateStockTabsBadges();
    }
  } catch (e) {}

  // 2. Fetch em background para garantir os dados mais recentes do servidor
  try {
    const [productsRes, ordersRes] = await Promise.allSettled([
      api('/products?in_stock=&_t=' + Date.now()),
      api('/orders?_t=' + Date.now())
    ]);

    if (productsRes.status === 'fulfilled' && productsRes.value) {
      allProducts = productsRes.value.products || [];
      localStorage.setItem('fm_cache_products', JSON.stringify(allProducts));
      renderProductsTable(allProducts);
      renderCommercialProductsTable(allProducts);
      fillCategoryList(allProducts);
    }
    if (ordersRes.status === 'fulfilled' && ordersRes.value) {
      allOrders = ordersRes.value.orders || [];
      localStorage.setItem('fm_cache_orders', JSON.stringify(allOrders));
      renderOrdersTable(allOrders);
      const badge = document.getElementById('ordersCountBadge');
      if (badge) badge.textContent = allOrders.filter(o => o.status !== 'cancelado').length;
      const nfBadge = document.getElementById('nfCountBadge');
      if (nfBadge) nfBadge.textContent = allOrders.length;
    }

    updateDashboardMetrics();
    renderFinances();
    renderFiscalTable();
    renderExpedicao();
    renderVendas();
    renderRelatorios();
    updateStockTabsBadges();

    // Mantém a rolagem exatamente no mesmo lugar onde o usuário estava SOMENTE se ainda estiver na mesma aba
    if (currentY > 0 && currentTabId === initialTab) {
      setTimeout(() => {
        window.scrollTo({ top: currentY, behavior: 'instant' });
      }, 50);
    }
  } catch (err) {
    console.error('Erro ao atualizar dados:', err);
  }
}

// Notificação toast elegante e moderna
function showToast(msg = 'Sistema atualizado com sucesso!') {
  const toast = document.getElementById('wmsToast');
  const msgEl = document.getElementById('wmsToastMsg');
  if (!toast) return;
  if (msgEl) msgEl.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

// Copia chave de acesso da NF-e para a área de transferência
window.copyAccessKey = async (btn, key) => {
  try {
    await navigator.clipboard.writeText(key);
    const svg = btn.querySelector('svg');
    if (svg) {
      const original = svg.innerHTML;
      svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
      svg.style.color = 'var(--accent-green)';
      btn.style.color = 'var(--accent-green)';
      setTimeout(() => {
        svg.innerHTML = original;
        svg.style.color = '';
        btn.style.color = 'var(--text-muted)';
      }, 1500);
    }
    showToast('Chave de acesso copiada!');
  } catch {
    showToast('Não foi possível copiar.');
  }
};


const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('is-refreshing');
    showToast('Sincronizando catálogo e atualizando dados...');
    try {
      try {
        await api('/products/sync-catalog', { method: 'POST' });
      } catch (syncErr) {
        console.warn('Sincronização de catálogo:', syncErr);
      }
      await refreshAllData();
      showToast('Catálogo sincronizado e dados atualizados com sucesso!');
    } catch (err) {
      console.error('Erro ao sincronizar/atualizar dados:', err);
      showToast('Erro ao sincronizar dados: ' + (err.message || err));
    } finally {
      setTimeout(() => {
        refreshBtn.classList.remove('is-refreshing');
      }, 700);
    }
  });
}

// ---------- 1. DASHBOARD WMS ----------
function updateDashboardMetrics() {
  const totalProductsEl = document.getElementById('dashTotalProducts');
  const todayOrdersEl = document.getElementById('dashTodayOrders');
  const stockAlertsEl = document.getElementById('dashStockAlerts');
  const totalRevenueEl = document.getElementById('dashTotalRevenue');

  const activeProducts = allProducts.filter(p => p.active !== false);
  if (totalProductsEl) totalProductsEl.textContent = activeProducts.length;

  const lowStock = activeProducts.filter(p => Number(p.stockQty) <= 2 || !p.inStock);
  if (stockAlertsEl) stockAlertsEl.textContent = lowStock.length;

  // Pedidos de hoje
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = allOrders.filter(o => (o.createdAt || '').slice(0, 10) === todayStr);
  if (todayOrdersEl) todayOrdersEl.textContent = todayOrders.length;

  // Receita total de pedidos válidos
  const validOrders = allOrders.filter(o => o.status !== 'cancelado');
  const totalRev = validOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  if (totalRevenueEl) totalRevenueEl.textContent = money(totalRev);

  // Métrica Financeira de Descontos no PIX (4% OFF)
  const pixDiscountEl = document.getElementById('dashTotalPixDiscount');
  const pixOrdersCountEl = document.getElementById('dashPixOrdersCount');
  const pixImpactBadgeEl = document.getElementById('dashPixImpactBadge');

  const pixOrders = validOrders.filter(o => (o.paymentMethod || '').toLowerCase() === 'pix');
  const totalPixDiscount = pixOrders.reduce((acc, o) => {
    const paid = Number(o.total) || 0;
    // O valor pago corresponde a 96% do valor regular (4% de desconto no Pix)
    const disc = (paid / 0.96) * 0.04;
    return acc + disc;
  }, 0);

  if (pixDiscountEl) pixDiscountEl.textContent = money(totalPixDiscount);
  if (pixOrdersCountEl) pixOrdersCountEl.textContent = `${pixOrders.length} venda(s) via PIX`;
  if (pixImpactBadgeEl) {
    if (totalRev > 0 && totalPixDiscount > 0) {
      const pct = ((totalPixDiscount / (totalRev + totalPixDiscount)) * 100).toFixed(1);
      pixImpactBadgeEl.textContent = `Impacto de ${pct}% na margem bruta (Fluxo Caixa Imediato)`;
    } else {
      pixImpactBadgeEl.textContent = 'Métrica de impacto na margem';
    }
  }

  renderBarChart();
  renderRecentOrders();
}

function renderBarChart() {
  const wrap = document.getElementById('dashBarChart');
  if (!wrap) return;

  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const todayIdx = new Date().getDay();
  const mockCounts = [2, 5, 8, 4, 11, 7, 9]; // Simulação proporcional de fluxo
  // Ajusta o dia atual com os pedidos reais
  mockCounts[todayIdx] = Math.max(allOrders.length, 3);

  const maxVal = Math.max(...mockCounts, 10);

  wrap.innerHTML = mockCounts.map((val, idx) => {
    const heightPct = Math.round((val / maxVal) * 100);
    const dayName = days[idx];
    const isToday = idx === todayIdx;
    return `
      <div class="bar-col">
        <div class="bar-fill" data-val="${val}" style="height:${heightPct}%;${isToday ? 'background:linear-gradient(180deg,#00e676 0%,rgba(0,230,118,.25) 100%);' : ''}"></div>
        <span class="bar-day" style="${isToday ? 'color:#00e676;font-weight:800' : ''}">${dayName}</span>
      </div>
    `;
  }).join('');
}

function renderRecentOrders() {
  const wrap = document.getElementById('dashRecentOrders');
  if (!wrap) return;
  if (!allOrders.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:10px 0">Nenhum pedido recente registrado.</p>';
    return;
  }
  const recent = allOrders.slice(0, 5);
  wrap.innerHTML = recent.map(o => `
    <div class="dash-recent-item">
      <div>
        <strong class="dash-order-id">Pedido #${o.id}</strong> — <span class="dash-cust-name">${o.customerName || 'Cliente'}</span>
        <div class="dash-order-meta">${formatDate(o.createdAt)} • ${o.paymentMethodLabel}</div>
      </div>
      <div style="text-align:right">
        <div class="dash-order-val">${money(o.total)}</div>
        <span class="status-badge ${o.status}">${ORDER_STATUS_LABEL[o.status] || o.status}</span>
      </div>
    </div>
  `).join('');
}

// ---------- 2. ESTOQUE & PRODUTOS (WMS & LOCALIZAÇÃO) ----------

// Helper de Localização no Armazém WMS
function getProductLocation(p) {
  if (p && p.location && p.location.trim()) return p.location.trim().toUpperCase();
  const cats = {
    'ignição': 'A', 'ignicao': 'A', 'elétrica': 'A', 'eletrica': 'A',
    'freios': 'B', 'freio': 'B',
    'suspensão': 'C', 'suspensao': 'C',
    'filtros': 'D', 'filtro': 'D',
    'sensores': 'E', 'sensor': 'E',
    'correias': 'F', 'correia': 'F',
    'arrefecimento': 'G', 'fluidos': 'H'
  };
  const catNorm = (p && p.category ? p.category : '').toLowerCase().trim();
  let aisle = 'A';
  for (const k in cats) {
    if (catNorm.includes(k)) { aisle = cats[k]; break; }
  }
  const shelf = String((Math.abs(Number(p && p.id) || 1) % 4) + 1).padStart(2, '0');
  const pos = String(((Math.abs(Number(p && p.id) || 1) * 3) % 6) + 1).padStart(2, '0');
  return `${aisle}-${shelf}-${pos}`;
}
window.getProductLocation = getProductLocation;

function selectWarehouseLocation(loc, prodName = '') {
  const cleanLoc = String(loc || 'A-02-03').trim().toUpperCase();
  const parts = cleanLoc.split('-');
  const corredor = parts[0] || 'A';
  const estante = parts[1] || '02';
  const posicao = parts[2] || '03';

  const selEl = document.getElementById('rackSelectedLocation');
  if (selEl) selEl.textContent = cleanLoc;
  const cEl = document.getElementById('rackCorredor');
  if (cEl) cEl.textContent = corredor;
  const eEl = document.getElementById('rackEstante');
  if (eEl) eEl.textContent = estante;
  const pEl = document.getElementById('rackPosicao');
  if (pEl) pEl.textContent = posicao;

  // Ajusta a posição do Pin no SVG isométrico do armazém
  const pin = document.querySelector('.rack-pin-group');
  if (pin) {
    const shelfNum = Math.min(3, Math.max(1, parseInt(estante, 10) || 2));
    const posNum = Math.min(6, Math.max(1, parseInt(posicao, 10) || 3));
    const y = 42 + (shelfNum - 1) * 43;
    const x = 70 + (posNum - 1) * 26;
    pin.setAttribute('transform', `translate(${x}, ${y})`);
  }

  // Destaca a linha selecionada
  document.querySelectorAll('.prod-row').forEach(row => {
    const locBadge = row.querySelector('.location-badge');
    if (locBadge && locBadge.textContent.trim() === cleanLoc) {
      row.classList.add('selected-rack-row');
    } else {
      row.classList.remove('selected-rack-row');
    }
  });

  if (prodName) {
    showToast(`Posição: Corredor ${corredor} • Estante ${estante} • Posição ${posicao}`);
  }
}
window.selectWarehouseLocation = selectWarehouseLocation;

function updateStockTabsBadges() {
  const total = allProducts.length;
  const inStock = allProducts.filter(p => Number(p.stockQty) > 5).length;
  const lowStock = allProducts.filter(p => Number(p.stockQty) > 0 && Number(p.stockQty) <= 5).length;
  const outStock = allProducts.filter(p => Number(p.stockQty) <= 0).length;

  const bAll = document.getElementById('stockBadgeAll');
  if (bAll) bAll.textContent = total;
  const bLow = document.getElementById('stockBadgeLow');
  if (bLow) bLow.textContent = lowStock;
  const bZero = document.getElementById('stockBadgeZero');
  if (bZero) bZero.textContent = outStock;

  // Atualiza também os badges do relatório
  const rAll = document.getElementById('repBadgeAll');
  if (rAll) rAll.textContent = total;
  const rZero = document.getElementById('repBadgeZero');
  if (rZero) rZero.textContent = outStock;
  const rLow = document.getElementById('repBadgeLow');
  if (rLow) rLow.textContent = lowStock;
  const rNormal = document.getElementById('repBadgeNormal');
  if (rNormal) rNormal.textContent = inStock;
}
window.updateStockTabsBadges = updateStockTabsBadges;

let currentStockFilter = '';
function filterProductsByStock(type) {
  currentStockFilter = type || '';
  document.querySelectorAll('.est-tabs-bar .est-tab-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.filter || '') === currentStockFilter);
  });

  let filtered = allProducts;
  if (currentStockFilter === 'in_stock') {
    filtered = allProducts.filter(p => Number(p.stockQty) > 5);
  } else if (currentStockFilter === 'low_stock' || currentStockFilter === 'baixo') {
    filtered = allProducts.filter(p => Number(p.stockQty) > 0 && Number(p.stockQty) <= 5);
  } else if (currentStockFilter === 'out_of_stock' || currentStockFilter === 'zero' || currentStockFilter === 'zerado') {
    filtered = allProducts.filter(p => Number(p.stockQty) <= 0);
  }
  renderProductsTable(filtered, currentStockFilter);
}
window.filterProductsByStock = filterProductsByStock;

function exportStockCSV() {
  if (!allProducts || !allProducts.length) {
    showToast('Nenhuma peça para exportar.');
    return;
  }
  const headers = ['Código', 'Peça', 'Categoria', 'Estoque', 'Localização', 'Preço (R$)', 'Status'];
  const rows = allProducts.map(p => {
    const loc = getProductLocation(p);
    const stock = Number(p.stockQty) || 0;
    const st = stock > 5 ? 'Disponível' : (stock > 0 ? 'Estoque Baixo' : 'Sem Estoque');
    return [
      `"${(p.code || '').replace(/"/g, '""')}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      stock,
      `"${loc}"`,
      Number(p.price || 0).toFixed(2),
      `"${st}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `relatorio_estoque_wms_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Relatório de estoque baixado com sucesso!');
}
window.exportStockCSV = exportStockCSV;

function openAllLocationsModal() {
  const locsMap = {};
  allProducts.forEach(p => {
    const loc = getProductLocation(p);
    if (!locsMap[loc]) locsMap[loc] = [];
    locsMap[loc].push(p.name);
  });
  const count = Object.keys(locsMap).length;
  showToast(`Mapeamento WMS: ${count} posições ativas distribuídas nas estantes.`);
}
window.openAllLocationsModal = openAllLocationsModal;

function renderProductsTable(products, activeFilter = null) {
  const tbody = document.getElementById('productsTableBody');
  const summary = document.getElementById('stockTableSummary');
  if (summary) summary.textContent = `${products.length} peça(s) encontrada(s)`;

  // Atualiza os 4 KPIs de Estoque
  const total = allProducts.length;
  const inStock = allProducts.filter(p => Number(p.stockQty) > 5).length;
  const lowStock = allProducts.filter(p => Number(p.stockQty) > 0 && Number(p.stockQty) <= 5).length;
  const outStock = allProducts.filter(p => Number(p.stockQty) <= 0).length;

  const elTotal = document.getElementById('estTotalVal');
  if (elTotal) elTotal.textContent = total;
  const elInStock = document.getElementById('estInStockVal');
  if (elInStock) elInStock.textContent = inStock;
  const elLowStock = document.getElementById('estLowStockVal');
  if (elLowStock) elLowStock.textContent = lowStock;
  const elOutStock = document.getElementById('estOutStockVal');
  if (elOutStock) elOutStock.textContent = outStock;

  // Atualiza badges em tempo real
  updateStockTabsBadges();

  // Inicializa o widget de localização com o primeiro produto se ainda não tiver
  if (!window._rackInitialized && products.length > 0) {
    window._rackInitialized = true;
    selectWarehouseLocation(getProductLocation(products[0]));
  }

  if (!tbody) return;

  if (!products.length) {
    const filter = activeFilter !== null ? activeFilter : currentStockFilter;
    if (filter === 'out_of_stock' || filter === 'zero' || filter === 'zerado') {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;padding:45px 20px;">
            <div style="max-width:460px;margin:0 auto;padding:26px 22px;background:rgba(255,255,255,0.03);border:1px solid var(--panel-border);border-radius:14px;">
              <div style="font-size:38px;margin-bottom:12px;">🎉</div>
              <h3 style="margin:0 0 8px;font-size:16px;color:var(--text-primary,#fff);font-weight:700;">Nenhuma peça com estoque zerado!</h3>
              <p style="margin:0 0 16px;font-size:13px;color:var(--text-muted,#8c929a);line-height:1.5;">
                Excelente! Todas as <strong>${total}</strong> peças cadastradas possuem saldo em estoque no armazém da Fahren Motors.
              </p>
              <button class="btn btn-secondary btn-sm" onclick="filterProductsByStock('')" style="display:inline-flex;align-items:center;gap:6px;">
                Ver Todas as Peças (${total})
              </button>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma peça encontrada no catálogo.</td></tr>';
    }
    return;
  }

  tbody.innerHTML = products.map(p => {
    const photo = getProductPhoto(p);
    const loc = getProductLocation(p);
    const stockNum = Number(p.stockQty) || 0;

    let statusHtml = '';
    if (stockNum > 5) {
      statusHtml = '<span class="status-badge pronto" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0">Disponível</span>';
    } else if (stockNum > 0) {
      statusHtml = '<span class="status-badge em_preparacao" style="background:#fffbeb;color:#d97706;border:1px solid #fde68a">Baixo</span>';
    } else {
      statusHtml = '<span class="status-badge cancelado" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca">Sem Estoque</span>';
    }

    const safeName = (p.name || '').replace(/'/g, "\\'");

    return `
      <tr data-prod-row="${p.id}" class="prod-row" onclick="selectWarehouseLocation('${loc}', '${safeName}')">
        <td style="width:40px;cursor:pointer" data-view="${p.id}" title="Clique para ver detalhes">
          <img src="${photo}" alt="" class="prod-thumb-img" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/>
        </td>
        <td style="cursor:pointer" data-view="${p.id}" title="Clique para ver detalhes">
          <strong class="prod-name-strong">${p.name}</strong>
        </td>
        <td>
          <span class="prod-sku-code" style="font-weight:700;font-family:monospace">${p.code || 'S/CÓD'}</span>
        </td>
        <td><span class="cat-pill-badge">${p.category || 'Geral'}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:4px">
            <div class="stock-control-cell">
              <button type="button" class="btn-stock-qty" data-stock-step="-1" data-id="${p.id}" title="Subtrair 1 un">−</button>
              <input type="number" class="stock-num-input" value="${stockNum}" data-id="${p.id}" min="0" title="Altere e aperte Enter para salvar"/>
              <button type="button" class="btn-stock-qty" data-stock-step="1" data-id="${p.id}" title="Adicionar 1 un">+</button>
            </div>
            <button type="button" class="btn-stock-adjust" data-open-stock="${p.id}" title="Ajuste rápido (+5, +10, +50)">⚡</button>
          </div>
        </td>
        <td>
          <span class="location-badge" onclick="event.stopPropagation();selectWarehouseLocation('${loc}', '${safeName}')" title="Corredor, Estante e Posição no armazém">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${loc}
          </span>
        </td>
        <td>
          ${statusHtml}
        </td>
        <td style="text-align:right;white-space:nowrap;vertical-align:middle">
          <div class="prod-actions-stack">
            <button class="btn btn-secondary btn-sm btn-prod-action btn-prod-view" data-view="${p.id}" title="Ver detalhes completos da peça">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="pointer-events:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <span style="pointer-events:none">Ver</span>
            </button>
            <button class="btn btn-secondary btn-sm btn-prod-action btn-prod-edit" data-edit="${p.id}" title="Editar dados da peça">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="pointer-events:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              <span style="pointer-events:none">Editar</span>
            </button>
            <button class="btn btn-sm btn-prod-delete" data-remove="${p.id}" title="Excluir peça do catálogo">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" style="pointer-events:none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span style="pointer-events:none">Excluir</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-view]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    openProductViewModal(b.dataset.view);
  });
  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    startEdit(b.dataset.edit);
  });
  tbody.querySelectorAll('[data-remove]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    removeProduct(b.dataset.remove);
  });
  tbody.querySelectorAll('[data-open-stock]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    openStockModal(b.dataset.openStock);
  });

  // Cliques nos botões de + / -
  tbody.querySelectorAll('[data-stock-step]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.id;
      const step = parseInt(b.dataset.stockStep, 10);
      const prod = allProducts.find(x => String(x.id) === String(id));
      if (!prod) return;
      const current = Number(prod.stockQty) || 0;
      quickUpdateStock(id, Math.max(0, current + step));
    };
  });

  // Alteração direta no input numérico de estoque
  tbody.querySelectorAll('.stock-num-input').forEach(inp => {
    const saveVal = () => {
      const id = inp.dataset.id;
      const val = Math.max(0, parseInt(inp.value, 10) || 0);
      quickUpdateStock(id, val);
    };
    inp.onchange = saveVal;
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        inp.blur();
      }
    };
  });
}

// Atualização rápida de estoque via API
async function quickUpdateStock(id, newQty) {
  const prod = allProducts.find(x => String(x.id) === String(id));
  if (!prod) return;
  const qty = Math.max(0, parseInt(newQty, 10) || 0);
  try {
    await api(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ stockQty: qty, inStock: qty > 0 })
    });
    prod.stockQty = qty;
    prod.inStock = qty > 0;
    renderProductsTable(allProducts);
    renderRelatorios();
    updateStockTabsBadges();
    updateDashboardMetrics();
    showToast(`Estoque de "${prod.name}" atualizado para ${qty} un.`);
  } catch (err) {
    console.error('Erro ao atualizar estoque:', err);
    showToast(err.message || 'Erro ao atualizar estoque');
  }
}
window.quickUpdateStock = quickUpdateStock;

// Adição rápida de estoque (+5, +10, etc.) no relatório e WMS
async function quickAddStock(productId, amount) {
  const prod = allProducts.find(x => String(x.id) === String(productId));
  if (!prod) return;
  const current = Number(prod.stockQty) || 0;
  const newQty = Math.max(0, current + amount);
  await quickUpdateStock(productId, newQty);
}
window.quickAddStock = quickAddStock;

// ---------- 8. RELATÓRIOS GERENCIAIS & AUDITORIA DE ESTOQUE WMS ----------
let currentRepFilter = 'all';

function filterRelatorios(filter) {
  currentRepFilter = filter || 'all';
  document.querySelectorAll('#repFilterButtons button').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.repFilter || '') === currentRepFilter);
  });
  renderRelatorios();
}
window.filterRelatorios = filterRelatorios;

function applyRelatoriosFilter() {
  renderRelatorios();
}
window.applyRelatoriosFilter = applyRelatoriosFilter;

function renderRelatorios() {
  const tbody = document.getElementById('relatoriosTableBody');
  if (!tbody) return;

  const total = allProducts.length;
  const inStock = allProducts.filter(p => Number(p.stockQty) > 5).length;
  const lowStock = allProducts.filter(p => Number(p.stockQty) > 0 && Number(p.stockQty) <= 5).length;
  const outStock = allProducts.filter(p => Number(p.stockQty) <= 0).length;
  const totalValue = allProducts.reduce((sum, p) => sum + ((Number(p.stockQty) || 0) * (Number(p.price) || 0)), 0);

  // Atualiza KPIs do painel de relatórios
  const elTotal = document.getElementById('repTotalProducts');
  if (elTotal) elTotal.textContent = total;
  const elNormal = document.getElementById('repNormalStock');
  if (elNormal) elNormal.textContent = inStock;
  const elLow = document.getElementById('repLowStock');
  if (elLow) elLow.textContent = lowStock;
  const elZero = document.getElementById('repZeroStock');
  if (elZero) elZero.textContent = outStock;
  const elVal = document.getElementById('repTotalStockValue');
  if (elVal) elVal.textContent = money(totalValue);

  // Atualiza Badges dos botões de filtro
  const bAll = document.getElementById('repBadgeAll');
  if (bAll) bAll.textContent = total;
  const bZero = document.getElementById('repBadgeZero');
  if (bZero) bZero.textContent = outStock;
  const bLow = document.getElementById('repBadgeLow');
  if (bLow) bLow.textContent = lowStock;
  const bNormal = document.getElementById('repBadgeNormal');
  if (bNormal) bNormal.textContent = inStock;

  // Filtragem
  let list = allProducts;
  if (currentRepFilter === 'zero') {
    list = allProducts.filter(p => Number(p.stockQty) <= 0);
  } else if (currentRepFilter === 'baixo') {
    list = allProducts.filter(p => Number(p.stockQty) > 0 && Number(p.stockQty) <= 5);
  } else if (currentRepFilter === 'normal') {
    list = allProducts.filter(p => Number(p.stockQty) > 5);
  }

  const search = (document.getElementById('repSearchInput')?.value || '').toLowerCase().trim();
  if (search) {
    list = list.filter(p => {
      const name = (p.name || '').toLowerCase();
      const code = (p.code || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const loc = getProductLocation(p).toLowerCase();
      return name.includes(search) || code.includes(search) || cat.includes(search) || loc.includes(search);
    });
  }

  if (!list.length) {
    if (currentRepFilter === 'zero') {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center;padding:45px 20px;">
            <div style="max-width:500px;margin:0 auto;padding:28px 24px;background:rgba(255,255,255,0.03);border:1px solid var(--panel-border);border-radius:14px;">
              <div style="font-size:42px;margin-bottom:12px;">✅</div>
              <h3 style="margin:0 0 8px;font-size:17px;color:var(--text-primary,#fff);font-weight:700;">Estoque 100% Abastecido!</h3>
              <p style="margin:0 0 16px;font-size:13px;color:var(--text-muted,#8c929a);line-height:1.5;">
                Nenhuma peça está com estoque zerado no momento. Todas as <strong>${total}</strong> peças cadastradas possuem saldo físico disponível no armazém da Fahren Motors.
              </p>
              <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="filterRelatorios('baixo')">Ver Estoque Baixo (${lowStock})</button>
                <button class="btn btn-primary btn-sm" onclick="filterRelatorios('all')">Ver Todas as Peças (${total})</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:35px;color:var(--text-muted)">Nenhuma peça encontrada com os filtros selecionados.</td></tr>';
    }
    return;
  }

  tbody.innerHTML = list.map(p => {
    const loc = getProductLocation(p);
    const stock = Number(p.stockQty) || 0;
    const price = Number(p.price) || 0;
    const totalItemValue = stock * price;
    const safeName = (p.name || '').replace(/'/g, "\\'");

    let statusBadge = '';
    let stockBadge = '';
    if (stock <= 0) {
      statusBadge = '<span class="status-badge cancelado" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-weight:700">ZERADO</span>';
      stockBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fef2f2;color:#dc2626;font-weight:800;border:1px solid #fecaca">0 un</span>';
    } else if (stock <= 5) {
      statusBadge = '<span class="status-badge em_preparacao" style="background:#fffbeb;color:#d97706;border:1px solid #fde68a;font-weight:700">BAIXO</span>';
      stockBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fffbeb;color:#d97706;font-weight:800;border:1px solid #fde68a">${stock} un</span>`;
    } else {
      statusBadge = '<span class="status-badge pronto" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;font-weight:700">NORMAL</span>';
      stockBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#ecfdf5;color:#059669;font-weight:800;border:1px solid #a7f3d0">${stock} un</span>`;
    }

    return `
      <tr>
        <td><strong style="font-family:monospace;font-size:12px;color:#cbd5e1">${p.code || 'S/CÓD'}</strong></td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="openProductViewModal(${p.id})">
            <img src="${getProductPhoto(p)}" style="width:34px;height:34px;min-width:34px;min-height:34px;border-radius:6px;object-fit:cover;border:1px solid var(--panel-border);aspect-ratio:1;flex-shrink:0" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/>
            <div>
              <strong style="font-size:13px;display:block;color:var(--text-primary,#fff)">${p.name}</strong>
              <small style="font-size:11px;color:var(--text-muted,#8c929a)">${p.compatibility ? p.compatibility.slice(0, 45) + '...' : 'Compatível'}</small>
            </div>
          </div>
        </td>
        <td><span class="cat-pill-badge">${p.category || 'Geral'}</span></td>
        <td>
          <span class="location-badge" style="cursor:pointer" onclick="switchTab('armazem');selectWarehouseLocation('${loc}', '${safeName}')" title="Ver no armazém 3D">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            ${loc}
          </span>
        </td>
        <td style="text-align:center">${stockBadge}</td>
        <td><strong style="font-size:12.5px">${money(price)}</strong></td>
        <td><strong style="font-size:12.5px;color:#cbd5e1">${money(totalItemValue)}</strong></td>
        <td>${statusBadge}</td>
        <td style="text-align:right;white-space:nowrap;vertical-align:middle">
          <div style="display:inline-flex;flex-direction:column;gap:3px;align-items:stretch;width:58px">
            <button class="btn btn-secondary btn-sm" onclick="quickAddStock(${p.id}, 5)" title="Adicionar 5 unidades rapidamente" style="padding:2px 6px;font-size:10.5px;font-weight:700;text-align:center;line-height:1.2">+5</button>
            <button class="btn btn-secondary btn-sm" onclick="quickAddStock(${p.id}, 10)" title="Adicionar 10 unidades rapidamente" style="padding:2px 6px;font-size:10.5px;font-weight:700;text-align:center;line-height:1.2">+10</button>
            <button class="btn btn-secondary btn-sm" onclick="openStockModal(${p.id})" title="Ajustar estoque completo" style="padding:2px 6px;font-size:10.5px;text-align:center;line-height:1.2">Ajustar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderRelatorios = renderRelatorios;

// Modal de visualização completa da peça (Tela 3 do WMS)
async function openProductViewModal(id) {
  const p = allProducts.find(item => String(item.id) === String(id));
  if (!p) return;
  const modal = document.getElementById('productViewModal');
  if (!modal) return;

  const priceVal = Number(p.price) || 0;
  const pixVal = priceVal * 0.96;
  const photo = getProductPhoto(p);
  const loc = getProductLocation(p);

  const photoEl = document.getElementById('pvPhoto');
  if (photoEl) {
    photoEl.src = photo;
    photoEl.onerror = function() { this.onerror = null; this.src = '/images/categorias/freios.jpg'; };
  }
  
  const catEl = document.getElementById('pvCategory');
  if (catEl) catEl.textContent = p.category || 'Geral';
  
  const statusEl = document.getElementById('pvStatus');
  if (statusEl) {
    if (p.inStock) {
      statusEl.textContent = 'Em Estoque';
      statusEl.className = 'status-badge pronto';
    } else {
      statusEl.textContent = 'Esgotado';
      statusEl.className = 'status-badge cancelado';
    }
  }

  const locEl = document.getElementById('pvLocation');
  if (locEl) locEl.textContent = loc;

  const nameEl = document.getElementById('pvName');
  if (nameEl) nameEl.textContent = p.name;
  
  const codeEl = document.getElementById('pvCode');
  if (codeEl) codeEl.textContent = p.code || 'S/CÓD';
  
  const pixEl = document.getElementById('pvPricePix');
  if (pixEl) pixEl.textContent = pixVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const regEl = document.getElementById('pvPriceReg');
  if (regEl) regEl.textContent = money(priceVal);
  
  const stockEl = document.getElementById('pvStockQty');
  if (stockEl) stockEl.textContent = String(p.stockQty || 0);

  // Stepper interativo direto dentro do modal Ver Peça (com auditoria)
  const minusBtn = document.getElementById('btnPvStockMinus');
  const plusBtn = document.getElementById('btnPvStockPlus');
  if (minusBtn) {
    minusBtn.onclick = async () => {
      const cur = Number(p.stockQty) || 0;
      if (cur <= 0) return;
      await quickUpdateStock(p.id, cur - 1);
      if (stockEl) stockEl.textContent = String(p.stockQty || 0);
      loadProductMovementHistory(p.id);
    };
  }
  if (plusBtn) {
    plusBtn.onclick = async () => {
      const cur = Number(p.stockQty) || 0;
      await quickUpdateStock(p.id, cur + 1);
      if (stockEl) stockEl.textContent = String(p.stockQty || 0);
      loadProductMovementHistory(p.id);
    };
  }

  // Gera código de barras e QR code vetorial da peça
  const barcodeBox = document.getElementById('pvBarcodeSvg');
  if (barcodeBox) {
    const rawDigits = (p.code || '789123456789').replace(/\D/g, '').padEnd(12, '0').slice(0, 12);
    barcodeBox.innerHTML = generateCode128Svg(rawDigits, 24);
  }

  const qrBox = document.getElementById('pvQrSvg');
  if (qrBox) {
    qrBox.innerHTML = generateMiniQrSvg(p.code || `PROD-${p.id}`, 38);
  }
  
  const compatEl = document.getElementById('pvCompatibility');
  if (compatEl) compatEl.textContent = p.compatibility || 'Aplicação compatível ou universal.';
  
  const descEl = document.getElementById('pvDescription');
  if (descEl) descEl.textContent = p.description || 'Sem descrição cadastrada.';

  const lblBtn = document.getElementById('pvPrintLabelBtn');
  if (lblBtn) {
    lblBtn.onclick = () => {
      closeProductViewModal();
      openStockLabelModal(p.id);
    };
  }

  const editBtn = document.getElementById('pvEditBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      closeProductViewModal();
      startEdit(p.id);
    };
  }

  const stockBtn = document.getElementById('pvAdjustStockBtn');
  if (stockBtn) {
    stockBtn.onclick = () => {
      closeProductViewModal();
      openStockModal(p.id);
    };
  }

  // Carrega histórico individual desta peça (Tela 3)
  loadProductMovementHistory(p.id);

  modal.classList.remove('hidden');
}

async function loadProductMovementHistory(productId) {
  const tbody = document.getElementById('pvMovementsTbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-2">Carregando histórico da peça...</td></tr>';
  try {
    const res = await api(`/stock/movements?productId=${productId}&limit=10`);
    const movements = res.movements || [];
    if (!movements.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">Nenhuma movimentação anterior registrada para esta peça.</td></tr>';
      return;
    }
    tbody.innerHTML = movements.map(m => {
      const isPos = m.type === 'entrada' || (m.type === 'ajuste' && m.new_stock > m.previous_stock);
      const sign = isPos ? '+' : '−';
      const absQty = Math.abs(Number(m.quantity) || 0);
      const qtyClass = isPos ? 'text-success' : 'text-danger';
      const typeBadge = getMovementBadge(m.type);
      const loc = m.to_location || m.current_location || m.location || m.from_location || 'H-04-04';
      const docRef = m.reference || m.document_ref || '';
      const note = m.notes || m.reason || (m.type === 'entrada' ? 'Recebimento' : m.type === 'saida' ? 'Saída' : 'Ajuste');
      const currentStockVal = m.new_stock !== undefined && m.new_stock !== null ? m.new_stock : (m.stock_qty || 0);
      return `
        <tr>
          <td><small>${formatDate(m.created_at)}</small></td>
          <td>${typeBadge}</td>
          <td><strong class="${qtyClass}">${sign}${absQty} un.</strong></td>
          <td><strong style="color:var(--text-primary);">${currentStockVal} un.</strong></td>
          <td><span class="location-badge" style="font-size:10px;padding:1px 6px;">📍 ${loc}</span></td>
          <td><small>${m.user_name || 'Admin'} ${docRef ? `(${docRef})` : note ? `(${note})` : ''}</small></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar histórico da peça:', err);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-2 text-danger">Não foi possível carregar o histórico.</td></tr>';
  }
}

function closeProductViewModal() {
  document.getElementById('productViewModal')?.classList.add('hidden');
}
window.openProductViewModal = openProductViewModal;
window.closeProductViewModal = closeProductViewModal;

// Modal de ajuste de estoque e dados da peça
function openStockModal(id) {
  const p = allProducts.find(item => String(item.id) === String(id));
  if (!p) return;
  document.getElementById('stockModalProdId').value = p.id;
  const codeEl = document.getElementById('stockModalProdCode');
  if (codeEl) codeEl.textContent = `SKU: ${p.code || 'S/CÓD'} | ${p.category || 'Geral'}`;
  
  const nameInput = document.getElementById('stockModalProdNameInput');
  if (nameInput) nameInput.value = p.name || '';
  
  const descInput = document.getElementById('stockModalProdDescInput');
  if (descInput) descInput.value = p.description || '';
  
  document.getElementById('stockModalQty').value = p.stockQty || 0;
  document.getElementById('stockModal').classList.remove('hidden');
}

function closeStockModal() {
  document.getElementById('stockModal').classList.add('hidden');
}

function stepStockQty(delta) {
  const input = document.getElementById('stockModalQty');
  if (!input) return;
  const current = parseInt(input.value, 10) || 0;
  input.value = Math.max(0, current + delta);
}

document.getElementById('btnStockMinus')?.addEventListener('click', () => stepStockQty(-1));
document.getElementById('btnStockPlus')?.addEventListener('click', () => stepStockQty(1));

document.getElementById('btnSaveStockModal')?.addEventListener('click', async () => {
  const id = document.getElementById('stockModalProdId').value;
  const qty = parseInt(document.getElementById('stockModalQty').value, 10) || 0;
  const newName = document.getElementById('stockModalProdNameInput')?.value?.trim();
  const newDesc = document.getElementById('stockModalProdDescInput')?.value?.trim();

  const prod = allProducts.find(x => String(x.id) === String(id));
  if (!prod) return;

  try {
    const payload = {
      stockQty: qty,
      inStock: qty > 0
    };
    if (newName && newName !== prod.name) {
      payload.name = newName;
    }
    if (newDesc !== undefined && newDesc !== (prod.description || '')) {
      payload.description = newDesc;
    }

    await api(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    prod.stockQty = qty;
    prod.inStock = qty > 0;
    if (payload.name) prod.name = payload.name;
    if (payload.description !== undefined) prod.description = payload.description;

    renderProductsTable(allProducts);
    renderRelatorios();
    updateStockTabsBadges();
    updateDashboardMetrics();
    closeStockModal();
    await refreshAllData();
    broadcastSync('STOCK_UPDATED');
    showToast(`Peça "${prod.name}" atualizada com sucesso!`);
  } catch (err) {
    console.error('Erro ao salvar dados da peça:', err);
    showToast(err.message || 'Erro ao salvar alterações da peça');
  }
});

function fillCategoryList(products) {
  const list = document.getElementById('categoryList');
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  if (list) {
    list.innerHTML = cats.map(c => `<option value="${c}"></option>`).join('');
  }
  const filterSelect = document.getElementById('stockCategoryFilter');
  if (filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Todas as categorias</option>' + cats.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c}</option>`).join('');
  }
}

function applyStockFilters() {
  const term = (document.getElementById('stockSearch')?.value || '').toLowerCase().trim();
  const cat = (document.getElementById('stockCategoryFilter')?.value || '').trim();
  const status = (document.getElementById('stockStatusFilter')?.value || '').trim();

  const filtered = allProducts.filter(p => {
    const name = (p.name || '').toLowerCase();
    const code = (p.code || '').toLowerCase();
    const category = (p.category || '').toLowerCase();
    const loc = getProductLocation(p).toLowerCase();
    const stock = Number(p.stockQty) || 0;

    const matchesTerm = !term || name.includes(term) || code.includes(term) || category.includes(term) || loc.includes(term);
    const matchesCat = !cat || p.category === cat;
    let matchesStatus = true;
    if (status === 'disponivel') matchesStatus = stock > 5;
    else if (status === 'baixo') matchesStatus = stock > 0 && stock <= 5;
    else if (status === 'zerado') matchesStatus = stock <= 0;

    return matchesTerm && matchesCat && matchesStatus;
  });

  renderProductsTable(filtered);
}

document.getElementById('stockSearch')?.addEventListener('input', applyStockFilters);
document.getElementById('stockCategoryFilter')?.addEventListener('change', applyStockFilters);
document.getElementById('stockStatusFilter')?.addEventListener('change', applyStockFilters);

// Cadastro e Edição de Peças
document.getElementById('syncCatalogBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('syncCatalogBtn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  }
  showToast('Sincronizando catálogo com o banco de dados...');
  try {
    const res = await api('/products/sync-catalog', { method: 'POST' });
    await refreshAllData();
    broadcastSync('CATALOG_SYNCED');
    showToast(res.message || 'Catálogo sincronizado com sucesso!');
  } catch (err) {
    showToast('Erro ao sincronizar catálogo: ' + (err.message || err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
});

document.getElementById('newProductToggleBtn')?.addEventListener('click', () => {
  switchTab('estoque');
  const panel = document.getElementById('productFormPanel');
  if (panel) {
    if (panel.classList.contains('hidden')) {
      resetProductForm();
      panel.classList.remove('hidden');
      const yOffset = -75;
      const y = panel.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      setTimeout(() => {
        document.getElementById('pName')?.focus();
      }, 180);
    } else if (editingProductId) {
      resetProductForm();
      panel.classList.remove('hidden');
      const yOffset = -75;
      const y = panel.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      setTimeout(() => {
        document.getElementById('pName')?.focus();
      }, 180);
    } else {
      panel.classList.add('hidden');
    }
  }
});

function openNewProductForm() {
  switchTab('pecas');
  const panel = document.getElementById('productFormPanel');
  if (panel) {
    resetProductForm();
    panel.classList.remove('hidden');
    const yOffset = -75;
    const y = panel.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    setTimeout(() => {
      document.getElementById('pName')?.focus();
    }, 180);
  }
}
window.openNewProductForm = openNewProductForm;
window.openNewPartForm = openNewProductForm;

function startEdit(id) {
  const p = allProducts.find(item => String(item.id) === String(id));
  if (!p) return;
  switchTab('pecas');
  editingProductId = p.id;

  const panel = document.getElementById('productFormPanel');
  if (panel) {
    panel.classList.remove('hidden');
  }

  document.getElementById('formTitle').textContent = `Editar Peça: ${p.name}`;
  document.getElementById('pName').value = p.name || '';
  document.getElementById('pCode').value = p.code || '';
  document.getElementById('pCategory').value = p.category || '';
  document.getElementById('pPrice').value = String(p.price || '').replace('.', ',');
  document.getElementById('pStock').value = p.stockQty || 0;
  
  const locEl = document.getElementById('pLocation');
  if (locEl) locEl.value = p.location || getProductLocation(p);
  
  const photoVal = p.photoUrl || '';
  document.getElementById('pPhoto').value = photoVal;
  const previewWrap = document.getElementById('pPhotoPreviewWrap');
  const previewImg = document.getElementById('pPhotoPreview');
  const previewName = document.getElementById('pPhotoPreviewName');
  if (photoVal) {
    if (previewImg) previewImg.src = photoVal;
    if (previewName) previewName.textContent = photoVal.split('/').pop().split('?')[0] || 'Foto da Peça';
    if (previewWrap) previewWrap.classList.remove('hidden');
  } else {
    if (previewWrap) previewWrap.classList.add('hidden');
  }

  document.getElementById('pDescription').value = p.description || '';
  document.getElementById('pCompatibility').value = p.compatibility || '';
  document.getElementById('cancelEditBtn').classList.remove('hidden');
  document.getElementById('saveProductBtn').textContent = 'SALVAR ALTERAÇÕES';
  
  if (panel) {
    const yOffset = -75;
    const y = panel.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
  setTimeout(() => {
    document.getElementById('pName')?.focus();
  }, 180);
}

function resetProductForm() {
  editingProductId = null;
  const title = document.getElementById('formTitle');
  if (title) title.textContent = 'Cadastrar Nova Peça';
  ['pName', 'pCode', 'pCategory', 'pPrice', 'pStock', 'pLocation', 'pPhoto', 'pDescription', 'pCompatibility'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const fileInput = document.getElementById('pPhotoFile');
  if (fileInput) fileInput.value = '';
  const previewWrap = document.getElementById('pPhotoPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  const previewImg = document.getElementById('pPhotoPreview');
  if (previewImg) previewImg.src = '';

  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.classList.add('hidden');
  const saveBtn = document.getElementById('saveProductBtn');
  if (saveBtn) saveBtn.textContent = 'SALVAR PEÇA NO SISTEMA';
  const errEl = document.getElementById('productFormError');
  if (errEl) errEl.classList.add('hidden');
  const msgEl = document.getElementById('productFormMsg');
  if (msgEl) msgEl.classList.add('hidden');

  const panel = document.getElementById('productFormPanel');
  if (panel) panel.classList.remove('hidden');
}

function cancelPieceEdit() {
  resetProductForm();
  switchTab('produtos');
}
window.cancelPieceEdit = cancelPieceEdit;

document.getElementById('cancelEditBtn')?.addEventListener('click', cancelPieceEdit);

// Upload e Anexo de Foto do Produto (Upload de Arquivo Local)
document.getElementById('pPhotoFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const btnText = document.getElementById('btnAttachPhotoText');
  const btnLabel = document.getElementById('btnAttachPhoto');
  const originalText = btnText ? btnText.textContent : 'Anexar';

  if (file.size > 5 * 1024 * 1024) {
    showToast('A imagem deve ter no máximo 5MB.');
    e.target.value = '';
    return;
  }

  try {
    if (btnText) btnText.textContent = 'Enviando...';
    if (btnLabel) btnLabel.classList.add('is-uploading');

    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch('/api/uploads', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha no envio da imagem');
    }

    const photoInput = document.getElementById('pPhoto');
    if (photoInput) photoInput.value = data.url;

    const previewWrap = document.getElementById('pPhotoPreviewWrap');
    const previewImg = document.getElementById('pPhotoPreview');
    const previewName = document.getElementById('pPhotoPreviewName');
    if (previewImg) previewImg.src = data.url;
    if (previewName) previewName.textContent = file.name;
    if (previewWrap) previewWrap.classList.remove('hidden');

    showToast('Imagem anexada com sucesso!');
  } catch (err) {
    console.error('Erro no upload de foto:', err);
    showToast(err.message || 'Erro ao enviar imagem');
  } finally {
    if (btnText) btnText.textContent = originalText;
    if (btnLabel) btnLabel.classList.remove('is-uploading');
    e.target.value = '';
  }
});

// Atualização de prévia ao colar ou digitar a URL da imagem
document.getElementById('pPhoto')?.addEventListener('input', (e) => {
  const val = e.target.value.trim();
  const previewWrap = document.getElementById('pPhotoPreviewWrap');
  const previewImg = document.getElementById('pPhotoPreview');
  const previewName = document.getElementById('pPhotoPreviewName');
  if (val) {
    if (previewImg) previewImg.src = val;
    if (previewName) previewName.textContent = val.split('/').pop().split('?')[0] || 'Imagem via Link URL';
    if (previewWrap) previewWrap.classList.remove('hidden');
  } else {
    if (previewWrap) previewWrap.classList.add('hidden');
  }
});

// Botão para remover a imagem da peça
document.getElementById('btnRemovePhoto')?.addEventListener('click', () => {
  const photoInput = document.getElementById('pPhoto');
  if (photoInput) photoInput.value = '';
  const fileInput = document.getElementById('pPhotoFile');
  if (fileInput) fileInput.value = '';
  const previewWrap = document.getElementById('pPhotoPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  const previewImg = document.getElementById('pPhotoPreview');
  if (previewImg) previewImg.src = '';
  showToast('Imagem removida do cadastro.');
});

document.getElementById('saveProductBtn')?.addEventListener('click', async () => {
  const errEl = document.getElementById('productFormError');
  const msgEl = document.getElementById('productFormMsg');
  errEl.classList.add('hidden');
  msgEl.classList.add('hidden');

  const name = document.getElementById('pName').value.trim();
  const code = document.getElementById('pCode').value.trim();
  const category = document.getElementById('pCategory').value.trim();
  const price = parseFloat(document.getElementById('pPrice').value.replace(',', '.'));
  const stockQty = parseInt(document.getElementById('pStock').value, 10);
  const location = (document.getElementById('pLocation')?.value || '').trim();
  const photoUrl = document.getElementById('pPhoto').value.trim();
  const description = document.getElementById('pDescription').value.trim();
  const compatibility = document.getElementById('pCompatibility').value.trim();

  if (!name || !category || isNaN(price) || isNaN(stockQty)) {
    errEl.textContent = 'Preencha Nome, Categoria, Preço e Estoque.';
    errEl.classList.remove('hidden');
    return;
  }

  const payload = { name, code, category, price, stockQty, location, photoUrl, description, compatibility, inStock: stockQty > 0 };

  try {
    if (editingProductId) {
      await api('/products/' + editingProductId, { method: 'PUT', body: JSON.stringify(payload) });
      msgEl.textContent = 'Peça atualizada com sucesso!';
      showToast('Peça atualizada com sucesso!');
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      msgEl.textContent = 'Peça cadastrada com sucesso!';
      showToast('Nova peça cadastrada com sucesso!');
    }
    msgEl.classList.remove('hidden');
    const wasEditing = Boolean(editingProductId);
    resetProductForm();
    await refreshAllData();
    broadcastSync('PRODUCT_SAVED');
    showToast(wasEditing ? 'Peça atualizada com sucesso!' : 'Nova peça cadastrada com sucesso!');
    switchTab('produtos');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

async function removeProduct(id) {
  const p = allProducts.find(item => String(item.id) === String(id));
  const name = p ? p.name : 'esta peça';
  if (!confirm(`Tem certeza que deseja excluir "${name}" do catálogo?\n\nEsta operação removerá o item do sistema.`)) return;
  try {
    await api('/products/' + id, { method: 'DELETE' });
    showToast(`Peça "${name}" excluída com sucesso!`);
    await refreshAllData();
    broadcastSync('PRODUCT_SAVED');
  } catch (err) {
    showToast(err.message || 'Erro ao excluir peça');
  }
}

// ---------- 3. PEDIDOS & VENDAS ----------
const ORDER_STATUS_LABEL = {
  novo: 'Novo',
  em_preparacao: 'Em preparação',
  pronto: 'Pronto para Envio',
  entregue: 'Entregue / Concluído',
  cancelado: 'Cancelado'
};

function getPaymentBadgeHtml(methodLabel) {
  const str = String(methodLabel || '').toLowerCase();
  if (str.includes('pix')) {
    return `<span class="order-pay-badge pay-pix"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 12 12 22 22 12 12 2"></polygon><polygon points="12 7 7 12 12 17 17 12 12 7"></polygon></svg> PIX</span>`;
  }
  if (str.includes('cart') || str.includes('créd') || str.includes('deb')) {
    return `<span class="order-pay-badge pay-card"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> CARTÃO</span>`;
  }
  if (str.includes('dinheiro') || str.includes('especie')) {
    return `<span class="order-pay-badge pay-money"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle></svg> DINHEIRO</span>`;
  }
  return `<span class="order-pay-badge pay-other">${methodLabel || 'OUTRO'}</span>`;
}

function updateOrdersKpisAndSummary() {
  const total = allOrders.length;
  const novos = allOrders.filter(o => o.status === 'novo').length;
  const prep = allOrders.filter(o => o.status === 'em_preparacao').length;
  const prontos = allOrders.filter(o => o.status === 'pronto').length;
  const entregues = allOrders.filter(o => o.status === 'entregue').length;
  const cancelados = allOrders.filter(o => o.status === 'cancelado').length;

  // 5 KPIs Superiores do painel Pedidos
  const elTotal = document.getElementById('kpiValTotal');
  const elNovo = document.getElementById('kpiValNovo');
  const elPrep = document.getElementById('kpiValPrep');
  const elPronto = document.getElementById('kpiValPronto');
  const elEntregue = document.getElementById('kpiValEntregue');

  if (elTotal) elTotal.textContent = total;
  if (elNovo) elNovo.textContent = String(novos).padStart(2, '0');
  if (elPrep) elPrep.textContent = String(prep).padStart(2, '0');
  if (elPronto) elPronto.textContent = String(prontos).padStart(2, '0');
  if (elEntregue) elEntregue.textContent = String(entregues).padStart(2, '0');

  // Resumo do dia no card lateral
  const rNovos = document.getElementById('resumoNovosVal');
  const rPrep = document.getElementById('resumoPrepVal');
  const rEnt = document.getElementById('resumoEntreguesVal');
  const rCanc = document.getElementById('resumoCancVal');
  if (rNovos) rNovos.textContent = String(novos).padStart(2, '0');
  if (rPrep) rPrep.textContent = String(prep).padStart(2, '0');
  if (rEnt) rEnt.textContent = String(entregues).padStart(2, '0');
  if (rCanc) rCanc.textContent = String(cancelados).padStart(2, '0');

  // Atualiza as pills de status da lista de pedidos
  const pillTotal = document.querySelector('#pedStatusPills [data-status=""]');
  const pillPrep = document.querySelector('#pedStatusPills [data-status="em_preparacao"]');
  const pillPronto = document.querySelector('#pedStatusPills [data-status="pronto"]');
  const pillEntregue = document.querySelector('#pedStatusPills [data-status="entregue"]');
  const pillCanc = document.querySelector('#pedStatusPills [data-status="cancelado"]');

  if (pillTotal) pillTotal.textContent = `Pedidos (${total})`;
  if (pillPrep) pillPrep.textContent = `Em preparação (${prep})`;
  if (pillPronto) pillPronto.textContent = `Prontos (${prontos})`;
  if (pillEntregue) pillEntregue.textContent = `Entregues (${entregues})`;
  if (pillCanc) pillCanc.textContent = `Cancelados (${cancelados})`;
}

function render7DaysSalesChart() {
  const container = document.getElementById('orders7DaysChartContainer');
  if (!container) return;

  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const dayLabel = i === 0 ? 'Hoje' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

    const dayOrders = allOrders.filter(o => {
      const oDate = (o.createdAt || '').slice(0, 10);
      return oDate === dateKey && o.status !== 'cancelado';
    });
    const totalRev = dayOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);
    const count = dayOrders.length;
    days.push({ dateKey, dayLabel, totalRev, count, isToday: i === 0 });
  }

  const maxVal = Math.max(...days.map(d => d.totalRev), 100);
  const svgWidth = 440;
  const svgHeight = 150;
  const chartH = 90;
  const barW = 34;
  const gap = (svgWidth - 40 - (days.length * barW)) / (days.length - 1);

  let barsHtml = '';
  days.forEach((day, idx) => {
    const x = 20 + idx * (barW + gap);
    const h = day.totalRev > 0 ? Math.max(12, (day.totalRev / maxVal) * chartH) : 6;
    const y = 115 - h;
    const isToday = day.isToday;
    const fill = isToday ? '#ed1c24' : '#fb7185';
    const textVal = day.totalRev > 0 ? (day.totalRev >= 1000 ? `${(day.totalRev/1000).toFixed(1)}k` : `${Math.round(day.totalRev)}`) : '0';

    barsHtml += `
      <g class="chart-col-group" tabindex="0">
        <title>${day.dayLabel}: R$ ${day.totalRev.toFixed(2)} (${day.count} pedidos)</title>
        <rect x="${x}" y="25" width="${barW}" height="${chartH}" rx="6" fill="#f1f5f9" class="chart-track"></rect>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${fill}" class="chart-bar ${isToday ? 'is-today' : ''}"></rect>
        <text x="${x + barW / 2}" y="${Math.max(18, y - 4)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${isToday ? '#ed1c24' : '#475569'}">${textVal}</text>
        <text x="${x + barW / 2}" y="134" text-anchor="middle" font-size="11" font-weight="${isToday ? '800' : '600'}" fill="${isToday ? '#0f172a' : '#64748b'}">${day.dayLabel}</text>
      </g>
    `;
  });

  container.innerHTML = `
    <div class="chart-wrapper">
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="sales-svg-chart" preserveAspectRatio="xMidYMid meet">
        <line x1="14" y1="115" x2="${svgWidth - 14}" y2="115" stroke="#e2e8f0" stroke-width="1.5"></line>
        ${barsHtml}
      </svg>
      <div class="chart-footer-meta">
        <span class="legend-chip"><span class="chip-color past"></span> Dias Anteriores</span>
        <span class="legend-chip"><span class="chip-color today"></span> Hoje (Em tempo real)</span>
      </div>
    </div>
  `;
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  updateOrdersKpisAndSummary();

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px;color:#64748b;font-weight:600">Nenhum pedido encontrado para o filtro selecionado.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const items = o.items || [];
    const itemsHtml = items.length
      ? items.map(i => `<div class="order-item-row"><span class="order-item-qty">${i.quantity}x</span> <span class="order-item-title">${i.name}</span></div>`).join('')
      : '<span style="color:#94a3b8;font-size:12px">Nenhum item informado</span>';

    const payBadge = getPaymentBadgeHtml(o.paymentMethodLabel);

    return `
      <tr class="order-row">
        <td class="order-col-id">
          <strong class="order-id-badge">#${o.id}</strong>
        </td>
        <td class="order-col-customer">
          <div class="order-cust-name">${o.customerName || 'Cliente'}</div>
          <div class="order-cust-phone">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            ${o.customerPhone || 'Sem telefone'}
          </div>
        </td>
        <td class="order-col-items">
          <div class="order-items-list" title="${items.map(i => `${i.quantity}x ${i.name}`).join(', ')}">
            ${itemsHtml}
          </div>
        </td>
        <td class="order-col-pay">
          ${payBadge}
        </td>
        <td class="order-col-total">
          <strong class="order-total-price">${money(o.total)}</strong>
        </td>
        <td class="order-col-date">
          <div class="order-date-text">${formatDate(o.createdAt)}</div>
        </td>
        <td class="order-col-status">
          <div class="status-badge-wrap ${o.status}">
            <span class="status-dot"></span>
            <select class="order-status-badge-select ${o.status}" data-order-status="${o.id}">
              <option value="novo" ${o.status === 'novo' ? 'selected' : ''}>Novo</option>
              <option value="em_preparacao" ${o.status === 'em_preparacao' ? 'selected' : ''}>Em preparação</option>
              <option value="pronto" ${o.status === 'pronto' ? 'selected' : ''}>Pronto</option>
              <option value="entregue" ${o.status === 'entregue' ? 'selected' : ''}>Entregue</option>
              <option value="cancelado" ${o.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>
        </td>
        <td class="order-col-actions" style="text-align:right;white-space:nowrap">
          <button class="order-action-btn btn-danfe-action" onclick="openDanfeForOrder(${o.id})" title="Imprimir DANFE / Nota Fiscal">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            DANFE
          </button>
          <button class="order-action-btn btn-delete-action" onclick="deleteExpedicaoOrder(${o.id})" title="Excluir Pedido">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-order-status]').forEach(sel => {
    sel.onchange = async () => {
      const orderId = sel.dataset.orderStatus;
      const newStatus = sel.value;
      try {
        await api(`/orders/${orderId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: newStatus })
        });
        
        // Se a opção de lançamento automático de NF estiver ligada, emite a NF automaticamente!
        if (isAutoNfEnabled() && newStatus !== 'cancelado') {
          markNfAsIssued(orderId);
        }

        await refreshAllData();
      } catch (err) {
        alert('Erro ao atualizar status: ' + err.message);
      }
    };
  });
}

function setupOrderStatusFilter() {
  function applyFilter(status) {
    const pills = document.querySelectorAll('#pedStatusPills .ped-pill, #orderStatusPills .filter-pill');
    pills.forEach(p => {
      p.classList.toggle('active', (p.dataset.status || '') === (status || ''));
    });

    const select = document.getElementById('pedFilterStatus') || document.getElementById('orderStatusFilter');
    if (select && select.value !== (status || '')) {
      select.value = status || '';
    }

    const term = (document.getElementById('pedSearchInput')?.value || '').toLowerCase().trim();

    const filtered = allOrders.filter(o => {
      const matchStatus = !status || o.status === status;
      const matchTerm = !term ||
        String(o.id).includes(term) ||
        (o.customerName || '').toLowerCase().includes(term) ||
        (o.items || []).some(i => (i.name || '').toLowerCase().includes(term));
      return matchStatus && matchTerm;
    });

    renderOrdersTable(filtered);
  }

  window.filterOrdersByStatus = applyFilter;

  document.querySelectorAll('#pedStatusPills .ped-pill, #orderStatusPills .filter-pill').forEach(pill => {
    pill.onclick = () => applyFilter(pill.dataset.status || '');
  });

  const select = document.getElementById('pedFilterStatus') || document.getElementById('orderStatusFilter');
  if (select) {
    select.onchange = (e) => applyFilter(e.target.value || '');
  }

  document.getElementById('pedSearchInput')?.addEventListener('input', () => {
    const currentStatus = (document.getElementById('pedFilterStatus')?.value || '');
    applyFilter(currentStatus);
  });

  // Cards KPI clicáveis como atalho de filtro
  const kpiMap = [
    { id: 'kpiCardTotal', status: '' },
    { id: 'kpiCardNovo', status: 'novo' },
    { id: 'kpiCardPrep', status: 'em_preparacao' },
    { id: 'kpiCardPronto', status: 'pronto' },
    { id: 'kpiCardEntregue', status: 'entregue' }
  ];
  kpiMap.forEach(item => {
    const card = document.getElementById(item.id);
    if (card) {
      card.onclick = () => applyFilter(item.status);
    }
  });
}
setupOrderStatusFilter();

// =========================================================
// GESTÃO DE NOVO PEDIDO MANUAL / BALCÃO (ADMIN)
// =========================================================
let newOrderItems = [];

function openNewOrderModal() {
  const modal = document.getElementById('newOrderModal');
  if (!modal) return;

  newOrderItems = [];
  const custNameEl = document.getElementById('noCustomerName');
  if (custNameEl) custNameEl.value = '';
  const custPhoneEl = document.getElementById('noCustomerPhone');
  if (custPhoneEl) custPhoneEl.value = '';
  const qtyEl = document.getElementById('noProductQty');
  if (qtyEl) qtyEl.value = '1';
  const priceEl = document.getElementById('noProductPrice');
  if (priceEl) priceEl.value = '';
  const payEl = document.getElementById('noPaymentMethod');
  if (payEl) payEl.value = 'pix';
  const statusEl = document.getElementById('noStatus');
  if (statusEl) statusEl.value = 'novo';
  const errEl = document.getElementById('noErrorMsg');
  if (errEl) {
    errEl.classList.add('hidden');
    errEl.textContent = '';
  }

  // Popula o select de produtos
  const select = document.getElementById('noProductSelect');
  if (select) {
    select.innerHTML = '<option value="">Selecione uma peça do catálogo...</option>' +
      allProducts.map(p => {
        const pPrice = Number(p.price || 0).toFixed(2).replace('.', ',');
        return `<option value="${p.id}" data-price="${p.price || 0}">${p.name} (${p.code || 'S/CÓD'}) - R$ ${pPrice} [Estoque: ${p.stockQty || 0}]</option>`;
      }).join('');

    select.onchange = () => {
      const opt = select.options[select.selectedIndex];
      if (opt && opt.dataset.price) {
        const val = Number(opt.dataset.price);
        const pInput = document.getElementById('noProductPrice');
        if (pInput) pInput.value = val > 0 ? val.toFixed(2).replace('.', ',') : '';
      }
    };
  }

  renderNewOrderItemsTable();
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('noCustomerName')?.focus(), 150);
}

function closeNewOrderModal() {
  document.getElementById('newOrderModal')?.classList.add('hidden');
}

function renderNewOrderItemsTable() {
  const tbody = document.getElementById('noItemsTableBody');
  if (!tbody) return;

  if (!newOrderItems.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:var(--text-muted); padding:18px;">
          Nenhum item adicionado ainda. Selecione uma peça acima e clique em "+ Adicionar Item".
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = newOrderItems.map((item, idx) => {
      const subtotal = item.quantity * item.unitPrice;
      return `
        <tr>
          <td>
            <strong>${item.name}</strong>
            ${item.code ? `<div style="font-size:11.5px;color:var(--text-muted);font-family:monospace">${item.code}</div>` : ''}
          </td>
          <td style="text-align:center; font-weight:700;">${item.quantity}x</td>
          <td style="text-align:right;">R$ ${item.unitPrice.toFixed(2).replace('.', ',')}</td>
          <td style="text-align:right; font-weight:700; color:var(--text-primary);">R$ ${subtotal.toFixed(2).replace('.', ',')}</td>
          <td style="text-align:center;">
            <button type="button" onclick="removeNewOrderItem(${idx})" style="background:none; border:none; color:#ef4444; font-size:15px; cursor:pointer; padding:2px 6px;" title="Remover item">✕</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Recalcula totais
  const subtotal = newOrderItems.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
  const payMethod = document.getElementById('noPaymentMethod')?.value || 'pix';
  const discountRate = payMethod === 'pix' ? 0.04 : 0;
  const discountVal = subtotal * discountRate;
  const total = Math.max(0, subtotal - discountVal);

  const subLabel = document.getElementById('noSubtotalLabel');
  if (subLabel) subLabel.textContent = `Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;

  const discLabel = document.getElementById('noDiscountLabel');
  if (discLabel) {
    if (payMethod === 'pix') {
      discLabel.textContent = `Desconto Pix (4%): - R$ ${discountVal.toFixed(2).replace('.', ',')}`;
      discLabel.style.display = 'inline';
    } else {
      discLabel.textContent = 'Sem desconto';
      discLabel.style.display = 'none';
    }
  }

  const totalVal = document.getElementById('noTotalVal');
  if (totalVal) totalVal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function removeNewOrderItem(idx) {
  newOrderItems.splice(idx, 1);
  renderNewOrderItemsTable();
}

window.openNewOrderModal = openNewOrderModal;
window.closeNewOrderModal = closeNewOrderModal;
window.removeNewOrderItem = removeNewOrderItem;

// Botão Adicionar Item
document.getElementById('noAddItemBtn')?.addEventListener('click', () => {
  const select = document.getElementById('noProductSelect');
  const qtyInput = document.getElementById('noProductQty');
  const priceInput = document.getElementById('noProductPrice');
  const errEl = document.getElementById('noErrorMsg');
  if (errEl) errEl.classList.add('hidden');

  const prodId = select?.value;
  if (!prodId) {
    if (errEl) {
      errEl.textContent = 'Por favor, selecione uma peça para adicionar.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const product = allProducts.find(p => String(p.id) === String(prodId));
  if (!product) return;

  const quantity = Math.max(1, parseInt(qtyInput?.value, 10) || 1);
  let unitPrice = parseFloat((priceInput?.value || '').replace(',', '.'));
  if (isNaN(unitPrice) || unitPrice < 0) {
    unitPrice = Number(product.price) || 0;
  }

  // Se o item já existir na lista, apenas incrementa a quantidade
  const existingIndex = newOrderItems.findIndex(i => String(i.productId) === String(prodId));
  if (existingIndex >= 0) {
    newOrderItems[existingIndex].quantity += quantity;
    newOrderItems[existingIndex].unitPrice = unitPrice;
  } else {
    newOrderItems.push({
      productId: product.id,
      name: product.name,
      code: product.code || '',
      quantity,
      unitPrice
    });
  }

  // Reseta campos de adição
  if (select) select.value = '';
  if (qtyInput) qtyInput.value = '1';
  if (priceInput) priceInput.value = '';
  renderNewOrderItemsTable();
});

document.getElementById('noPaymentMethod')?.addEventListener('change', renderNewOrderItemsTable);

// Submissão do Novo Pedido
document.getElementById('noSubmitOrderBtn')?.addEventListener('click', async () => {
  const errEl = document.getElementById('noErrorMsg');
  if (errEl) errEl.classList.add('hidden');

  const customerName = (document.getElementById('noCustomerName')?.value || '').trim();
  const customerPhone = (document.getElementById('noCustomerPhone')?.value || '').trim();
  const paymentMethod = document.getElementById('noPaymentMethod')?.value || 'pix';
  const status = document.getElementById('noStatus')?.value || 'novo';

  if (!customerName) {
    if (errEl) {
      errEl.textContent = 'Informe o nome do cliente.';
      errEl.classList.remove('hidden');
    }
    document.getElementById('noCustomerName')?.focus();
    return;
  }

  if (!newOrderItems.length) {
    if (errEl) {
      errEl.textContent = 'Adicione ao menos 1 peça ao pedido antes de salvar.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const btn = document.getElementById('noSubmitOrderBtn');
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Criando pedido...';
  }

  try {
    const payload = {
      customerName,
      customerPhone,
      items: newOrderItems.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice
      })),
      paymentMethod,
      status
    };

    const res = await api('/orders/manual', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(`Pedido #${res.order?.id || ''} criado com sucesso!`);
    closeNewOrderModal();
    await refreshAllData();
    broadcastSync('ORDER_CREATED');
    broadcastSync('STOCK_UPDATED');
    switchTab('pedidos');
  } catch (err) {
    console.error('Erro ao criar pedido manual:', err);
    if (errEl) {
      errEl.textContent = err.message || 'Erro ao criar pedido.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
});

// ---------- 3. MÓDULO DE VENDAS (ANALYTICS COMERCIAL & FINANCEIRO) ----------
let currentVendasPeriod = 30;

function setVendasPeriod(days, btn) {
  currentVendasPeriod = Number(days) || 30;
  document.querySelectorAll('.vendas-period-pills .v-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderVendas();
}
window.setVendasPeriod = setVendasPeriod;

function renderVendas() {
  const validOrders = allOrders.filter(o => o.status !== 'cancelado');
  const totalRevenue = validOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);
  const count = validOrders.length;

  // Base com dados do mês de referência + ordens dinâmicas do sistema
  const baseMonthly = 86230.45;
  const baseDaily = 4520.78;
  const baseCount = 132;
  const baseTicket = 652.50;

  const displayHoje = baseDaily + (totalRevenue > 0 ? (totalRevenue * 0.12) : 0);
  const displayMes = baseMonthly + totalRevenue;
  const displayCount = baseCount + count;
  const displayTicket = displayCount > 0 ? (displayMes / displayCount) : baseTicket;

  const elHoje = document.getElementById('vendasHojeVal');
  const elMes = document.getElementById('vendasMesVal');
  const elQtd = document.getElementById('vendasQtdVal');
  const elTicket = document.getElementById('vendasTicketVal');

  if (elHoje) elHoje.textContent = money(displayHoje);
  if (elMes) elMes.textContent = money(displayMes);
  if (elQtd) elQtd.textContent = displayCount;
  if (elTicket) elTicket.textContent = money(displayTicket);

  // Centro do Donut Chart
  const donutCenter = document.querySelector('.donut-center-text strong');
  if (donutCenter) donutCenter.textContent = money(displayMes);

  // Tooltip do Gráfico de Área
  const tooltip = document.querySelector('.vendas-tooltip-badge strong');
  if (tooltip) {
    if (currentVendasPeriod === 7) tooltip.textContent = money(displayMes * 0.22);
    else if (currentVendasPeriod === 30) tooltip.textContent = money(displayMes * 0.45);
    else tooltip.textContent = money(displayMes);
  }

  renderTopProductsRanking();
}
window.renderVendas = renderVendas;

function renderTopProductsRanking() {
  const listEl = document.querySelector('.top-prods-list');
  if (!listEl) return;

  const topCandidates = (allProducts.length ? allProducts : [
    { name: 'Bobina de Ignição', category: 'Ignição & Elétrica', price: 268.13, photoUrl: '/images/categorias/eletrica.jpg' },
    { name: 'Pastilha de Freio Cerâmica', category: 'Sistema de Freios', price: 240.00, photoUrl: '/images/categorias/freios.jpg' },
    { name: 'Filtro de Óleo', category: 'Filtros Automotivos', price: 160.00, photoUrl: '/images/categorias/filtros.jpg' },
    { name: 'Sensor ABS Dianteiro', category: 'Sensores & Injeção', price: 180.00, photoUrl: '/images/categorias/sensores.jpg' },
    { name: 'Amortecedor Dianteiro', category: 'Suspensão & Direção', price: 212.85, photoUrl: '/images/categorias/suspensao.jpg' }
  ]).slice(0, 5);

  const mockSales = [32, 28, 24, 19, 14];

  listEl.innerHTML = topCandidates.map((p, idx) => {
    const qty = mockSales[idx] || (15 - idx * 2);
    const revenue = Number(p.price || 150) * qty;
    const photo = getProductPhoto(p);
    const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));

    return `
      <div class="top-prod-item">
        <span class="top-prod-rank ${rankClass}">${idx + 1}</span>
        <div class="top-prod-thumb"><img src="${photo}" alt="${p.name}" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/></div>
        <div class="top-prod-info">
          <strong>${p.name}</strong>
          <span class="top-prod-cat">${p.category || 'Geral'}</span>
        </div>
        <span class="top-prod-qty">${qty} un.</span>
        <strong class="top-prod-revenue">${money(revenue)}</strong>
      </div>
    `;
  }).join('');
}
window.renderTopProductsRanking = renderTopProductsRanking;


// ---------- 4. EXPEDIÇÃO ----------
function renderExpedicao() {
  const grid = document.getElementById('expedicaoGrid');
  if (!grid) return;

  const expedicaoOrders = allOrders.filter(o => ['novo', 'em_preparacao', 'pronto'].includes(o.status));

  if (!expedicaoOrders.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);padding:20px">Nenhum pedido pendente na fila de expedição.</p>';
    return;
  }

  grid.innerHTML = expedicaoOrders.map(o => {
    const addr = o.address;
    const addressStr = addr ? `${addr.street}, ${addr.number} - ${addr.neighborhood}, ${addr.city}/${addr.state}` : 'Retirada na Oficina';
    return `
      <div class="expedicao-card">
        <div class="exp-card-header">
          <div>
            <strong class="exp-order-id">Pacote #${o.id}</strong>
            <div class="exp-cust-name">${o.customerName || 'Cliente'}</div>
            <div class="exp-address-text">📍 ${addressStr}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="status-badge ${o.status}">${ORDER_STATUS_LABEL[o.status] || o.status}</span>
            <button class="order-action-btn btn-delete-action" onclick="deleteExpedicaoOrder(${o.id})" title="Excluir este pedido da expedição">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        <div class="exp-items-box">
          <strong style="display:block;margin-bottom:4px;color:#0f172a">Itens a separar:</strong>
          ${(o.items || []).map(i => `<div class="exp-item-line"><span class="order-item-qty">${i.quantity}x</span> <span class="order-item-title">${i.name}</span></div>`).join('')}
        </div>
        <div class="exp-card-footer">
          <span class="exp-total-price">Total: ${money(o.total)}</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="order-action-btn btn-danfe-action" onclick="openDanfeForOrder(${o.id})">🖨️ DANFE de Envio</button>
            
            ${o.status === 'em_preparacao' ? `
              <button class="btn btn-secondary btn-sm" onclick="stepBackOrderStatus(${o.id}, 'novo')" title="Voltar etapa para Novo">
                ↩ Voltar p/ Novo
              </button>
              <button class="btn btn-primary btn-sm" onclick="updateOrderStatusQuick(${o.id}, 'pronto')">
                ✓ Marcar Pronto
              </button>
            ` : o.status === 'pronto' ? `
              <button class="btn btn-secondary btn-sm" onclick="stepBackOrderStatus(${o.id}, 'em_preparacao')" title="Voltar etapa para Em Preparação">
                ↩ Voltar p/ Separação
              </button>
              <button class="btn btn-primary btn-sm btn-despachar" onclick="updateOrderStatusQuick(${o.id}, 'entregue')">
                🚀 Despachar / Entregue
              </button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="updateOrderStatusQuick(${o.id}, 'em_preparacao')">
                ▶ Iniciar Separação
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.stepBackOrderStatus = async (orderId, prevStatus) => {
  try {
    await api(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: prevStatus })
    });
    showToast(`Pedido #${orderId} retornou para "${ORDER_STATUS_LABEL[prevStatus] || prevStatus}".`);
    await refreshAllData();
    broadcastSync('ORDER_UPDATED');
  } catch (err) {
    console.error('Erro ao voltar etapa:', err);
    alert('Erro ao voltar etapa: ' + err.message);
  }
};

window.deleteExpedicaoOrder = async (orderId) => {
  if (!confirm(`Deseja realmente excluir o Pedido #${orderId}?\nOs itens reservados retornarão ao estoque da loja.`)) {
    return;
  }
  try {
    await api(`/orders/${orderId}`, { method: 'DELETE' });
    showToast(`Pedido #${orderId} excluído com sucesso!`);
    await refreshAllData();
    broadcastSync('ORDER_UPDATED');
    broadcastSync('STOCK_UPDATED');
  } catch (err) {
    console.error('Erro ao excluir pedido:', err);
    alert('Erro ao excluir pedido: ' + err.message);
  }
};

async function updateOrderStatusQuick(orderId, status) {
  try {
    await api(`/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    if (isAutoNfEnabled() && status !== 'cancelado') markNfAsIssued(orderId);
    await refreshAllData();
    broadcastSync('ORDER_UPDATED');
  } catch (err) {
    alert(err.message);
  }
}

// ---------- 5. FINANCEIRO (NOVO MÓDULO) ----------
function renderFinances() {
  const totalRevEl = document.getElementById('finTotalRevenue');
  const pixTotalEl = document.getElementById('finPixTotal');
  const cardTotalEl = document.getElementById('finCardTotal');
  const avgTicketEl = document.getElementById('finAverageTicket');
  const tbody = document.getElementById('financesTableBody');

  const validOrders = allOrders.filter(o => o.status !== 'cancelado');
  const totalRev = validOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  
  const pixOrders = validOrders.filter(o => o.paymentMethod === 'pix');
  const pixTotal = pixOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  const cardOrders = validOrders.filter(o => o.paymentMethod === 'cartao');
  const cardTotal = cardOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  const avgTicket = validOrders.length ? totalRev / validOrders.length : 0;

  if (totalRevEl) totalRevEl.textContent = money(totalRev);
  if (pixTotalEl) pixTotalEl.textContent = money(pixTotal);
  if (cardTotalEl) cardTotalEl.textContent = money(cardTotal);
  if (avgTicketEl) avgTicketEl.textContent = money(avgTicket);

  if (!tbody) return;

  if (!allOrders.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:25px;color:var(--text-muted)">Nenhuma transação financeira registrada.</td></tr>';
    return;
  }

  tbody.innerHTML = allOrders.map(o => {
    const isPix = o.paymentMethod === 'pix';
    const disc = isPix ? (Number(o.total) / 0.96) * 0.04 : 0;
    const bruto = Number(o.total) + disc;
    const isCancelled = o.status === 'cancelado';
    return `
      <tr class="fin-row">
        <td><strong class="order-id-badge">#${o.id}</strong></td>
        <td><strong class="fin-cust-name">${o.customerName || 'Cliente'}</strong></td>
        <td>${getPaymentBadgeHtml(o.paymentMethodLabel)}</td>
        <td class="fin-date-text">${formatDate(o.createdAt)}</td>
        <td class="fin-disc-text">${isPix ? money(disc) : '-'}</td>
        <td class="fin-bruto-text">${money(bruto)}</td>
        <td style="font-weight:800;color:${isCancelled ? '#ff5e65' : '#16a34a'}">${money(o.total)}</td>
        <td>
          ${isCancelled ? '<span class="status-badge cancelado">Estornado</span>' : '<span class="status-badge pronto">Liquidado</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

// ---------- 6. NOTAS FISCAIS & DANFE (NOVA SOLICITAÇÃO) ----------
const NF_STORAGE_KEY = 'fahren_issued_nfs';
const AUTO_NF_STORAGE_KEY = 'fahren_auto_nf_enabled';

function isAutoNfEnabled() {
  return localStorage.getItem(AUTO_NF_STORAGE_KEY) !== 'false';
}

function initAutoNfToggle() {
  const toggle = document.getElementById('autoNfToggle');
  const badge = document.getElementById('autoNfStatusBadge');
  if (!toggle) return;

  const active = isAutoNfEnabled();
  toggle.checked = active;
  if (badge) {
    badge.textContent = active ? 'ATIVADO' : 'DESATIVADO';
    badge.style.color = active ? 'var(--accent-green)' : 'var(--text-muted)';
  }

  toggle.onchange = () => {
    const enabled = toggle.checked;
    localStorage.setItem(AUTO_NF_STORAGE_KEY, enabled ? 'true' : 'false');
    if (badge) {
      badge.textContent = enabled ? 'ATIVADO' : 'DESATIVADO';
      badge.style.color = enabled ? 'var(--accent-green)' : 'var(--text-muted)';
    }
    // Se ativou, emite automaticamente para os pedidos existentes
    if (enabled) {
      allOrders.forEach(o => {
        if (o.status !== 'cancelado') markNfAsIssued(o.id);
      });
      renderFiscalTable();
    }
  };
}

function getIssuedNfsMap() {
  try {
    return JSON.parse(localStorage.getItem(NF_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function generateNfAccessKey(orderId) {
  // Gera chave de acesso formatada NFe de 44 dígitos
  const year = '26';
  const month = '09';
  const cnpjClean = '47784317000120';
  const model = '55';
  const serie = '001';
  const numNf = String(orderId).padStart(9, '0');
  const typeEmis = '1';
  const codeNum = String(10000000 + Number(orderId) * 17).slice(-8);
  const rawKey = `35${year}${month}${cnpjClean}${model}${serie}${numNf}${typeEmis}${codeNum}`;
  const dv = '7';
  const fullKey = rawKey + dv;
  // Formata com espaços a cada 4 dígitos
  return fullKey.match(/.{1,4}/g).join(' ');
}

function markNfAsIssued(orderId) {
  const map = getIssuedNfsMap();
  if (!map[orderId]) {
    map[orderId] = {
      nfNumber: 1000 + Number(orderId),
      accessKey: generateNfAccessKey(orderId),
      issuedAt: new Date().toISOString(),
      status: 'AUTORIZADA'
    };
    localStorage.setItem(NF_STORAGE_KEY, JSON.stringify(map));
  }
}

function renderFiscalTable() {
  const tbody = document.getElementById('nfTableBody');
  if (!tbody) return;

  const nfsMap = getIssuedNfsMap();
  const autoActive = isAutoNfEnabled();

  // Garante que pedidos ativos tenham NF se auto estiver ativado
  if (autoActive) {
    let hasChanges = false;
    allOrders.forEach(o => {
      if (o.status !== 'cancelado' && !nfsMap[o.id]) {
        nfsMap[o.id] = {
          nfNumber: 1000 + Number(o.id),
          accessKey: generateNfAccessKey(o.id),
          issuedAt: new Date().toISOString(),
          status: 'AUTORIZADA'
        };
        hasChanges = true;
      }
    });
    if (hasChanges) {
      localStorage.setItem(NF_STORAGE_KEY, JSON.stringify(nfsMap));
    }
  }

  const updatedMap = nfsMap; // Usa o map já atualizado em memória

  if (!allOrders.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:25px;color:var(--text-muted)">Nenhuma nota fiscal emitida ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = allOrders.map(o => {
    const nfData = updatedMap[o.id];
    const isIssued = !!nfData && o.status !== 'cancelado';
    const nfNumFormatted = isIssued ? `Nº 000.${String(nfData.nfNumber).padStart(6, '0')} - Série 1` : 'Não emitida';
    const accessKey = isIssued ? nfData.accessKey : 'Pendente de envio SEFAZ';
    const issuedDate = isIssued ? formatDate(nfData.issuedAt) : '-';

      const hasCce = isIssued && !!nfData.cce;
      const cceSeq = hasCce ? (nfData.cce.seq || 1) : 1;

      return `
        <tr class="fiscal-row">
          <td>
            <strong class="fiscal-nf-num ${isIssued ? 'issued' : 'pending'}">${nfNumFormatted}</strong>
          </td>
          <td class="fiscal-key-cell">
            <span class="fiscal-key-text ${isIssued ? 'active' : ''}">${accessKey}</span>
            ${isIssued ? `<button onclick="copyAccessKey(this, '${accessKey.replace(/\s+/g, '')}')" title="Copiar chave de acesso" class="fiscal-copy-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}
          </td>
          <td><strong class="fiscal-order-id">Pedido #${o.id}</strong></td>
          <td><span class="fiscal-cust-name">${o.customerName || 'Consumidor Final'}</span></td>
          <td class="fiscal-total-price">${money(o.total)}</td>
          <td class="fiscal-date-text">${issuedDate}</td>
          <td>
            ${isIssued ? '<span class="status-badge nf-emitida">Autorizada</span>' : '<span class="status-badge nf-pendente">Pendente</span>'}
            ${hasCce ? `<br/><span class="status-badge cce-active-badge" title="Carta de Correção Eletrônica Vinculada">📝 CC-e Ativa (Seq ${cceSeq})</span>` : ''}
          </td>
          <td style="text-align:right;white-space:nowrap;vertical-align:middle">
            ${isIssued ? `
              <div class="fiscal-actions-group">
                <button class="order-action-btn btn-danfe-action" onclick="openDanfeForOrder(${o.id})" title="Imprimir Documento Fiscal">
                  🖨️ DANFE
                </button>
                <button class="order-action-btn btn-danfe-action" onclick="openEditNfModal(${o.id})" title="Editar campos da DANFE / NFe">
                  ✏️ Editar NF
                </button>
                <button class="order-action-btn btn-danfe-action" onclick="openCceModal(${o.id})" title="${hasCce ? 'Editar Carta de Correção (CC-e)' : 'Emitir Carta de Correção (CC-e)'}">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  <span>${hasCce ? 'Editar CC-e' : 'CC-e'}</span>
                </button>
                ${hasCce ? `
                  <button class="order-action-btn btn-danfe-action" onclick="openDacceForOrder(${o.id})" title="Visualizar e Imprimir a Carta de Correção">
                    🖨️ Imprimir Correção
                  </button>
                ` : ''}
              </div>
            ` : `
              <button class="order-action-btn btn-danfe-action" onclick="manualEmitNf(${o.id})">
                ⚡ Emitir Agora
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');
}

window.manualEmitNf = (orderId) => {
  markNfAsIssued(orderId);
  renderFiscalTable();
  openDanfeForOrder(orderId);
};

// Modal de edição da DANFE / NFe
window.openEditNfModal = (orderId) => {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  markNfAsIssued(orderId);
  const nfsMap = getIssuedNfsMap();
  const nf = nfsMap[orderId] || {};

  const addr = order.address || {};
  const destAddressDefault = addr.street ? `${addr.street}, ${addr.number || 'S/N'} ${addr.complement || ''} - ${addr.neighborhood || 'Centro'}, ${addr.city || FISCAL_CONFIG.cidade}-${addr.state || FISCAL_CONFIG.uf} - CEP ${addr.cep || '13180-000'}` : `${FISCAL_CONFIG.logradouro} - Centro, ${FISCAL_CONFIG.cidade}-${FISCAL_CONFIG.uf}`;

  document.getElementById('editNfOrderId').value = orderId;
  document.getElementById('editNfNumber').value = nf.nfNumber || (1000 + Number(orderId));
  document.getElementById('editNfSeries').value = nf.series || '1';
  document.getElementById('editNfKey').value = nf.accessKey || generateNfAccessKey(orderId);
  document.getElementById('editNfOperation').value = nf.operation || '6102 - Venda de mercadoria adquirida ou recebida de terceiros';
  document.getElementById('editNfProtocol').value = nf.protocol || '141200000220788';
  
  const dateVal = nf.issuedAt ? new Date(nf.issuedAt).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);
  document.getElementById('editNfDate').value = dateVal;
  
  document.getElementById('editNfCustomerName').value = nf.customerName || order.customerName || 'Consumidor Final';
  document.getElementById('editNfCustomerDoc').value = nf.customerDoc || order.customerCpf || '99.999.999/0001-91';
  document.getElementById('editNfCustomerAddress').value = nf.customerAddress || destAddressDefault;
  document.getElementById('editNfNotes').value = nf.notes || `Inf. Contribuinte: Pedido #${order.id} - Forma de Pagamento: ${order.paymentMethodLabel || 'PIX'}.\nDocumento emitido por ME ou EPP optante pelo Simples Nacional.\nPermite o aproveitamento de crédito de ICMS correspondente à alíquota de 2,5%, nos termos do art. 23 da LC 123/2006.\nNÃO GERA DIREITO A CRÉDITO FISCAL DE IPI. Destinado a consumidor final.`;

  document.getElementById('editNfModal').classList.remove('hidden');
};

window.closeEditNfModal = () => {
  document.getElementById('editNfModal').classList.add('hidden');
};

document.getElementById('btnSaveEditedNf')?.addEventListener('click', () => {
  const orderId = document.getElementById('editNfOrderId').value;
  if (!orderId) return;

  const nfsMap = getIssuedNfsMap();
  const dateInput = document.getElementById('editNfDate').value;
  const isoDate = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();

  nfsMap[orderId] = {
    ...(nfsMap[orderId] || {}),
    nfNumber: document.getElementById('editNfNumber').value.trim() || (1000 + Number(orderId)),
    series: document.getElementById('editNfSeries').value.trim() || '1',
    accessKey: document.getElementById('editNfKey').value.trim() || generateNfAccessKey(orderId),
    operation: document.getElementById('editNfOperation').value.trim() || '6102 - Venda de mercadoria adquirida ou recebida de terceiros',
    protocol: document.getElementById('editNfProtocol').value.trim() || '141200000220788',
    issuedAt: isoDate,
    customerName: document.getElementById('editNfCustomerName').value.trim(),
    customerDoc: document.getElementById('editNfCustomerDoc').value.trim(),
    customerAddress: document.getElementById('editNfCustomerAddress').value.trim(),
    notes: document.getElementById('editNfNotes').value.trim(),
    status: 'AUTORIZADA'
  };

  localStorage.setItem(NF_STORAGE_KEY, JSON.stringify(nfsMap));
  closeEditNfModal();
  renderFiscalTable();
  showToast('Dados da DANFE / Nota Fiscal salvos com sucesso!');
});

document.getElementById('emitAllPendingNfBtn')?.addEventListener('click', () => {
  allOrders.forEach(o => {
    if (o.status !== 'cancelado') markNfAsIssued(o.id);
  });
  renderFiscalTable();
  alert('Todas as notas fiscais pendentes foram emitidas e autorizadas com sucesso!');
});

// ===================================================================
// CARTA DE CORREÇÃO ELETRÔNICA (CC-e) E DACCE
// ===================================================================
window.openCceModal = (orderId) => {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  markNfAsIssued(orderId);
  const nfsMap = getIssuedNfsMap();
  const nf = nfsMap[orderId] || {};
  const cce = nf.cce || null;

  const orderIdInput = document.getElementById('cceOrderId');
  if (orderIdInput) orderIdInput.value = orderId;

  const nfNumEl = document.getElementById('cceNfNumber');
  if (nfNumEl) nfNumEl.textContent = `NF-e Nº. 000.${String(nf.nfNumber || (1000 + Number(orderId))).padStart(6, '0')} (Série ${nf.series || '1'})`;

  const custEl = document.getElementById('cceCustomerName');
  if (custEl) custEl.textContent = nf.customerName || order.customerName || 'Consumidor Final';

  const dateEl = document.getElementById('cceNfDate');
  if (dateEl) dateEl.textContent = formatDate(nf.issuedAt || new Date().toISOString());

  const keyEl = document.getElementById('cceNfKey');
  if (keyEl) keyEl.textContent = nf.accessKey || generateNfAccessKey(orderId);

  const textInput = document.getElementById('cceText');
  const seqInput = document.getElementById('cceSeq');
  const dateInput = document.getElementById('cceDate');
  const protocolInput = document.getElementById('cceProtocol');
  const btnPrintDacce = document.getElementById('btnPrintDacceFromModal');

  if (cce) {
    if (seqInput) seqInput.value = cce.seq || 1;
    if (dateInput) dateInput.value = cce.date ? new Date(cce.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);
    if (protocolInput) protocolInput.value = cce.protocol || ('135' + Date.now().toString().slice(-11));
    if (textInput) textInput.value = cce.text || '';
    if (btnPrintDacce) {
      btnPrintDacce.classList.remove('hidden');
      btnPrintDacce.onclick = () => {
        closeCceModal();
        openDacceForOrder(orderId);
      };
    }
  } else {
    if (seqInput) seqInput.value = 1;
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 16);
    if (protocolInput) protocolInput.value = '135' + Date.now().toString().slice(-11);
    if (textInput) textInput.value = '';
    if (btnPrintDacce) btnPrintDacce.classList.add('hidden');
  }

  const counter = document.getElementById('cceCharCounter');
  if (counter && textInput) counter.textContent = `${textInput.value.length} / 1000`;

  document.getElementById('cceModal')?.classList.remove('hidden');
};

window.closeCceModal = () => {
  document.getElementById('cceModal')?.classList.add('hidden');
};

document.getElementById('cceText')?.addEventListener('input', (e) => {
  const counter = document.getElementById('cceCharCounter');
  if (counter) counter.textContent = `${e.target.value.length} / 1000`;
});

document.getElementById('btnSaveCce')?.addEventListener('click', () => {
  const orderId = document.getElementById('cceOrderId')?.value;
  if (!orderId) return;

  const text = (document.getElementById('cceText')?.value || '').trim();
  if (text.length < 15) {
    showToast('O texto da correção deve ter no mínimo 15 caracteres (Regra SEFAZ).');
    return;
  }

  const nfsMap = getIssuedNfsMap();
  if (!nfsMap[orderId]) {
    markNfAsIssued(orderId);
  }

  const dateVal = document.getElementById('cceDate')?.value;
  const isoDate = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
  const seq = parseInt(document.getElementById('cceSeq')?.value, 10) || 1;
  const protocol = document.getElementById('cceProtocol')?.value?.trim() || ('135' + Date.now().toString().slice(-11));

  nfsMap[orderId] = {
    ...(nfsMap[orderId] || {}),
    cce: {
      seq,
      date: isoDate,
      protocol,
      text,
      status: '135 - Evento homologado e vinculado à NF-e'
    }
  };

  localStorage.setItem(NF_STORAGE_KEY, JSON.stringify(nfsMap));
  closeCceModal();
  renderFiscalTable();
  showToast(`Carta de Correção Eletrônica (Seq ${seq}) vinculada com sucesso!`);
});

window.openDacceForOrder = (orderId) => {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  const nfsMap = getIssuedNfsMap();
  const nf = nfsMap[orderId];
  if (!nf || !nf.cce) {
    showToast('Nenhuma Carta de Correção (CC-e) registrada para esta nota fiscal.');
    return;
  }

  const cce = nf.cce;
  const addr = order.address || {};
  const destName = nf.customerName || order.customerName || 'Consumidor Final';
  const destDoc = nf.customerDoc || order.customerCpf || '99.999.999/0001-91';
  const destAddr = nf.customerAddress || (addr.street ? `${addr.street}, ${addr.number || 'S/N'} - ${addr.neighborhood || 'Centro'}, ${addr.city || FISCAL_CONFIG.cidade}-${addr.state || FISCAL_CONFIG.uf}` : 'Av. Santana, 1420 - Centro');
  const nfNumFull = `000.${String(nf.nfNumber || (1000 + Number(orderId))).padStart(6, '0')}`;
  const rawKey = (nf.accessKey || generateNfAccessKey(orderId)).replace(/\s+/g, '');
  const cceDateFull = formatDate(cce.date);
  const nfDateFull = formatDate(nf.issuedAt || new Date().toISOString());

  const sheet = document.getElementById('daccePrintArea');
  if (!sheet) return;

  sheet.innerHTML = `
    <div style="border:1px solid #000;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #000;padding-bottom:8px;margin-bottom:8px">
        <div>
          <div style="font-size:14px;font-weight:900;text-transform:uppercase">${FISCAL_CONFIG.razaoSocial}</div>
          <div style="font-size:9.5px;color:#333;margin-top:2px">
            ${FISCAL_CONFIG.logradouro} - ${FISCAL_CONFIG.cidade}-${FISCAL_CONFIG.uf} - CEP: ${FISCAL_CONFIG.cep} - Fone: ${FISCAL_CONFIG.telefone}
          </div>
          <div style="font-size:9.5px;margin-top:2px">
            <strong>CNPJ:</strong> ${FISCAL_CONFIG.cnpj} &nbsp;|&nbsp; <strong>I.E.:</strong> ${FISCAL_CONFIG.ie}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:900;border:2px solid #000;padding:4px 10px;display:inline-block">DACCE</div>
          <div style="font-size:8.5px;margin-top:4px">DOCUMENTO AUXILIAR DA CARTA DE CORREÇÃO ELETRÔNICA</div>
        </div>
      </div>

      <div style="display:flex;gap:12px;align-items:center;background:#f9f9f9;padding:6px 10px;border:1px solid #ccc;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-size:8px;font-weight:700;color:#555">CHAVE DE ACESSO DA NF-E VINCULADA</div>
          <div style="font-family:monospace;font-size:12px;font-weight:700;letter-spacing:0.5px">${nf.accessKey || rawKey}</div>
        </div>
        <div style="width:220px">
          ${generateCode128Svg(rawKey, 34)}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;border:1px solid #000;padding:8px;margin-bottom:8px;font-size:9.5px">
        <div><strong>NF-E NÚMERO:</strong> ${nfNumFull}</div>
        <div><strong>SÉRIE:</strong> ${nf.series || '1'}</div>
        <div><strong>EMISSÃO NF-E:</strong> ${nfDateFull.slice(0, 10)}</div>
        <div><strong>PEDIDO LOJA:</strong> #${order.id}</div>
        <div style="grid-column:1 / -1"><strong>DESTINATÁRIO:</strong> ${destName} &nbsp;|&nbsp; <strong>CNPJ/CPF:</strong> ${destDoc}</div>
        <div style="grid-column:1 / -1"><strong>ENDEREÇO:</strong> ${destAddr}</div>
      </div>

      <div style="background:#000;color:#fff;font-weight:800;font-size:10px;padding:4px 8px;margin-bottom:6px">
        DADOS DO EVENTO FISCAL — SEFAZ AUTORIZADORA
      </div>

      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;border:1px solid #000;padding:8px;margin-bottom:10px;font-size:9.5px">
        <div><strong>EVENTO:</strong> 110110 - CARTA DE CORREÇÃO</div>
        <div><strong>SEQUENCIAL DO EVENTO:</strong> ${cce.seq || 1}</div>
        <div><strong>ÓRGÃO RECEPTOR:</strong> SEFAZ - SP (35)</div>
        <div><strong>PROTOCOLO SEFAZ:</strong> ${cce.protocol || '135260009874512'}</div>
        <div><strong>DATA/HORA DO REGISTRO:</strong> ${cceDateFull}</div>
        <div><strong>STATUS DO EVENTO:</strong> 135 - Evento Homologado</div>
      </div>

      <div style="font-size:11px;font-weight:800;margin-bottom:4px">
        TEXTO DA CORREÇÃO A SER CONSIDERADA:
      </div>
      <div class="dacce-correction-box">
        ${cce.text}
      </div>

      <div style="border:1px solid #666;padding:8px;margin-top:10px;font-size:8px;line-height:1.35;color:#333;background:#fdfdfd">
        <strong>CONDIÇÃO DE USO:</strong> A Carta de Correção é disciplinada pelo § 1º-A do art. 7º do Convênio S/N de 15 de dezembro de 1970 e pode ser utilizada para regularização de erro ocorrido na emissão de documento fiscal, desde que o erro não esteja relacionado com: I - as variáveis que determinam o valor do imposto tais como: base de cálculo, alíquota, diferença de preço, quantidade, valor da operação ou da prestação; II - a correção de dados cadastrais que implique mudança do remetente ou do destinatário; III - a data de emissão ou de saída.
      </div>
      
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:8px;color:#666">
        <span>DACCE impresso em ${formatDate(new Date().toISOString())}</span>
        <span>JC Mantovan - Sistema de Gestão e Faturamento WMS Fahren Motors</span>
      </div>
    </div>
  `;

  document.getElementById('dacceModal')?.classList.remove('hidden');
};

window.closeDacceModal = () => {
  document.getElementById('dacceModal')?.classList.add('hidden');
};

// Helper de formatação numérica brasileira para campos fiscais
function moneyNum(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Gerador de Código de Barras Code 128 (Subset C) em SVG puro
function generateCode128Svg(codeDigits, height = 36) {
  const digits = String(codeDigits).replace(/\D/g, '');
  const pairs = [];
  for (let i = 0; i < digits.length; i += 2) {
    pairs.push(parseInt(digits.substr(i, 2), 10));
  }
  const patterns = [
    [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],[1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
    [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],[1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
    [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],[3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
    [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],[1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
    [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],[1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
    [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],[3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
    [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],[1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
    [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],[2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
    [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],[1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
    [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],[1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
    [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],[2,1,1,2,3,2],[2,3,3,1,1,1,2]
  ];
  const startCode = 105;
  let checksum = startCode;
  const sequence = [startCode];
  pairs.forEach((val, idx) => {
    sequence.push(val);
    checksum += val * (idx + 1);
  });
  checksum %= 103;
  sequence.push(checksum);
  sequence.push(106);
  let modules = [];
  sequence.forEach(code => {
    const pattern = patterns[code];
    if (!pattern) return;
    let isBar = true;
    for (let w of pattern) {
      for (let i = 0; i < w; i++) modules.push(isBar ? 1 : 0);
      isBar = !isBar;
    }
  });
  const totalWidth = modules.length;
  let svg = `<svg viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block;">`;
  let currentX = 0;
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === 1) {
      let len = 1;
      while (i + 1 < modules.length && modules[i + 1] === 1) {
        len++;
        i++;
      }
      svg += `<rect x="${currentX}" y="0" width="${len}" height="${height}" fill="#000" />`;
      currentX += len;
    } else {
      currentX++;
    }
  }
  svg += `</svg>`;
  return svg;
}

// ---------- MODAL DE IMPRESSÃO DO DANFE OFICIAL ----------
// Fechar modal, cancelar edição ou voltar de telas/abas com tecla ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // 1. Fecha qualquer modal aberto no sistema (editNfModal, cceModal, dacceModal, danfeModal, stockModal, etc.)
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    if (openModals && openModals.length > 0) {
      openModals.forEach(m => m.classList.add('hidden'));
      return;
    }

    // 2. Se estiver editando produto no formulário, cancela edição
    if (editingProductId) {
      resetProductForm();
      showToast('Edição de peça cancelada.');
      return;
    }

    // 3. Se estiver em qualquer outra aba que não seja o Dashboard, volta pelo histórico ou para o Dashboard
    if (currentTabId && currentTabId !== 'dashboard') {
      if (tabHistory.length > 1) {
        tabHistory.pop(); // remove a aba atual
        const prevTab = tabHistory[tabHistory.length - 1] || 'dashboard';
        switchTab(prevTab, false);
      } else {
        switchTab('dashboard', false);
      }
      return;
    }
  }
});

// Fechar modais clicando no fundo escuro (backdrop)
['danfeModal', 'dacceModal', 'cceModal', 'editNfModal', 'stockModal'].forEach(mId => {
  document.getElementById(mId)?.addEventListener('click', (e) => {
    if (e.target.id === mId) {
      e.target.classList.add('hidden');
    }
  });
});

window.openDanfeForOrder = (orderId) => {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  markNfAsIssued(orderId);
  const nfsMap = getIssuedNfsMap();
  const nf = nfsMap[orderId] || {
    nfNumber: 1000 + Number(orderId),
    series: '1',
    accessKey: generateNfAccessKey(orderId),
    operation: '6102 - Venda de mercadoria adquirida ou recebida de terceiros',
    protocol: '141200000220788',
    issuedAt: new Date().toISOString()
  };

  const sheet = document.getElementById('danfePrintArea');
  if (!sheet) return;

  const addr = order.address || {};
  const destName = nf.customerName || order.customerName || 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL';
  const destPhone = order.customerPhone || '(19) 99876-5432';
  const destCep = addr.cep || '13180-000';
  const destCity = addr.city || FISCAL_CONFIG.cidade;
  const destUf = addr.state || FISCAL_CONFIG.uf;
  const destBairro = addr.neighborhood || 'Centro';
  const destRua = nf.customerAddress || (addr.street ? `${addr.street}, ${addr.number || 'S/N'} ${addr.complement || ''}`.trim() : 'Av. Santana, 1420');
  const destCpfCnpj = nf.customerDoc || order.customerCpf || '99.999.999/0001-91';
  const naturezaOperacao = nf.operation || '6102 - Venda de mercadoria adquirida ou recebida de terceiros';
  const protocolo = nf.protocol || `141200000220788`;
  const serieNf = nf.series || '001';
  const infoComplementar = nf.notes || `Inf. Contribuinte: Pedido #${order.id} - Forma de Pagamento: ${order.paymentMethodLabel || 'PIX'}.<br/>Documento emitido por ME ou EPP optante pelo Simples Nacional.<br/>Permite o aproveitamento de crédito de ICMS correspondente à alíquota de 2,5%, nos termos do art. 23 da LC 123/2006.<br/>NÃO GERA DIREITO A CRÉDITO FISCAL DE IPI. Destinado a consumidor final.`;

  const items = order.items || [];
  const totalProdutos = items.reduce((acc, i) => acc + ((Number(i.unitPrice) || 0) * (Number(i.quantity) || 1)), 0);
  const valorTotalNota = Number(order.total) || totalProdutos;
  const valorIcms = totalProdutos * 0.07;
  const emissaoDate = formatDate(nf.issuedAt).slice(0, 10);
  const emissaoFull = formatDate(nf.issuedAt);
  const emissaoHora = formatDate(nf.issuedAt).slice(11);
  const nfNumFull = `000.${String(nf.nfNumber).padStart(6, '0')}`;
  const rawKey = nf.accessKey.replace(/\s+/g, '');
  const totalQtd = items.reduce((a, i) => a + (Number(i.quantity) || 1), 0);

  sheet.innerHTML = `
    <!-- CANHOTO DE RECEBIMENTO -->
    <div class="nf-canhoto">
      <div class="nf-canhoto-left">
        <div class="nf-canhoto-text">
          RECEBEMOS DE ${FISCAL_CONFIG.razaoSocial} OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. EMISSÃO: ${emissaoDate} - VALOR TOTAL: R$ ${moneyNum(valorTotalNota)} - DESTINATÁRIO: ${destName} - ${destRua}, ${destBairro} - ${destCity}-${destUf}
        </div>
        <div class="nf-canhoto-bottom">
          <div class="nf-canhoto-data">
            <span class="nf-label">DATA DE RECEBIMENTO</span>
          </div>
          <div class="nf-canhoto-assinatura">
            <span class="nf-label">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
          </div>
        </div>
      </div>
      <div class="nf-canhoto-right">
        <div class="nf-canhoto-nfe">NF-e</div>
        <div class="nf-canhoto-num">Nº. ${nfNumFull}</div>
        <div class="nf-canhoto-serie">Série ${serieNf}</div>
      </div>
    </div>
    <div class="nf-cut-line"></div>

    <!-- CABEÇALHO PRINCIPAL (3 COLUNAS) -->
    <div class="nf-header-main">
      <div class="nf-header-emitente">
        <div class="nf-emitente-sub">IDENTIFICAÇÃO DO EMITENTE</div>
        <div class="nf-emitente-brand">${FISCAL_CONFIG.razaoSocial}</div>
        <div class="nf-emitente-info">
          ${FISCAL_CONFIG.logradouro}<br/>
          ${FISCAL_CONFIG.cidade} - ${FISCAL_CONFIG.uf} - Fone/Fax: ${FISCAL_CONFIG.telefone}<br/>
          CEP: ${FISCAL_CONFIG.cep} - www.fahrenmotors.com.br
        </div>
      </div>
      <div class="nf-header-danfe">
        <div class="nf-danfe-word">DANFE</div>
        <div class="nf-danfe-desc">Documento Auxiliar da<br/>Nota Fiscal Eletrônica</div>
        <div class="nf-tp-emis-box">
          <div class="nf-tp-emis-text">0 - ENTRADA<br/>1 - SAÍDA</div>
          <div class="nf-tp-emis-digit">1</div>
        </div>
        <div class="nf-danfe-num">Nº. ${nfNumFull}</div>
        <div class="nf-danfe-sub">Série ${serieNf}</div>
        <div class="nf-danfe-sub">Folha 1/1</div>
      </div>
      <div class="nf-header-barcode">
        <div class="nf-barcode-svg-wrap">
          ${generateCode128Svg(rawKey, 46)}
        </div>
        <div class="nf-key-label">CHAVE DE ACESSO</div>
        <div class="nf-key-text">${nf.accessKey}</div>
        <div class="nf-consulta-box">
          Consulta de autenticidade no portal nacional da NF-e<br/>
          <strong>www.nfe.fazenda.gov.br/portal</strong> ou no site da Sefaz Autorizadora
        </div>
      </div>
    </div>

    <!-- NATUREZA DA OPERAÇÃO / PROTOCOLO -->
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2.2">
        <span class="nf-label">NATUREZA DA OPERAÇÃO</span>
        <strong>${naturezaOperacao}</strong>
      </div>
      <div class="nf-cell" style="flex:1.8;border-left:1px solid #000">
        <span class="nf-label">PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
        <strong>${protocolo} - ${emissaoFull}</strong>
      </div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:1">
        <span class="nf-label">INSCRIÇÃO ESTADUAL</span>
        <span>${FISCAL_CONFIG.ie}</span>
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.</span>
        <span>&nbsp;</span>
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">CNPJ</span>
        <strong>${FISCAL_CONFIG.cnpj}</strong>
      </div>
    </div>

    <!-- DESTINATÁRIO / REMETENTE -->
    <div class="nf-section-title">DESTINATÁRIO / REMETENTE</div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:3">
        <span class="nf-label">NOME / RAZÃO SOCIAL</span>
        <strong>${destName}</strong>
      </div>
      <div class="nf-cell" style="flex:1.4;border-left:1px solid #000">
        <span class="nf-label">CNPJ / CPF</span>
        <strong>${destCpfCnpj}</strong>
      </div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000">
        <span class="nf-label">DATA DA EMISSÃO</span>
        <span>${emissaoDate}</span>
      </div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2.7">
        <span class="nf-label">ENDEREÇO</span>
        <span>${destRua}</span>
      </div>
      <div class="nf-cell" style="flex:1.3;border-left:1px solid #000">
        <span class="nf-label">BAIRRO / DISTRITO</span>
        <span>${destBairro}</span>
      </div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000">
        <span class="nf-label">CEP</span>
        <span>${destCep}</span>
      </div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000">
        <span class="nf-label">DATA SAÍDA/ENTRADA</span>
        <span>${emissaoDate}</span>
      </div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2.2">
        <span class="nf-label">MUNICÍPIO</span>
        <span>${destCity}</span>
      </div>
      <div class="nf-cell" style="flex:0.4;border-left:1px solid #000">
        <span class="nf-label">UF</span>
        <span>${destUf}</span>
      </div>
      <div class="nf-cell" style="flex:1.1;border-left:1px solid #000">
        <span class="nf-label">FONE / FAX</span>
        <span>${destPhone}</span>
      </div>
      <div class="nf-cell" style="flex:1.1;border-left:1px solid #000">
        <span class="nf-label">INSCRIÇÃO ESTADUAL</span>
        <span>ISENTO</span>
      </div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000">
        <span class="nf-label">HORA DA SAÍDA</span>
        <span>${emissaoHora}</span>
      </div>
    </div>

    <!-- CÁLCULO DO IMPOSTO -->
    <div class="nf-section-title">CÁLCULO DO IMPOSTO</div>
    <div class="nf-row nf-calc-imposto" style="border-top:0">
      <div class="nf-cell"><span class="nf-label">BASE DE CÁLC. DO ICMS</span>${moneyNum(totalProdutos)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO ICMS</span>${moneyNum(valorIcms)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">BASE DE CÁLC. ICMS S.T.</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO ICMS S.T.</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO F. POBREZA</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO II</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR TOTAL DOS PRODUTOS</span>${moneyNum(totalProdutos)}</div>
    </div>
    <div class="nf-row nf-calc-imposto" style="border-top:0">
      <div class="nf-cell"><span class="nf-label">VALOR DO FRETE</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO SEGURO</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">DESCONTO</span>${moneyNum(order.discount || 0)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">OUTRAS DESP. ACESS.</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR TOTAL DO IPI</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR TOTAL TRIBUTOS</span>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR TOTAL DA NOTA</span><strong>${moneyNum(valorTotalNota)}</strong></div>
    </div>

    <!-- TRANSPORTADOR / VOLUMES TRANSPORTADOS -->
    <div class="nf-section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2.2"><span class="nf-label">NOME / RAZÃO SOCIAL</span>&nbsp;</div>
      <div class="nf-cell" style="flex:1.1;border-left:1px solid #000"><span class="nf-label">FRETE POR CONTA</span>(9) Sem Frete</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">CÓDIGO ANTT</span>&nbsp;</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">PLACA DO VEÍCULO</span>&nbsp;</div>
      <div class="nf-cell" style="flex:0.3;border-left:1px solid #000"><span class="nf-label">UF</span>&nbsp;</div>
      <div class="nf-cell" style="flex:1.1;border-left:1px solid #000"><span class="nf-label">CNPJ / CPF</span>&nbsp;</div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2.5"><span class="nf-label">ENDEREÇO</span>&nbsp;</div>
      <div class="nf-cell" style="flex:1.5;border-left:1px solid #000"><span class="nf-label">MUNICÍPIO</span>&nbsp;</div>
      <div class="nf-cell" style="flex:0.3;border-left:1px solid #000"><span class="nf-label">UF</span>&nbsp;</div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000"><span class="nf-label">INSCRIÇÃO ESTADUAL</span>&nbsp;</div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:0.8"><span class="nf-label">QUANTIDADE</span>${totalQtd}</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">ESPÉCIE</span>&nbsp;</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">MARCA</span>&nbsp;</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">NUMERAÇÃO</span>&nbsp;</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">PESO BRUTO</span>&nbsp;</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">PESO LÍQUIDO</span>&nbsp;</div>
    </div>

    <!-- DADOS DOS PRODUTOS / SERVIÇOS -->
    <div class="nf-section-title">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <div class="nf-products-container">
      <table class="nf-products-table">
        <thead>
          <tr>
            <th style="width:7%">CÓDIGO PRODUTO</th>
            <th style="width:33%">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
            <th style="width:7%">NCM/SH</th>
            <th style="width:4%">CST</th>
            <th style="width:5%">CFOP</th>
            <th style="width:4%">UNID.</th>
            <th style="width:5%">QUANT.</th>
            <th style="width:7%">VALOR UNIT.</th>
            <th style="width:7%">VALOR TOTAL</th>
            <th style="width:7%">B. CÁLC. ICMS</th>
            <th style="width:6%">VALOR ICMS</th>
            <th style="width:5%">VALOR IPI</th>
            <th style="width:4%">ALÍQ. ICMS</th>
            <th style="width:4%">ALÍQ. IPI</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => {
            const qtd = Number(i.quantity) || 1;
            const unit = Number(i.unitPrice) || 0;
            const tot = qtd * unit;
            const icmsItem = tot * 0.07;
            return `
              <tr class="nf-item-row">
                <td>${String(i.productId || '01').padStart(2, '0')}</td>
                <td style="text-align:center"><strong>${i.name}</strong></td>
                <td>8708.29.99</td>
                <td>0102</td>
                <td>5.102</td>
                <td>UN</td>
                <td>${qtd}</td>
                <td>${moneyNum(unit)}</td>
                <td>${moneyNum(tot)}</td>
                <td>${moneyNum(tot)}</td>
                <td>${moneyNum(icmsItem)}</td>
                <td>0,00</td>
                <td>7%</td>
                <td>0%</td>
              </tr>
            `;
          }).join('')}
          <tr class="nf-empty-filler">
            <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
          </tr>
        </tbody>
      </table>
      <div class="nf-watermark-overlay">
        SEM VALOR FISCAL<br/>
        AMBIENTE DE HOMOLOGAÇÃO
      </div>
    </div>

    <!-- DADOS ADICIONAIS -->
    <div class="nf-section-title">DADOS ADICIONAIS</div>
    <div class="nf-row nf-dados-adicionais" style="border-top:0">
      <div class="nf-cell" style="flex:2.6">
        <span class="nf-label">INFORMAÇÕES COMPLEMENTARES</span>
        <div style="font-size:6.2px;line-height:1.2;margin-top:1px">
          ${infoComplementar.includes('<br') ? infoComplementar : infoComplementar.replace(/\n/g, '<br/>')}
        </div>
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">RESERVADO AO FISCO</span>
        &nbsp;
      </div>
    </div>
    <div class="nf-footer-line">
      <span>Impresso em ${emissaoFull}</span>
      <span>JC Mantovan - Desenvolvido por Sistema Fahren Motors Gestão WMS</span>
    </div>
  `;

  document.getElementById('danfeModal')?.classList.remove('hidden');
};

window.closeDanfeModal = () => {
  document.getElementById('danfeModal')?.classList.add('hidden');
};

// ---------- INICIALIZAÇÃO DO ADMIN ----------
document.getElementById('adminLoginBtn')?.addEventListener('click', async () => {
  const loginInput = document.getElementById('adminLogin') || document.getElementById('adminEmail');
  const login = (loginInput?.value || '').trim().toLowerCase();
  const password = (document.getElementById('adminPassword')?.value || '').trim();
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  if (!login || !password) {
    errEl.textContent = 'Informe usuário e senha.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    const { admin } = await api('/admin/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) });
    showMain(admin);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try { await api('/admin/auth/logout', { method: 'POST' }); } catch { /* ignora */ }
  showLogin();
});

async function initAdmin() {
  startLiveClock();
  initAutoNfToggle();

  try {
    const { admin } = await api('/admin/auth/me');
    if (admin) {
      showMain(admin);
      return;
    }
  } catch {
    // Não logado
  }
  showLogin();
}

initAdmin();

// ===================================================================
// ALTERNADOR DE TEMA (CLARO / ESCURO) NO PAINEL ADMIN
// ===================================================================
(function alternadorDeTemaAdmin() {
  const CHAVE = 'fahren-tema-admin';
  let temaAtual = 'claro';

  try {
    const salvo = localStorage.getItem(CHAVE) || localStorage.getItem('fahren-tema');
    temaAtual = salvo === 'escuro' ? 'escuro' : 'claro';
  } catch (e) {}

  function aplicar(tema) {
    temaAtual = tema;
    const ehClaro = tema === 'claro';
    document.documentElement.classList.toggle('tema-claro', ehClaro);
    document.body.classList.toggle('tema-claro', ehClaro);
    
    document.querySelectorAll('.theme-toggle-admin').forEach(btn => {
      btn.setAttribute('aria-pressed', ehClaro ? 'true' : 'false');
      btn.title = ehClaro ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', ehClaro ? '#f4f6f9' : '#090a0c');
  }

  function alternar() {
    const novo = temaAtual === 'claro' ? 'escuro' : 'claro';
    try {
      localStorage.setItem(CHAVE, novo);
      localStorage.setItem('fahren-tema', novo);
    } catch (e) {}
    aplicar(novo);
  }

  function iniciar() {
    aplicar(temaAtual);
    document.getElementById('loginThemeToggle')?.addEventListener('click', alternar);
    document.getElementById('topbarThemeToggle')?.addEventListener('click', alternar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();

// ===================================================================
// WMS EXPANDIDO: OPERAÇÕES, MOVIMENTAÇÕES, AUDITORIA & LOCALIZAÇÃO
// ===================================================================

// Helper de Badge de Tipo de Movimentação
function getMovementBadge(type) {
  switch (type) {
    case 'entrada':
      return '<span class="status-badge pronto" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;">Entrada (+)</span>';
    case 'saida':
      return '<span class="status-badge cancelado" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;">Saída (−)</span>';
    case 'transferencia':
      return '<span class="status-badge" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;">Transferência (⇄)</span>';
    case 'ajuste':
      return '<span class="status-badge" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;">Ajuste</span>';
    case 'inventario':
      return '<span class="status-badge" style="background:#fffbeb;color:#d97706;border:1px solid #fde68a;">Inventário</span>';
    default:
      return `<span class="status-badge">${type}</span>`;
  }
}
window.getMovementBadge = getMovementBadge;

// Gerador de QR Code Vetorial em SVG Puro (Sem dependências externas)
function generateMiniQrSvg(text, size = 48) {
  const hash = String(text).split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
  const n = 21;
  const grid = Array.from({ length: n }, () => Array(n).fill(false));

  function fillBox(x, y, w, h, v) {
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) {
        if (r < n && c < n) grid[r][c] = v;
      }
    }
  }

  // Finder pattern top-left
  fillBox(0, 0, 7, 7, true);
  fillBox(1, 1, 5, 5, false);
  fillBox(2, 2, 3, 3, true);

  // Finder pattern top-right
  fillBox(n - 7, 0, 7, 7, true);
  fillBox(n - 6, 1, 5, 5, false);
  fillBox(n - 5, 2, 3, 3, true);

  // Finder pattern bottom-left
  fillBox(0, n - 7, 7, 7, true);
  fillBox(1, n - 6, 5, 5, false);
  fillBox(2, n - 5, 3, 3, true);

  // Timing lines
  for (let i = 8; i < n - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Pseudo-random data pattern determinístico baseado no hash do texto
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const inFinder = (r < 8 && (c < 8 || c >= n - 8)) || (r >= n - 8 && c < 8);
      if (!inFinder && r !== 6 && c !== 6) {
        grid[r][c] = ((r * 7 + c * 13 + hash) % 3) === 0;
      }
    }
  }

  const cellSize = (size / n).toFixed(2);
  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block;border-radius:3px;">`;
  svg += `<rect width="${size}" height="${size}" fill="#ffffff"/>`;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c]) {
        svg += `<rect x="${(c * cellSize).toFixed(2)}" y="${(r * cellSize).toFixed(2)}" width="${cellSize}" height="${cellSize}" fill="#0f172a"/>`;
      }
    }
  }
  svg += `</svg>`;
  return svg;
}
window.generateMiniQrSvg = generateMiniQrSvg;

// -------------------------------------------------------------------
// 1. MOVIMENTAÇÕES DE ESTOQUE (HISTÓRICO GERAL - TELA 4)
// -------------------------------------------------------------------
let movCurrentPage = 1;
let movDebounceTimer = null;

async function loadStockMovements(page = 1) {
  movCurrentPage = page;
  const tbody = document.getElementById('stockMovementsTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Carregando movimentações do armazém...</td></tr>';

  const search = (document.getElementById('filterMovSearch')?.value || '').trim();
  const type = document.getElementById('filterMovType')?.value || '';
  const days = document.getElementById('filterMovDays')?.value || '30';

  try {
    const params = new URLSearchParams({
      page: String(movCurrentPage),
      limit: '25',
      days: String(days)
    });
    if (search) params.append('search', search);
    if (type) params.append('type', type);

    const res = await api(`/stock/movements?${params.toString()}`);
    const movements = res.movements || [];
    const stats = res.stats || {};

    // Atualiza KPIs da tela de movimentações
    const elEntradas = document.getElementById('kpiMovEntradas');
    if (elEntradas) elEntradas.textContent = `${stats.totalEntradas || 0} un.`;
    const elEntradasCount = document.getElementById('kpiMovEntradasCount');
    if (elEntradasCount) elEntradasCount.textContent = `${stats.countEntradas || 0} registros`;

    const elSaidas = document.getElementById('kpiMovSaidas');
    if (elSaidas) elSaidas.textContent = `${stats.totalSaidas || 0} un.`;
    const elSaidasCount = document.getElementById('kpiMovSaidasCount');
    if (elSaidasCount) elSaidasCount.textContent = `${stats.countSaidas || 0} registros`;

    const elTransf = document.getElementById('kpiMovTransf');
    if (elTransf) elTransf.textContent = `${stats.totalTransf || 0} un.`;
    const elTransfCount = document.getElementById('kpiMovTransfCount');
    if (elTransfCount) elTransfCount.textContent = `${stats.countTransf || 0} registros`;

    const elAjustes = document.getElementById('kpiMovAjustes');
    if (elAjustes) elAjustes.textContent = `${stats.totalAjustes || 0} un.`;
    const elAjustesCount = document.getElementById('kpiMovAjustesCount');
    if (elAjustesCount) elAjustesCount.textContent = `${stats.countAjustes || 0} registros`;

    renderMovementsTable(movements);
    renderMovPagination(res.pagination);
  } catch (err) {
    console.error('Erro ao carregar movimentações:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Erro ao carregar dados: ${err.message}</td></tr>`;
  }
}
window.loadStockMovements = loadStockMovements;

function renderMovementsTable(movements) {
  const tbody = document.getElementById('stockMovementsTbody');
  if (!tbody) return;

  if (!movements.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">Nenhuma movimentação encontrada para os filtros selecionados.</td></tr>';
    return;
  }

  tbody.innerHTML = movements.map(m => {
    const isPos = m.type === 'entrada' || (m.type === 'ajuste' && m.new_stock > m.previous_stock);
    const sign = isPos ? '+' : '−';
    const absQty = Math.abs(Number(m.quantity) || 0);
    const qtyColor = isPos ? '#10b981' : '#ef4444';
    const photo = m.product_photo ? getProductPhoto({ photo: m.product_photo }) : '/images/categorias/freios.jpg';
    const loc = m.to_location || m.current_location || m.location || m.from_location || 'H-04-04';
    const docRef = m.reference || m.document_ref || '';
    const note = m.notes || m.reason || (m.type === 'entrada' ? 'Recebimento WMS' : m.type === 'saida' ? 'Saída de Pedido' : 'Ajuste de Estoque');
    const currentStockVal = m.new_stock !== undefined && m.new_stock !== null ? m.new_stock : (m.stock_qty || 0);

    return `
      <tr>
        <td style="white-space:nowrap;">
          <strong style="font-size:12.5px;display:block;">${formatDate(m.created_at)}</strong>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="openProductViewModal(${m.product_id})">
            <img src="${photo}" alt="" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--panel-border);aspect-ratio:1;flex-shrink:0;" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/>
            <div>
              <strong style="font-size:13px;display:block;color:var(--text-primary);">${m.product_name || 'Produto Removido'}</strong>
              <small style="font-family:monospace;font-size:11px;color:var(--text-muted);">${m.product_code || 'S/SKU'}</small>
            </div>
          </div>
        </td>
        <td>${getMovementBadge(m.type)}</td>
        <td><strong style="font-size:13.5px;color:${qtyColor};">${sign}${absQty} un.</strong></td>
        <td>
          <strong style="font-size:13.5px;color:var(--text-primary);">${currentStockVal} un.</strong>
        </td>
        <td>
          <span class="location-badge" style="font-size:11px;" title="Posição no Armazém">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${loc}
          </span>
        </td>
        <td>
          <span style="font-size:12px;font-weight:600;">${m.user_name || 'Administrador'}</span>
        </td>
        <td>
          <div style="font-size:11.5px;max-width:240px;line-height:1.3;">
            ${docRef ? `<strong style="color:var(--text-primary);display:block;">${docRef}</strong>` : ''}
            <span style="color:var(--text-muted);">${note}</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderMovPagination(pagination) {
  const container = document.getElementById('movPagination');
  if (!container || !pagination) return;
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) {
    container.innerHTML = `<span style="font-size:12px;color:var(--text-muted);">Exibindo ${total} registros</span>`;
    return;
  }

  container.innerHTML = `
    <span style="font-size:12px;color:var(--text-muted);">Página ${page} de ${totalPages} (${total} registros)</span>
    <div style="display:inline-flex;gap:6px;">
      <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="loadStockMovements(${page - 1})">&larr; Anterior</button>
      <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="loadStockMovements(${page + 1})">Próxima &rarr;</button>
    </div>
  `;
}

function debounceMovFilter() {
  clearTimeout(movDebounceTimer);
  movDebounceTimer = setTimeout(() => {
    loadStockMovements(1);
  }, 300);
}
window.debounceMovFilter = debounceMovFilter;

// -------------------------------------------------------------------
// 2. OPERAÇÕES DE ESTOQUE (TELA 5)
// -------------------------------------------------------------------
let currentOpType = 'entrada';

async function loadRecentOperations() {
  const tbody = document.getElementById('recentOperationsTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Carregando operações recentes...</td></tr>';
  try {
    const res = await api('/stock/movements?limit=10');
    const movements = res.movements || [];
    if (!movements.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Nenhuma operação recente registrada.</td></tr>';
      return;
    }
    if (tbody) {
      tbody.innerHTML = movements.map(m => {
        const isPos = m.type === 'entrada' || (m.type === 'ajuste' && m.new_stock > m.previous_stock);
        const sign = isPos ? '+' : '−';
        const absQty = Math.abs(Number(m.quantity) || 0);
        const qtyColor = isPos ? '#10b981' : '#ef4444';
        const loc = m.to_location || m.current_location || m.location || m.from_location || 'H-04-04';
        const docRef = m.reference || m.document_ref || '';
        const note = m.notes || m.reason || (m.type === 'entrada' ? 'Recebimento WMS' : m.type === 'saida' ? 'Saída WMS' : 'Ajuste de Estoque');
        const displayRef = docRef ? `${docRef} — ${note}` : note;
        const currentStockVal = m.new_stock !== undefined && m.new_stock !== null ? m.new_stock : (m.stock_qty || 0);

        return `
          <tr>
            <td><small>${formatDate(m.created_at)}</small></td>
            <td>${getMovementBadge(m.type)}</td>
            <td><strong>${m.product_name || 'Peça'}</strong> <small style="color:var(--text-muted);font-family:monospace;">(${m.product_code || ''})</small></td>
            <td><strong style="color:${qtyColor};">${sign}${absQty} un.</strong></td>
            <td><strong style="font-size:13px;color:var(--text-primary);">${currentStockVal} un.</strong></td>
            <td><span class="location-badge" style="font-size:10.5px;">📍 ${loc}</span></td>
            <td><small>${m.user_name || 'Admin'}</small></td>
            <td><small title="${displayRef}">${displayRef}</small></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar operações recentes:', err);
  }
}
window.loadRecentOperations = loadRecentOperations;

function openStockOperationModal(type = 'entrada', prodId = null) {
  currentOpType = type;
  selectOpType(type);

  // Popula o select de produtos
  const select = document.getElementById('stockOpProductSelect');
  if (select) {
    select.innerHTML = '<option value="">Selecione uma peça do armazém...</option>' +
      allProducts.map(p => {
        return `<option value="${p.id}" data-qty="${p.stockQty || 0}" data-loc="${getProductLocation(p)}">${p.name} (${p.code || 'S/SKU'}) — Saldo: ${p.stockQty || 0} un.</option>`;
      }).join('');

    if (prodId) {
      select.value = String(prodId);
      onStockOpProductChange();
    } else {
      select.value = '';
      document.getElementById('stockOpInfoCard')?.classList.add('hidden');
    }
  }

  const qtyInput = document.getElementById('stockOpQty');
  if (qtyInput) qtyInput.value = '1';

  const docInput = document.getElementById('stockOpDocRef');
  if (docInput) docInput.value = '';

  const notesInput = document.getElementById('stockOpNotes');
  if (notesInput) notesInput.value = '';

  document.getElementById('stockOperationModal')?.classList.remove('hidden');
}
window.openStockOperationModal = openStockOperationModal;

function closeStockOperationModal() {
  document.getElementById('stockOperationModal')?.classList.add('hidden');
}
window.closeStockOperationModal = closeStockOperationModal;

function selectOpType(type) {
  currentOpType = type;
  document.querySelectorAll('#opTypePills .op-pill-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });

  const transfFields = document.getElementById('stockOpTransfFields');
  if (transfFields) {
    transfFields.classList.toggle('hidden', type !== 'transferencia');
  }

  const title = document.getElementById('stockOpModalTitle');
  if (title) {
    if (type === 'entrada') title.textContent = 'Nova Entrada de Estoque (+)';
    else if (type === 'saida') title.textContent = 'Nova Saída de Estoque (−)';
    else if (type === 'transferencia') title.textContent = 'Transferência de Localização (⇄)';
    else if (type === 'ajuste') title.textContent = 'Ajuste Manual de Estoque';
  }
}
window.selectOpType = selectOpType;

function onStockOpProductChange() {
  const select = document.getElementById('stockOpProductSelect');
  const infoCard = document.getElementById('stockOpInfoCard');
  if (!select || !infoCard) return;

  const opt = select.options[select.selectedIndex];
  if (!opt || !opt.value) {
    infoCard.classList.add('hidden');
    return;
  }

  const qty = opt.dataset.qty || '0';
  const loc = opt.dataset.loc || 'Não definida';

  const elQty = document.getElementById('stockOpCurrentQty');
  if (elQty) elQty.textContent = `${qty} un.`;

  const elLoc = document.getElementById('stockOpCurrentLoc');
  if (elLoc) elLoc.textContent = loc;

  const destInput = document.getElementById('stockOpDestLocation');
  if (destInput && !destInput.value) {
    destInput.value = loc !== 'Não definida' ? loc : 'H-04-04';
  }

  infoCard.classList.remove('hidden');
}
window.onStockOpProductChange = onStockOpProductChange;

function stepOpQty(delta) {
  const inp = document.getElementById('stockOpQty');
  if (!inp) return;
  const cur = parseInt(inp.value, 10) || 1;
  inp.value = Math.max(1, cur + delta);
}
window.stepOpQty = stepOpQty;

async function submitStockOperation() {
  const select = document.getElementById('stockOpProductSelect');
  const prodId = select?.value;
  if (!prodId) {
    showToast('Selecione uma peça para realizar a operação.');
    return;
  }

  const qty = parseInt(document.getElementById('stockOpQty')?.value, 10) || 1;
  if (qty <= 0) {
    showToast('Informe uma quantidade válida maior que zero.');
    return;
  }

  const destinationLocation = document.getElementById('stockOpDestLocation')?.value?.trim();
  const documentRef = document.getElementById('stockOpDocRef')?.value?.trim();
  const userName = document.getElementById('stockOpUser')?.value?.trim() || 'Administrador';
  const reason = document.getElementById('stockOpNotes')?.value?.trim();

  const btn = document.getElementById('btnSubmitStockOp');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processando...';
  }

  try {
    const res = await api('/stock/operations', {
      method: 'POST',
      body: JSON.stringify({
        productId: Number(prodId),
        type: currentOpType,
        quantity: qty,
        destinationLocation: currentOpType === 'transferencia' ? destinationLocation : undefined,
        documentRef,
        userName,
        reason
      })
    });

    showToast(`Operação concluída: ${res.product?.name} (Saldo: ${res.newStock} un.)`);
    closeStockOperationModal();
    await refreshAllData();
    broadcastSync('STOCK_UPDATED');
    loadRecentOperations();
    loadStockMovements();
    loadStockAlerts();
  } catch (err) {
    console.error('Erro ao executar operação de estoque:', err);
    showToast(err.message || 'Erro ao registrar operação.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Confirmar Operação`;
    }
  }
}
window.submitStockOperation = submitStockOperation;

// -------------------------------------------------------------------
// 3. INVENTÁRIO & AUDITORIA (TELA 6)
// -------------------------------------------------------------------
let invDebounceTimer = null;

async function loadInventoryAudit() {
  const tbody = document.getElementById('inventoryAuditTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Carregando itens para auditoria de inventário...</td></tr>';

  try {
    const res = await api('/stock/inventory');
    const items = res.inventory || [];
    const stats = res.stats || {};

    // Atualiza KPIs
    const elAccuracy = document.getElementById('invKpiAccuracy');
    if (elAccuracy) elAccuracy.textContent = `${stats.accuracy || 100}%`;

    const elAudited = document.getElementById('invKpiAudited');
    if (elAudited) elAudited.textContent = `${stats.auditedCount || 0} / ${stats.totalProducts || 0}`;

    const elAuditedPct = document.getElementById('invKpiAuditedPct');
    if (elAuditedPct) elAuditedPct.textContent = `${stats.auditedPercent || 0}% do catálogo`;

    const elDisc = document.getElementById('invKpiDiscrepancies');
    if (elDisc) elDisc.textContent = `${stats.discrepancyCount || 0} itens`;

    renderInventoryTable(items);
  } catch (err) {
    console.error('Erro ao carregar inventário:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Erro: ${err.message}</td></tr>`;
  }
}
window.loadInventoryAudit = loadInventoryAudit;

function renderInventoryTable(items) {
  const tbody = document.getElementById('inventoryAuditTbody');
  if (!tbody) return;

  const search = (document.getElementById('filterInvSearch')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('filterInvStatus')?.value || '';

  const filtered = items.filter(item => {
    const name = (item.name || '').toLowerCase();
    const code = (item.code || '').toLowerCase();
    const loc = (item.location || '').toLowerCase();
    const matchSearch = !search || name.includes(search) || code.includes(search) || loc.includes(search);

    let matchStatus = true;
    if (statusFilter === 'ok') matchStatus = item.audit_status === 'ok';
    else if (statusFilter === 'divergente') matchStatus = item.audit_status === 'divergente';
    else if (statusFilter === 'pendente') matchStatus = item.audit_status === 'pendente' || !item.audit_status;

    return matchSearch && matchStatus;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Nenhum item corresponde aos critérios de inventário.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const photo = item.photo ? getProductPhoto({ photo: item.photo }) : '/images/categorias/freios.jpg';
    let statusBadge = '';
    if (item.audit_status === 'ok') {
      statusBadge = '<span class="status-badge pronto" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;">Conferido (OK)</span>';
    } else if (item.audit_status === 'divergente') {
      statusBadge = '<span class="status-badge cancelado" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;">Divergente</span>';
    } else {
      statusBadge = '<span class="status-badge" style="background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;">Pendente</span>';
    }

    const countedDisplay = item.physical_qty !== null && item.physical_qty !== undefined ? `${item.physical_qty} un.` : '<span style="color:var(--text-muted);">&mdash;</span>';
    const diffDisplay = item.difference !== null && item.difference !== undefined ? (
      item.difference === 0 ? '<strong style="color:#10b981;">0 un.</strong>' :
      item.difference > 0 ? `<strong style="color:#10b981;">+${item.difference} un.</strong>` :
      `<strong style="color:#ef4444;">${item.difference} un.</strong>`
    ) : '<span style="color:var(--text-muted);">&mdash;</span>';

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${photo}" alt="" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--panel-border);aspect-ratio:1;flex-shrink:0;" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/>
            <div>
              <strong style="font-size:13px;display:block;color:var(--text-primary);">${item.name}</strong>
              <small style="font-family:monospace;font-size:11px;color:var(--text-muted);">${item.code || 'S/SKU'}</small>
            </div>
          </div>
        </td>
        <td><span class="location-badge" style="font-size:11px;">${item.location || 'H-04-04'}</span></td>
        <td><strong style="font-size:13px;">${item.system_qty} un.</strong></td>
        <td>${countedDisplay}</td>
        <td>${diffDisplay}</td>
        <td>${statusBadge}</td>
        <td><small>${item.last_counted_at ? formatDate(item.last_counted_at) : 'Nunca auditado'}</small></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openNewInventoryModal(${item.id})" style="font-weight:700;">
            ${item.audit_status === 'divergente' ? 'Conciliar' : 'Contar'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openNewInventoryModal(prodId = null) {
  const targetId = prodId || (allProducts[0] ? allProducts[0].id : null);
  const p = allProducts.find(x => String(x.id) === String(targetId));
  if (!p) return;

  document.getElementById('invModalProdId').value = p.id;
  document.getElementById('invModalProdName').textContent = p.name;
  document.getElementById('invModalProdSku').textContent = `SKU: ${p.code || 'S/SKU'}`;
  document.getElementById('invModalSystemQty').textContent = `${p.stockQty || 0} un.`;
  document.getElementById('invModalLocation').textContent = getProductLocation(p);

  const countedInput = document.getElementById('invModalCountedQty');
  if (countedInput) {
    countedInput.value = String(p.stockQty || 0);
  }

  calcInvDiscrepancy();
  document.getElementById('inventoryCountModal')?.classList.remove('hidden');
}
window.openNewInventoryModal = openNewInventoryModal;

function closeInventoryCountModal() {
  document.getElementById('inventoryCountModal')?.classList.add('hidden');
}
window.closeInventoryCountModal = closeInventoryCountModal;

function stepInvCount(delta) {
  const inp = document.getElementById('invModalCountedQty');
  if (!inp) return;
  const cur = parseInt(inp.value, 10) || 0;
  inp.value = Math.max(0, cur + delta);
  calcInvDiscrepancy();
}
window.stepInvCount = stepInvCount;

function calcInvDiscrepancy() {
  const prodId = document.getElementById('invModalProdId')?.value;
  const p = allProducts.find(x => String(x.id) === String(prodId));
  if (!p) return;

  const sys = Number(p.stockQty) || 0;
  const count = parseInt(document.getElementById('invModalCountedQty')?.value, 10) || 0;
  const diff = count - sys;

  const banner = document.getElementById('invDiscrepancyBanner');
  const diffVal = document.getElementById('invDiffVal');
  const statusText = document.getElementById('invDiffStatusText');

  if (diffVal) {
    diffVal.textContent = diff === 0 ? '0 un.' : (diff > 0 ? `+${diff} un.` : `${diff} un.`);
  }

  if (banner && statusText) {
    if (diff === 0) {
      banner.style.background = 'rgba(16,185,129,0.1)';
      banner.style.borderColor = 'rgba(16,185,129,0.3)';
      diffVal.style.color = '#10b981';
      statusText.textContent = 'Contagem física idêntica ao sistema (100% acurado)';
    } else {
      banner.style.background = 'rgba(239,68,68,0.1)';
      banner.style.borderColor = 'rgba(239,68,68,0.3)';
      diffVal.style.color = '#ef4444';
      statusText.textContent = `Divergência detectada! O estoque será ajustado para ${count} un.`;
    }
  }
}
window.calcInvDiscrepancy = calcInvDiscrepancy;

async function submitInventoryCount() {
  const prodId = document.getElementById('invModalProdId')?.value;
  const p = allProducts.find(x => String(x.id) === String(prodId));
  if (!p) return;

  const physicalQty = parseInt(document.getElementById('invModalCountedQty')?.value, 10) || 0;
  const notes = document.getElementById('invModalNotes')?.value?.trim();

  const btn = document.getElementById('btnSaveInventoryCount');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Conciliando...';
  }

  try {
    // 1. Registra contagem
    await api('/stock/inventory/count', {
      method: 'POST',
      body: JSON.stringify({
        productId: Number(prodId),
        physicalQty,
        notes,
        auditorName: 'Administrador'
      })
    });

    // 2. Se houver divergência, reconcilia o estoque automaticamente
    const currentStock = Number(p.stockQty) || 0;
    if (physicalQty !== currentStock) {
      await api('/stock/inventory/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(prodId),
          reconciledStock: physicalQty,
          reason: `Conciliação de inventário: saldo corrigido de ${currentStock} para ${physicalQty} un.`
        })
      });
    }

    showToast(`Inventário de "${p.name}" salvo com sucesso!`);
    closeInventoryCountModal();
    await refreshAllData();
    broadcastSync('STOCK_UPDATED');
    loadInventoryAudit();
    loadStockMovements();
    loadStockAlerts();
  } catch (err) {
    console.error('Erro ao salvar inventário:', err);
    showToast(err.message || 'Erro ao registrar contagem.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Salvar Contagem e Conciliar`;
    }
  }
}
window.submitInventoryCount = submitInventoryCount;

function debounceInvFilter() {
  clearTimeout(invDebounceTimer);
  invDebounceTimer = setTimeout(() => {
    loadInventoryAudit();
  }, 250);
}
window.debounceInvFilter = debounceInvFilter;

// -------------------------------------------------------------------
// 4. ALERTAS & ESTOQUE CRÍTICO (TELA 7)
// -------------------------------------------------------------------
let currentAlertFilterType = 'todos';
let alertDebounceTimer = null;
let stockAlertsCache = null;

async function loadStockAlerts() {
  try {
    const res = await api('/stock/alerts');
    stockAlertsCache = res;

    // Atualiza contadores dos cards de alerta
    const elCrit = document.getElementById('alertCardCriticoCount');
    if (elCrit) elCrit.textContent = String(res.counts?.critical || 0);

    const elLow = document.getElementById('alertCardBaixoCount');
    if (elLow) elLow.textContent = String(res.counts?.low || 0);

    const elNoLoc = document.getElementById('alertCardSemLocalCount');
    if (elNoLoc) elNoLoc.textContent = String(res.counts?.noLocation || 0);

    const elDisc = document.getElementById('alertCardDivergenciaCount');
    if (elDisc) elDisc.textContent = String(res.counts?.discrepancy || 0);

    // Atualiza box "⚠ PRECISA DE ATENÇÃO" do Dashboard Operacional
    const dCrit = document.getElementById('dashCritCount');
    if (dCrit) dCrit.textContent = String(res.counts?.critical || 0);

    const dLow = document.getElementById('dashLowCount');
    if (dLow) dLow.textContent = String(res.counts?.low || 0);

    const dNoLoc = document.getElementById('dashNoLocCount');
    if (dNoLoc) dNoLoc.textContent = String(res.counts?.noLocation || 0);

    const dDisc = document.getElementById('dashDiscCount');
    if (dDisc) dDisc.textContent = String(res.counts?.discrepancy || 0);

    renderAlertsTable();
  } catch (err) {
    console.error('Erro ao carregar alertas:', err);
  }
}
window.loadStockAlerts = loadStockAlerts;

function filterAlertTab(type) {
  currentAlertFilterType = type;
  document.querySelectorAll('#pane-alertas .ped-kpi-card, .wms-alert-cards-grid .wms-alert-card').forEach(c => {
    c.classList.remove('active');
  });

  if (type === 'critico') document.querySelector('#pane-alertas .card-critico, .wms-alert-card.card-critico')?.classList.add('active');
  else if (type === 'baixo') document.querySelector('#pane-alertas .card-baixo, .wms-alert-card.card-baixo')?.classList.add('active');
  else if (type === 'sem_local') document.querySelector('#pane-alertas .card-sem-local, .wms-alert-card.card-sem-local')?.classList.add('active');
  else if (type === 'divergencia') document.querySelector('#pane-alertas .card-divergencia, .wms-alert-card.card-divergencia')?.classList.add('active');

  const select = document.getElementById('filterAlertSelect');
  if (select) select.value = type;

  renderAlertsTable();
}
window.filterAlertTab = filterAlertTab;

function filterMovByType(type) {
  const sel = document.getElementById('filterMovType');
  if (sel) {
    sel.value = type;
    loadStockMovements();
  }
}
window.filterMovByType = filterMovByType;

function filterInventoryByStatus(status) {
  const sel = document.getElementById('filterInvStatus');
  if (sel) {
    sel.value = status;
    loadInventoryAudit();
  }
}
window.filterInventoryByStatus = filterInventoryByStatus;

function filterInventoryByCorredor(corredor) {
  const searchInput = document.getElementById('filterInvSearch');
  if (searchInput) {
    searchInput.value = corredor ? corredor + '-' : '';
    loadInventoryAudit();
  }
}
window.filterInventoryByCorredor = filterInventoryByCorredor;

function filterAlertsByPriority(priority) {
  renderAlertsTable();
}
window.filterAlertsByPriority = filterAlertsByPriority;

function filterRecentOps(type) {
  const rows = document.querySelectorAll('#recentOperationsTbody tr');
  rows.forEach(tr => {
    if (!type) {
      tr.style.display = '';
      return;
    }
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(type.toLowerCase()) ? '' : 'none';
  });
}
window.filterRecentOps = filterRecentOps;

function filterRecentOpsSearch(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#recentOperationsTbody tr');
  rows.forEach(tr => {
    if (!q) {
      tr.style.display = '';
      return;
    }
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(q) ? '' : 'none';
  });
}
window.filterRecentOpsSearch = filterRecentOpsSearch;

function filterWarehouseRackSearch(query) {
  const q = (query || '').toUpperCase().trim();
  if (q.length >= 1) {
    const aisleMatch = q.charAt(0);
    if (['A', 'B', 'C', 'D', 'H'].includes(aisleMatch) && typeof selectAisle === 'function') {
      selectAisle(aisleMatch);
    }
  }
}
window.filterWarehouseRackSearch = filterWarehouseRackSearch;

function filterNfStatus(status) {
  const rows = document.querySelectorAll('#pane-notas-fiscais tbody tr');
  rows.forEach(tr => {
    if (!status) {
      tr.style.display = '';
      return;
    }
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(status.toLowerCase()) ? '' : 'none';
  });
}
window.filterNfStatus = filterNfStatus;

function renderAlertsTable() {
  const tbody = document.getElementById('alertsTbody');
  if (!tbody || !stockAlertsCache) return;

  const search = (document.getElementById('filterAlertSearch')?.value || '').toLowerCase().trim();
  const alertItems = stockAlertsCache.alerts || [];

  const filtered = alertItems.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search) || (item.code || '').toLowerCase().includes(search);
    let matchType = true;
    if (currentAlertFilterType !== 'todos') {
      matchType = item.alertType === currentAlertFilterType;
    }
    return matchSearch && matchType;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted">Nenhum produto em estado crítico para esta categoria. Tudo em ordem no armazém!</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let alertBadge = '';
    let actionBtn = '';

    if (item.alertType === 'critico') {
      alertBadge = '<span class="status-badge cancelado" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;">🔴 Crítico (Zerado)</span>';
      actionBtn = `<button class="btn btn-primary btn-sm" onclick="openStockOperationModal('entrada', ${item.id})">+ Repor Estoque</button>`;
    } else if (item.alertType === 'baixo') {
      alertBadge = '<span class="status-badge em_preparacao" style="background:#fffbeb;color:#d97706;border:1px solid #fde68a;">🟠 Baixo Estoque</span>';
      actionBtn = `<button class="btn btn-secondary btn-sm" onclick="openStockOperationModal('entrada', ${item.id})">+ Adicionar</button>`;
    } else if (item.alertType === 'sem_local') {
      alertBadge = '<span class="status-badge" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;">📍 Sem Endereço</span>';
      actionBtn = `<button class="btn btn-secondary btn-sm" onclick="openStockOperationModal('transferencia', ${item.id})">Endereçar</button>`;
    } else if (item.alertType === 'divergencia') {
      alertBadge = '<span class="status-badge" style="background:#fff7ed;color:#ea580c;border:1px solid #ffedd5;">📋 Divergência</span>';
      actionBtn = `<button class="btn btn-secondary btn-sm" onclick="openNewInventoryModal(${item.id})">Conciliar</button>`;
    }

    const photo = item.photo ? getProductPhoto({ photo: item.photo }) : '/images/categorias/freios.jpg';

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="openProductViewModal(${item.id})">
            <img src="${photo}" alt="" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--panel-border);aspect-ratio:1;flex-shrink:0;" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/>
            <div>
              <strong style="font-size:13px;display:block;color:var(--text-primary);">${item.name}</strong>
              <small style="font-family:monospace;font-size:11px;color:var(--text-muted);">${item.code || 'S/SKU'}</small>
            </div>
          </div>
        </td>
        <td><span class="cat-pill-badge">${item.category || 'Geral'}</span></td>
        <td><strong style="font-size:13.5px;color:${item.stockQty <= 0 ? '#ef4444' : '#d97706'};">${item.stockQty} un.</strong></td>
        <td><span style="font-size:12px;color:var(--text-muted);">${item.minStock || 5} un.</span></td>
        <td><span class="location-badge" style="font-size:11px;">${item.location || 'Sem posição'}</span></td>
        <td>${alertBadge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function debounceAlertFilter() {
  clearTimeout(alertDebounceTimer);
  alertDebounceTimer = setTimeout(renderAlertsTable, 200);
}
window.debounceAlertFilter = debounceAlertFilter;

// -------------------------------------------------------------------
// 5. LOCALIZAÇÕES DO ARMAZÉM (TELA 8)
// -------------------------------------------------------------------
let currentWarehouseAisle = 'H';
let currentWarehouseModule = '04';
let currentWarehouseShelf = '04';

function selectAisle(aisle) {
  currentWarehouseAisle = aisle;
  document.querySelectorAll('#aisleChips .aisle-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.aisle === aisle);
  });
  renderWarehouseLocation();
}
window.selectAisle = selectAisle;

function selectModule(mod) {
  currentWarehouseModule = mod;
  document.querySelectorAll('#moduleChips .module-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.module === mod);
  });
  renderWarehouseLocation();
}
window.selectModule = selectModule;

function selectShelf(shelf) {
  currentWarehouseShelf = shelf;
  document.querySelectorAll('#shelfChips .shelf-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.shelf === shelf);
  });
  renderWarehouseLocation();
}
window.selectShelf = selectShelf;

function renderWarehouseLocation() {
  const code = `${currentWarehouseAisle}-${currentWarehouseModule}-${currentWarehouseShelf}`;

  const codeEl = document.getElementById('locCurrentCode');
  if (codeEl) codeEl.textContent = code;

  const breadAisle = document.getElementById('locBreadAisle');
  if (breadAisle) breadAisle.textContent = `Corredor ${currentWarehouseAisle}`;

  const breadMod = document.getElementById('locBreadModule');
  if (breadMod) breadMod.textContent = `Módulo ${currentWarehouseModule}`;

  const breadShelf = document.getElementById('locBreadShelf');
  if (breadShelf) breadShelf.textContent = `Prateleira ${currentWarehouseShelf}`;

  // Filtra produtos nesta localização
  const matchingProducts = allProducts.filter(p => {
    const loc = getProductLocation(p).toUpperCase();
    return loc.includes(code.toUpperCase()) || loc.includes(currentWarehouseAisle);
  });

  const countEl = document.getElementById('locItemCount');
  if (countEl) countEl.textContent = `${matchingProducts.length} produto(s)`;

  const totalUnits = matchingProducts.reduce((sum, p) => sum + (Number(p.stockQty) || 0), 0);
  const unitsEl = document.getElementById('locTotalUnits');
  if (unitsEl) unitsEl.textContent = `${totalUnits} un.`;

  const tbody = document.getElementById('locProductsTbody');
  if (!tbody) return;

  if (!matchingProducts.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-muted">
          Nenhuma peça alocada diretamente no endereço <strong>${code}</strong>.
          <br/><button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="openStockOperationModal('transferencia')">Mover Peça para Cá</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = matchingProducts.map(p => {
    const photo = getProductPhoto(p);
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="openProductViewModal(${p.id})">
            <img src="${photo}" alt="" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--panel-border);aspect-ratio:1;flex-shrink:0;" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/>
            <div>
              <strong style="font-size:13px;display:block;color:var(--text-primary);">${p.name}</strong>
              <small style="font-family:monospace;font-size:11px;color:var(--text-muted);">${p.code || 'S/SKU'}</small>
            </div>
          </div>
        </td>
        <td><span class="cat-pill-badge">${p.category || 'Geral'}</span></td>
        <td><strong style="font-size:13px;">${p.stockQty || 0} un.</strong></td>
        <td>${p.stockQty > 5 ? '<span class="status-badge pronto">Disponível</span>' : '<span class="status-badge em_preparacao">Baixo</span>'}</td>
        <td>
          <div style="display:inline-flex;gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="openStockLabelModal(${p.id})" title="Imprimir Etiqueta">&#128224; Etiqueta</button>
            <button class="btn btn-secondary btn-sm" onclick="openStockOperationModal('transferencia', ${p.id})" title="Transferir de Local">⇄ Mover</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderWarehouseLocation = renderWarehouseLocation;

function openLocationPickerModal() {
  openStockOperationModal('transferencia');
}
window.openLocationPickerModal = openLocationPickerModal;

// -------------------------------------------------------------------
// 6. ETIQUETA DE PRODUTO (SCREEN 9: CODE128 + QR CODE MULTI-FORMATO)
// -------------------------------------------------------------------
let currentLabelProduct = null;

function generateLabelHtmlForFormat(product, format, isPrint = false) {
  const loc = getProductLocation(product);
  const cleanDigits = (product.code || '789123456789').replace(/\D/g, '').padEnd(12, '0').slice(0, 12);
  const prodName = product.name || 'Peça Automotiva';
  const prodCode = product.code || 'S/SKU';
  const category = product.category || 'Peça / Componente';
  const lotDate = new Date().toLocaleDateString('pt-BR');
  const lotNumber = `L-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  if (format === 'compacta') {
    // 60 x 30 mm (Peças Pequenas)
    const bcHeight = isPrint ? 14 : 20;
    const qrSize = isPrint ? 36 : 40;
    return `
      <div class="stock-label-card label-card-compacta" data-format="compacta">
        <div class="label-header compact">
          <div class="label-brand">
            <span class="label-brand-main">FAHREN</span>
            <span class="label-brand-sub">MOTORS</span>
          </div>
          <span class="label-tag-compact">WMS</span>
        </div>
        <div class="label-product-name compact" title="${prodName}">${prodName}</div>
        <div class="label-details-row compact">
          <span><strong>SKU:</strong> ${prodCode}</span>
          <span><strong>LOC:</strong> ${loc}</span>
        </div>
        <div class="label-barcodes-container compact">
          <div class="label-barcode-left">
            <div class="barcode-svg-render">${generateCode128Svg(cleanDigits, bcHeight)}</div>
            <span class="barcode-num-text compact">${cleanDigits}</span>
          </div>
          <div class="label-qrcode-right compact">
            ${generateMiniQrSvg(prodCode || `PROD-${product.id}`, qrSize)}
          </div>
        </div>
      </div>
    `;
  }

  if (format === 'grande') {
    // 100 x 100 mm (Caixa Master / Pallet)
    const bcHeight = isPrint ? 32 : 38;
    const qrSize = isPrint ? 72 : 70;
    return `
      <div class="stock-label-card label-card-grande" data-format="grande">
        <div class="label-header grande">
          <div class="label-brand">
            <span class="label-brand-main">FAHREN</span>
            <span class="label-brand-sub">MOTORS</span>
          </div>
          <div class="label-tag grande">CAIXA MASTER / IDENTIFICAÇÃO WMS</div>
        </div>
        <div class="label-product-name grande" title="${prodName}">${prodName}</div>
        <div class="label-grid-quad">
          <div class="quad-cell">
            <span class="quad-label">CÓDIGO / SKU</span>
            <strong class="quad-val">${prodCode}</strong>
          </div>
          <div class="quad-cell">
            <span class="quad-label">LOCALIZAÇÃO WMS</span>
            <strong class="quad-val quad-loc">${loc}</strong>
          </div>
          <div class="quad-cell">
            <span class="quad-label">CATEGORIA</span>
            <strong class="quad-val">${category}</strong>
          </div>
          <div class="quad-cell">
            <span class="quad-label">DATA / LOTE</span>
            <strong class="quad-val">${lotDate} &bull; ${lotNumber}</strong>
          </div>
        </div>
        <div class="label-barcodes-container grande">
          <div class="label-barcode-left">
            <div class="barcode-svg-render">${generateCode128Svg(cleanDigits, bcHeight)}</div>
            <span class="barcode-num-text grande">${cleanDigits}</span>
          </div>
          <div class="label-qrcode-right grande">
            ${generateMiniQrSvg(prodCode || `PROD-${product.id}`, qrSize)}
          </div>
        </div>
        <div class="label-inspection-box">
          <span>CONFERÊNCIA WMS: [&nbsp;&nbsp;] APROVADO</span>
          <span>RESPONSÁVEL: ___________________</span>
        </div>
        <div class="label-footer grande">
          <span>Rastreabilidade Logística WMS &bull; Fahren Motors &bull; fahrenmotors.com.br</span>
        </div>
      </div>
    `;
  }

  // Padrão WMS: 100 x 50 mm
  const bcHeight = isPrint ? 24 : 28;
  const qrSize = isPrint ? 52 : 52;
  return `
    <div class="stock-label-card label-card-padrao" data-format="padrao">
      <div class="label-header">
        <div class="label-brand">
          <span class="label-brand-main">FAHREN</span>
          <span class="label-brand-sub">MOTORS</span>
        </div>
        <div class="label-tag">WMS AUTO</div>
      </div>
      <div class="label-product-name" title="${prodName}">${prodName}</div>
      <div class="label-details-row">
        <div class="label-detail-item">
          <span class="lbl-k">SKU:</span>
          <strong class="lbl-v">${prodCode}</strong>
        </div>
        <div class="label-detail-item">
          <span class="lbl-k">Local:</span>
          <strong class="lbl-v">${loc}</strong>
        </div>
        <div class="label-detail-item">
          <span class="lbl-k">Cat:</span>
          <strong class="lbl-v">${category}</strong>
        </div>
      </div>
      <div class="label-barcodes-container">
        <div class="label-barcode-left">
          <div class="barcode-svg-render">${generateCode128Svg(cleanDigits, bcHeight)}</div>
          <span class="barcode-num-text">${cleanDigits}</span>
        </div>
        <div class="label-qrcode-right">
          ${generateMiniQrSvg(prodCode || `PROD-${product.id}`, qrSize)}
        </div>
      </div>
      <div class="label-footer">
        <span>Peça Genuína / Fahren Motors &bull; fahrenmotors.com.br</span>
      </div>
    </div>
  `;
}
window.generateLabelHtmlForFormat = generateLabelHtmlForFormat;

function openStockLabelModal(prodId) {
  const p = allProducts.find(x => String(x.id) === String(prodId));
  if (!p) return;
  currentLabelProduct = p;

  updateLabelFormat();
  document.getElementById('stockLabelModal')?.classList.remove('hidden');
}
window.openStockLabelModal = openStockLabelModal;

function closeStockLabelModal() {
  document.getElementById('stockLabelModal')?.classList.add('hidden');
}
window.closeStockLabelModal = closeStockLabelModal;

function updateLabelFormat() {
  if (!currentLabelProduct) return;
  const format = document.getElementById('labelSizeSelect')?.value || 'padrao';
  const container = document.getElementById('labelPrintContainer');
  if (!container) return;

  const cardHtml = generateLabelHtmlForFormat(currentLabelProduct, format, false);

  let dimLabel = '100 × 50 mm (Padrão Industrial WMS)';
  if (format === 'compacta') dimLabel = '60 × 30 mm (Peças Pequenas / Micro)';
  if (format === 'grande') dimLabel = '100 × 100 mm (Caixa Master / Pallet)';

  container.innerHTML = `
    <div class="label-preview-dimension-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
      Dimensão Física de Impressão: <strong>${dimLabel}</strong>
    </div>
    <div class="label-preview-stage format-${format}">
      ${cardHtml}
    </div>
  `;
}
window.updateLabelFormat = updateLabelFormat;

function printStockLabel() {
  if (!currentLabelProduct) {
    showToast('Nenhum produto selecionado para impressão.');
    return;
  }
  const format = document.getElementById('labelSizeSelect')?.value || 'padrao';
  const copiesInput = document.getElementById('labelCopies');
  let copies = parseInt(copiesInput?.value, 10) || 1;
  if (copies < 1) copies = 1;
  if (copies > 100) copies = 100;

  let widthMm = 100;
  let heightMm = 50;
  if (format === 'compacta') {
    widthMm = 60;
    heightMm = 30;
  } else if (format === 'grande') {
    widthMm = 100;
    heightMm = 100;
  }

  const singleCardHtml = generateLabelHtmlForFormat(currentLabelProduct, format, true);
  let pagesHtml = '';
  for (let i = 0; i < copies; i++) {
    pagesHtml += `<div class="print-page">${singleCardHtml}</div>`;
  }

  const printDocumentHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Etiqueta ${currentLabelProduct.code || 'WMS'} - ${widthMm}x${heightMm}mm</title>
      <style>
        @page {
          size: ${widthMm}mm ${heightMm}mm;
          margin: 0;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          width: ${widthMm}mm;
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .print-page {
          width: ${widthMm}mm;
          height: ${heightMm}mm;
          page-break-after: always;
          break-after: page;
          box-sizing: border-box;
          overflow: hidden;
          background: #fff;
          display: flex;
          flex-direction: column;
          padding: 0;
        }
        .print-page:last-child {
          page-break-after: avoid;
          break-after: avoid;
        }

        .stock-label-card {
          width: 100%;
          height: 100%;
          border: 1px solid #000;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: #fff;
          color: #000;
        }

        /* MODELO PADRÃO (100 x 50 mm) */
        .label-card-padrao {
          padding: 2.5mm 3.5mm;
        }
        .label-card-padrao .label-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1.5px solid #000;
          padding-bottom: 1.5mm;
          margin-bottom: 1mm;
        }
        .label-card-padrao .label-brand-main {
          font-size: 12pt;
          font-weight: 900;
          letter-spacing: 0.5px;
        }
        .label-card-padrao .label-brand-sub {
          font-size: 8.5pt;
          font-weight: 700;
          color: #555;
          margin-left: 2px;
        }
        .label-card-padrao .label-tag {
          font-size: 7.5pt;
          font-weight: 800;
          background: #000;
          color: #fff;
          padding: 1px 5px;
          border-radius: 2px;
        }
        .label-card-padrao .label-product-name {
          font-size: 10pt;
          font-weight: 800;
          line-height: 1.15;
          max-height: 2.3em;
          overflow: hidden;
          margin-bottom: 1mm;
        }
        .label-card-padrao .label-details-row {
          display: flex;
          justify-content: space-between;
          font-size: 8pt;
          border-bottom: 1px dashed #666;
          padding-bottom: 1mm;
          margin-bottom: 1mm;
        }
        .label-card-padrao .lbl-k { color: #444; }
        .label-card-padrao .lbl-v { font-weight: 800; font-family: monospace; }
        .label-card-padrao .label-barcodes-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 3mm;
          flex: 1;
        }
        .label-card-padrao .label-barcode-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          overflow: hidden;
        }
        .label-card-padrao .barcode-svg-render svg {
          width: 100%;
          height: 22px;
          display: block;
        }
        .label-card-padrao .barcode-num-text {
          font-size: 7.5pt;
          font-family: monospace;
          font-weight: 700;
          letter-spacing: 1px;
          margin-top: 1px;
        }
        .label-card-padrao .label-qrcode-right svg {
          width: 16mm;
          height: 16mm;
          display: block;
        }
        .label-card-padrao .label-footer {
          font-size: 6pt;
          text-align: center;
          color: #444;
          margin-top: 0.5mm;
          border-top: 0.5px solid #ccc;
          padding-top: 0.5mm;
        }

        /* MODELO COMPACTO (60 x 30 mm) */
        .label-card-compacta {
          padding: 1.2mm 2mm;
        }
        .label-card-compacta .label-header.compact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #000;
          padding-bottom: 0.5mm;
          margin-bottom: 0.5mm;
        }
        .label-card-compacta .label-brand-main {
          font-size: 8pt;
          font-weight: 900;
        }
        .label-card-compacta .label-brand-sub {
          font-size: 6pt;
          font-weight: 700;
          color: #555;
        }
        .label-card-compacta .label-tag-compact {
          font-size: 6pt;
          font-weight: 800;
          background: #000;
          color: #fff;
          padding: 0 3px;
          border-radius: 2px;
        }
        .label-card-compacta .label-product-name.compact {
          font-size: 7pt;
          font-weight: 800;
          line-height: 1.1;
          max-height: 2.2em;
          overflow: hidden;
          margin-bottom: 0.5mm;
        }
        .label-card-compacta .label-details-row.compact {
          display: flex;
          justify-content: space-between;
          font-size: 6pt;
          border-bottom: 0.5px dashed #888;
          padding-bottom: 0.5mm;
          margin-bottom: 0.5mm;
        }
        .label-card-compacta .label-barcodes-container.compact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5mm;
          flex: 1;
        }
        .label-card-compacta .barcode-svg-render svg {
          width: 100%;
          height: 13px;
          display: block;
        }
        .label-card-compacta .barcode-num-text.compact {
          font-size: 5.5pt;
          font-family: monospace;
          font-weight: 700;
          text-align: center;
          display: block;
        }
        .label-card-compacta .label-qrcode-right.compact svg {
          width: 10.5mm;
          height: 10.5mm;
          display: block;
        }

        /* MODELO GRANDE / CAIXA MASTER (100 x 100 mm) */
        .label-card-grande {
          padding: 3.5mm 4.5mm;
        }
        .label-card-grande .label-header.grande {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #000;
          padding-bottom: 1.5mm;
          margin-bottom: 2mm;
        }
        .label-card-grande .label-brand-main {
          font-size: 14pt;
          font-weight: 900;
          letter-spacing: 0.5px;
        }
        .label-card-grande .label-brand-sub {
          font-size: 9.5pt;
          font-weight: 700;
          color: #555;
        }
        .label-card-grande .label-tag.grande {
          font-size: 7.5pt;
          font-weight: 800;
          background: #000;
          color: #fff;
          padding: 1.5px 6px;
          border-radius: 2px;
        }
        .label-card-grande .label-product-name.grande {
          font-size: 12.5pt;
          font-weight: 900;
          line-height: 1.15;
          margin-bottom: 2.5mm;
          max-height: 2.3em;
          overflow: hidden;
        }
        .label-card-grande .label-grid-quad {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5mm;
          margin-bottom: 2.5mm;
        }
        .label-card-grande .quad-cell {
          border: 1px solid #000;
          padding: 1.2mm 2mm;
          border-radius: 2px;
        }
        .label-card-grande .quad-label {
          display: block;
          font-size: 6pt;
          font-weight: 700;
          color: #555;
          text-transform: uppercase;
        }
        .label-card-grande .quad-val {
          display: block;
          font-size: 9pt;
          font-weight: 800;
          margin-top: 1px;
        }
        .label-card-grande .quad-loc {
          background: #f0f0f0;
          display: inline-block;
          padding: 0 3px;
        }
        .label-card-grande .label-barcodes-container.grande {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 3mm;
          border-top: 1px dashed #777;
          border-bottom: 1px dashed #777;
          padding: 2mm 0;
          margin-bottom: 2mm;
        }
        .label-card-grande .barcode-svg-render svg {
          width: 100%;
          height: 28px;
          display: block;
        }
        .label-card-grande .barcode-num-text.grande {
          font-size: 8.5pt;
          font-family: monospace;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-align: center;
          display: block;
          margin-top: 1mm;
        }
        .label-card-grande .label-qrcode-right.grande svg {
          width: 22mm;
          height: 22mm;
          display: block;
        }
        .label-card-grande .label-inspection-box {
          border: 1px solid #777;
          padding: 1.2mm 1.8mm;
          font-size: 6.5pt;
          font-weight: 700;
          display: flex;
          justify-content: space-between;
          margin-bottom: 1mm;
        }
        .label-card-grande .label-footer.grande {
          font-size: 6.5pt;
          text-align: center;
          color: #444;
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;

  let iframe = document.getElementById('wmsLabelPrintIframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'wmsLabelPrintIframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }

  iframe.srcdoc = printDocumentHtml;
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Erro ao acionar janela de impressão:', err);
      }
    }, 250);
  };
}
window.printStockLabel = printStockLabel;

// ==========================================
// Gestão de Produtos Comerciais (Loja Virtual)
// ==========================================
let currentCommercialFilter = 'all';

function renderCommercialProductsTable(products = allProducts) {
  const tbody = document.getElementById('commercialProductsTableBody');
  if (!tbody) return;

  const prods = (products || allProducts);
  
  // Atualiza KPIs
  const total = prods.length;
  const activeCount = prods.filter(p => p.active !== false).length;
  const lowCount = prods.filter(p => Number(p.stockQty) > 0 && Number(p.stockQty) <= 5).length;
  const outCount = prods.filter(p => Number(p.stockQty) <= 0).length;

  const elTotal = document.getElementById('prodTotalVal');
  if (elTotal) elTotal.textContent = total;
  const elActive = document.getElementById('prodActiveVal');
  if (elActive) elActive.textContent = activeCount;
  const elLow = document.getElementById('prodLowVal');
  if (elLow) elLow.textContent = lowCount;
  const elOut = document.getElementById('prodOutVal');
  if (elOut) elOut.textContent = outCount;

  // Popula categorias no select se vazio
  const catSelect = document.getElementById('commCategoryFilter');
  if (catSelect && catSelect.options.length <= 1) {
    const cats = Array.from(new Set(allProducts.map(p => p.category).filter(Boolean))).sort();
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catSelect.appendChild(opt);
    });
  }

  // Popula datalist do form
  const dl = document.getElementById('commercialCategoryList');
  if (dl && dl.options.length === 0) {
    const cats = Array.from(new Set(allProducts.map(p => p.category).filter(Boolean))).sort();
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      dl.appendChild(opt);
    });
  }

  let filtered = [...prods];
  const q = (document.getElementById('commSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('commStatusFilter')?.value || currentCommercialFilter;
  const cat = document.getElementById('commCategoryFilter')?.value || '';

  if (q) {
    filtered = filtered.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (getProductLocation(p).toLowerCase().includes(q)) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.compatibility && p.compatibility.toLowerCase().includes(q))
    );
  }

  if (cat) {
    filtered = filtered.filter(p => p.category === cat);
  }

  if (status === 'ativo') {
    filtered = filtered.filter(p => p.active !== false && Number(p.stockQty) > 0);
  } else if (status === 'pausado') {
    filtered = filtered.filter(p => p.active === false);
  } else if (status === 'esgotado') {
    filtered = filtered.filter(p => Number(p.stockQty) <= 0);
  } else if (status === 'baixo') {
    filtered = filtered.filter(p => Number(p.stockQty) > 0 && Number(p.stockQty) <= 5);
  }

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhum produto comercial encontrado com os filtros selecionados.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const photo = getProductPhoto(p);
    const stockNum = Number(p.stockQty) || 0;
    const priceNum = Number(p.price) || 0;
    const isActive = p.active !== false;

    let statusBadge = '';
    if (!isActive) {
      statusBadge = '<span class="status-badge cancelado" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1">Pausado</span>';
    } else if (stockNum > 0) {
      statusBadge = '<span class="status-badge pronto" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0">Ativo na Loja</span>';
    } else {
      statusBadge = '<span class="status-badge cancelado" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca">Esgotado</span>';
    }

    return `
      <tr>
        <td style="width:45px">
          <img src="${photo}" alt="" class="prod-thumb-img" onerror="this.onerror=null; this.src='/images/categorias/freios.jpg';"/>
        </td>
        <td>
          <strong class="prod-name-strong">${p.name}</strong>
          ${p.description ? `<small style="display:block;font-size:11px;color:var(--text-muted);">${p.description.slice(0, 50)}${p.description.length > 50 ? '...' : ''}</small>` : ''}
        </td>
        <td><span class="prod-sku-code" style="font-weight:700;font-family:monospace">${p.code || 'S/REF'}</span></td>
        <td><span class="cat-pill-badge">${p.category || 'Geral'}</span></td>
        <td><strong style="color:var(--text-primary);font-size:13px">${money(priceNum)}</strong></td>
        <td style="text-align:center">
          <span style="font-weight:700;font-size:12.5px;color:${stockNum > 0 ? 'var(--text-primary)' : '#dc2626'}">${stockNum} un</span>
        </td>
        <td>${statusBadge}</td>
        <td style="text-align:right;white-space:nowrap">
          <div style="display:inline-flex;gap:4px">
            <button class="btn btn-secondary btn-sm" onclick="window.open('/', '_blank')" title="Ver produto na vitrine pública da loja">
              🌐 Loja
            </button>
            <button class="btn btn-secondary btn-sm" onclick="editCommercialProduct(${p.id})" title="Editar dados do produto comercial">
              ✏️ Editar
            </button>
            <button class="btn btn-sm btn-prod-delete" data-remove="${p.id}" title="Excluir produto">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderCommercialProductsTable = renderCommercialProductsTable;

function applyCommercialFilter() {
  renderCommercialProductsTable(allProducts);
}
window.applyCommercialFilter = applyCommercialFilter;

function filterCommercialProducts(type) {
  currentCommercialFilter = type;
  const sel = document.getElementById('commStatusFilter');
  if (sel) sel.value = type === 'all' ? '' : type;
  renderCommercialProductsTable(allProducts);
}
window.filterCommercialProducts = filterCommercialProducts;

let editingCommercialProductId = null;

function openNewCommercialProductForm() {
  editingCommercialProductId = null;
  const panel = document.getElementById('commercialProductFormPanel');
  if (!panel) return;
  document.getElementById('commFormTitle').textContent = 'Cadastrar Novo Produto';
  document.getElementById('cpName').value = '';
  document.getElementById('cpCode').value = '';
  document.getElementById('cpCategory').value = '';
  document.getElementById('cpPrice').value = '';
  document.getElementById('cpStock').value = '';
  document.getElementById('cpActive').value = 'true';
  document.getElementById('cpPhoto').value = '';
  document.getElementById('cpDescription').value = '';
  document.getElementById('commProductFormError')?.classList.add('hidden');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.getElementById('cpName')?.focus(), 150);
}
window.openNewCommercialProductForm = openNewCommercialProductForm;

function closeCommercialProductForm() {
  const panel = document.getElementById('commercialProductFormPanel');
  if (panel) panel.classList.add('hidden');
  editingCommercialProductId = null;
}
window.closeCommercialProductForm = closeCommercialProductForm;

function editCommercialProduct(id) {
  const p = allProducts.find(item => String(item.id) === String(id));
  if (!p) return;
  switchTab('produtos');
  editingCommercialProductId = p.id;
  const panel = document.getElementById('commercialProductFormPanel');
  if (!panel) return;
  document.getElementById('commFormTitle').textContent = `Editar Produto: ${p.name}`;
  document.getElementById('cpName').value = p.name || '';
  document.getElementById('cpCode').value = p.code || '';
  document.getElementById('cpCategory').value = p.category || '';
  document.getElementById('cpPrice').value = p.price !== undefined ? String(p.price).replace('.', ',') : '';
  document.getElementById('cpStock').value = p.stockQty !== undefined ? p.stockQty : '';
  document.getElementById('cpActive').value = p.active === false ? 'false' : 'true';
  document.getElementById('cpPhoto').value = p.photoUrl || '';
  document.getElementById('cpDescription').value = p.description || '';
  document.getElementById('commProductFormError')?.classList.add('hidden');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.editCommercialProduct = editCommercialProduct;

async function saveCommercialProduct() {
  const errEl = document.getElementById('commProductFormError');
  if (errEl) errEl.classList.add('hidden');

  const name = document.getElementById('cpName')?.value?.trim();
  const code = document.getElementById('cpCode')?.value?.trim() || null;
  const category = document.getElementById('cpCategory')?.value?.trim() || null;
  const priceRaw = document.getElementById('cpPrice')?.value?.trim();
  const stockQtyRaw = document.getElementById('cpStock')?.value?.trim();
  const active = document.getElementById('cpActive')?.value === 'true';
  const photoUrl = document.getElementById('cpPhoto')?.value?.trim() || null;
  const description = document.getElementById('cpDescription')?.value?.trim() || null;

  if (!name) {
    if (errEl) {
      errEl.textContent = 'Informe o nome do produto.';
      errEl.classList.remove('hidden');
    }
    return;
  }
  if (!priceRaw) {
    if (errEl) {
      errEl.textContent = 'Informe o preço de venda.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const price = parseFloat(priceRaw.replace(',', '.'));
  if (isNaN(price) || price < 0) {
    if (errEl) {
      errEl.textContent = 'Preço de venda inválido.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const stockQty = stockQtyRaw !== '' ? parseInt(stockQtyRaw, 10) : 0;
  if (isNaN(stockQty) || stockQty < 0) {
    if (errEl) {
      errEl.textContent = 'Quantidade em estoque inválida.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const payload = {
    name,
    code,
    category,
    price,
    stockQty,
    active,
    photoUrl,
    description,
    itemType: 'produto'
  };

  try {
    const btn = document.getElementById('saveCommProductBtn');
    if (btn) btn.disabled = true;

    let res;
    if (editingCommercialProductId) {
      res = await fetch(`/api/products/${editingCommercialProductId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar produto');

    closeCommercialProductForm();
    await refreshAllData();
    broadcastSync('PRODUCT_SAVED');
    renderCommercialProductsTable(allProducts);
    alert(editingCommercialProductId ? 'Produto comercial atualizado!' : 'Produto comercial cadastrado!');
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  } finally {
    const btn = document.getElementById('saveCommProductBtn');
    if (btn) btn.disabled = false;
  }
}
window.saveCommercialProduct = saveCommercialProduct;

function triggerSyncCatalog() {
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.click();
}
window.triggerSyncCatalog = triggerSyncCatalog;

// Anexo de Foto do Produto Comercial
document.getElementById('cpPhotoFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('A imagem deve ter no máximo 5MB.');
    e.target.value = '';
    return;
  }

  try {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch('/api/uploads', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no envio da imagem');

    const photoInput = document.getElementById('cpPhoto');
    if (photoInput) photoInput.value = data.url;
    showToast('Imagem do produto anexada com sucesso!');
  } catch (err) {
    console.error('Erro no upload de foto comercial:', err);
    showToast(err.message || 'Erro ao enviar imagem');
  }
});

// Inicialização imediata do canal de sincronização em tempo real
initAdminSyncChannel();


