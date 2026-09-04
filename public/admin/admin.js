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

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
const VALID_TABS = ['dashboard', 'estoque', 'pedidos', 'expedicao', 'financeiro', 'notas-fiscais'];
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

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });

  if (resetScroll) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  if (tabId === 'dashboard') updateDashboardMetrics();
  if (tabId === 'pedidos') renderOrdersTable(allOrders);
  if (tabId === 'expedicao') renderExpedicao();
  if (tabId === 'financeiro') renderFinances();
  if (tabId === 'notas-fiscais') renderFiscalTable();
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
  const currentY = window.pageYOffset || document.documentElement.scrollTop || 0;
  
  // 1. Renderização Otimista: carrega instantaneamente do cache local para não haver tela vazia no F5
  try {
    const cachedProducts = localStorage.getItem('fm_cache_products');
    const cachedOrders = localStorage.getItem('fm_cache_orders');
    if (cachedProducts) {
      allProducts = JSON.parse(cachedProducts);
      renderProductsTable(allProducts);
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
    }
  } catch (e) {}

  // 2. Fetch em background para garantir os dados mais recentes do servidor
  try {
    const [productsRes, ordersRes] = await Promise.allSettled([
      api('/products?in_stock='),
      api('/orders')
    ]);

    if (productsRes.status === 'fulfilled' && productsRes.value) {
      allProducts = productsRes.value.products || [];
      localStorage.setItem('fm_cache_products', JSON.stringify(allProducts));
      renderProductsTable(allProducts);
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

    // Mantém a rolagem exatamente no mesmo lugar onde o usuário estava
    if (currentY > 0) {
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
    try {
      await refreshAllData();
      showToast('Sistema e dados atualizados com sucesso!');
    } catch (err) {
      console.error('Erro ao atualizar dados:', err);
      showToast('Erro ao atualizar dados.');
    } finally {
      setTimeout(() => {
        refreshBtn.classList.remove('is-refreshing');
      }, 600);
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
        <strong>Pedido #${o.id}</strong> — <span style="color:#fff">${o.customerName || 'Cliente'}</span>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${formatDate(o.createdAt)} • ${o.paymentMethodLabel}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:800;color:var(--accent-green)">${money(o.total)}</div>
        <span class="status-badge ${o.status}" style="font-size:10px;margin-top:2px">${o.status}</span>
      </div>
    </div>
  `).join('');
}

// ---------- 2. ESTOQUE & PRODUTOS ----------
function renderProductsTable(products) {
  const tbody = document.getElementById('productsTableBody');
  const summary = document.getElementById('stockTableSummary');
  if (summary) summary.textContent = `${products.length} peça(s) encontrada(s)`;
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma peça encontrada no catálogo.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => {
    const priceVal = Number(p.price) || 0;
    const pixVal = priceVal * 0.96;
    const photo = p.photoUrl || 'images/produtos/pastilha.jpg';
    return `
      <tr>
        <td style="width:50px">
          <img src="${photo}" alt="" style="width:42px;height:42px;border-radius:8px;object-fit:cover;background:#000;display:block;border:1px solid #282b30"/>
        </td>
        <td>
          <strong style="color:#fff;display:block">${p.name}</strong>
          <small style="color:var(--text-muted);font-family:var(--font-mono)">${p.code || 'S/CÓD'}</small>
        </td>
        <td><span class="status-badge" style="background:#191b1f;border:1px solid #282b30;color:#c7c9cd">${p.category || 'Geral'}</span></td>
        <td style="color:var(--accent-green);font-weight:700">${money(pixVal)}</td>
        <td style="color:var(--text-secondary)">${money(priceVal)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:4px">
            <div class="stock-control-cell">
              <button type="button" class="btn-stock-qty" data-stock-step="-1" data-id="${p.id}" title="Subtrair 1 un">−</button>
              <input type="number" class="stock-num-input" value="${p.stockQty}" data-id="${p.id}" min="0" title="Altere e aperte Enter para salvar"/>
              <button type="button" class="btn-stock-qty" data-stock-step="1" data-id="${p.id}" title="Adicionar 1 un">+</button>
            </div>
            <button type="button" class="btn-stock-adjust" data-open-stock="${p.id}" title="Ajuste rápido (+5, +10, +50)">⚡</button>
          </div>
        </td>
        <td>
          ${p.inStock ? '<span class="status-badge pronto">● Em Estoque</span>' : '<span class="status-badge cancelado">○ Esgotado</span>'}
        </td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-secondary btn-sm" data-edit="${p.id}" title="Editar dados da peça">Editar</button>
          <button class="btn btn-sm" style="background:rgba(237,28,36,0.15);color:#ff5e65;border:1px solid rgba(237,28,36,0.3);margin-left:4px" data-remove="${p.id}" title="Excluir peça do catálogo">Excluir</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => startEdit(b.dataset.edit));
  tbody.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => removeProduct(b.dataset.remove));
  tbody.querySelectorAll('[data-open-stock]').forEach(b => b.onclick = () => openStockModal(b.dataset.openStock));

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
    updateDashboardMetrics();
    showToast(`Estoque de "${prod.name}" atualizado para ${qty} un.`);
  } catch (err) {
    console.error('Erro ao atualizar estoque:', err);
    showToast(err.message || 'Erro ao atualizar estoque');
  }
}

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
    updateDashboardMetrics();
    closeStockModal();
    showToast(`Peça "${prod.name}" atualizada com sucesso!`);
  } catch (err) {
    console.error('Erro ao salvar dados da peça:', err);
    showToast(err.message || 'Erro ao salvar alterações da peça');
  }
});

function fillCategoryList(products) {
  const list = document.getElementById('categoryList');
  if (!list) return;
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
  list.innerHTML = cats.map(c => `<option value="${c}"></option>`).join('');
}

document.getElementById('stockSearch')?.addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase().trim();
  const filtered = allProducts.filter(p =>
    (p.name || '').toLowerCase().includes(term) ||
    (p.code || '').toLowerCase().includes(term) ||
    (p.category || '').toLowerCase().includes(term)
  );
  renderProductsTable(filtered);
});

// Cadastro e Edição de Peças
document.getElementById('newProductToggleBtn')?.addEventListener('click', () => {
  switchTab('estoque');
  resetProductForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const panel = document.getElementById('productFormPanel');
  if (panel) {
    const yOffset = -75;
    const y = panel.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
  setTimeout(() => {
    document.getElementById('pName')?.focus();
  }, 180);
});

function startEdit(id) {
  const p = allProducts.find(item => String(item.id) === String(id));
  if (!p) return;
  editingProductId = p.id;
  document.getElementById('formTitle').textContent = `Editar Peça: ${p.name}`;
  document.getElementById('pName').value = p.name || '';
  document.getElementById('pCode').value = p.code || '';
  document.getElementById('pCategory').value = p.category || '';
  document.getElementById('pPrice').value = String(p.price || '').replace('.', ',');
  document.getElementById('pStock').value = p.stockQty || 0;
  
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
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const panel = document.getElementById('productFormPanel');
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
  document.getElementById('formTitle').textContent = 'Cadastrar Nova Peça';
  ['pName', 'pCode', 'pCategory', 'pPrice', 'pStock', 'pPhoto', 'pDescription', 'pCompatibility'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const fileInput = document.getElementById('pPhotoFile');
  if (fileInput) fileInput.value = '';
  const previewWrap = document.getElementById('pPhotoPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  const previewImg = document.getElementById('pPhotoPreview');
  if (previewImg) previewImg.src = '';

  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('saveProductBtn').textContent = 'SALVAR PEÇA NO SISTEMA';
  document.getElementById('productFormError').classList.add('hidden');
  document.getElementById('productFormMsg').classList.add('hidden');
}

document.getElementById('cancelEditBtn')?.addEventListener('click', resetProductForm);

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
  const photoUrl = document.getElementById('pPhoto').value.trim();
  const description = document.getElementById('pDescription').value.trim();
  const compatibility = document.getElementById('pCompatibility').value.trim();

  if (!name || !category || isNaN(price) || isNaN(stockQty)) {
    errEl.textContent = 'Preencha Nome, Categoria, Preço e Estoque.';
    errEl.classList.remove('hidden');
    return;
  }

  const payload = { name, code, category, price, stockQty, photoUrl, description, compatibility, inStock: stockQty > 0 };

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
    resetProductForm();
    await refreshAllData();
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

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhum pedido encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const itemsText = (o.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Nenhum item';
    return `
      <tr>
        <td>
          <strong style="color:var(--accent-red-light)">#${o.id}</strong>
        </td>
        <td>
          <strong style="color:#fff;display:block">${o.customerName || 'Cliente'}</strong>
          <small style="color:var(--text-muted)">${o.customerPhone || 'Sem telefone'}</small>
        </td>
        <td style="max-width:280px;font-size:12.5px" title="${itemsText}">
          ${itemsText}
        </td>
        <td>
          <span class="status-badge" style="background:#191b1f;border:1px solid #282b30;color:#c7c9cd">${o.paymentMethodLabel}</span>
        </td>
        <td>
          <strong style="color:var(--accent-green);font-size:14px">${money(o.total)}</strong>
        </td>
        <td style="font-size:12px;color:var(--text-muted)">${formatDate(o.createdAt)}</td>
        <td>
          <select class="status-select status-badge ${o.status}" data-order-status="${o.id}" style="background:var(--bg-dark);border:1px solid var(--panel-border);color:#fff;cursor:pointer;padding:6px 10px;border-radius:8px">
            <option value="novo" ${o.status === 'novo' ? 'selected' : ''}>Novo</option>
            <option value="em_preparacao" ${o.status === 'em_preparacao' ? 'selected' : ''}>Em preparação</option>
            <option value="pronto" ${o.status === 'pronto' ? 'selected' : ''}>Pronto</option>
            <option value="entregue" ${o.status === 'entregue' ? 'selected' : ''}>Entregue</option>
            <option value="cancelado" ${o.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
        </td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="openDanfeForOrder(${o.id})" title="Imprimir DANFE / Nota Fiscal">
            🖨️ DANFE
          </button>
          <button class="btn btn-secondary btn-sm" onclick="deleteExpedicaoOrder(${o.id})" title="Excluir Pedido" style="margin-left:4px;border-color:rgba(237,28,36,0.35);color:#ff5e65">
            🗑️
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
  const select = document.getElementById('orderStatusFilter');
  const pills = document.querySelectorAll('#orderStatusPills .filter-pill');

  function applyFilter(status) {
    pills.forEach(p => {
      p.classList.toggle('active', (p.dataset.status || '') === (status || ''));
    });
    if (select && select.value !== (status || '')) {
      select.value = status || '';
    }
    const filtered = status ? allOrders.filter(o => o.status === status) : allOrders;
    renderOrdersTable(filtered);
  }

  pills.forEach(pill => {
    pill.onclick = () => applyFilter(pill.dataset.status || '');
  });

  if (select) {
    select.onchange = (e) => applyFilter(e.target.value || '');
  }
}
setupOrderStatusFilter();


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
      <div class="expedicao-card" style="background:var(--bg-dark);border:1px solid var(--panel-border);border-radius:14px;padding:18px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <strong style="color:var(--accent-red-light);font-size:16px">Pacote #${o.id}</strong>
            <div style="color:#fff;font-weight:700;margin-top:2px">${o.customerName || 'Cliente'}</div>
            <div style="font-size:12px;color:var(--text-muted)">📍 ${addressStr}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="status-badge ${o.status}">${ORDER_STATUS_LABEL[o.status] || o.status}</span>
            <button class="btn btn-secondary btn-sm" onclick="deleteExpedicaoOrder(${o.id})" title="Excluir este pedido da expedição" style="border-color:rgba(237,28,36,0.35);color:#ff5e65;padding:4px 8px">
              🗑️ Excluir
            </button>
          </div>
        </div>
        <div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;font-size:12.5px;color:var(--text-secondary);margin-bottom:12px">
          <strong>Itens a separar:</strong><br/>
          ${(o.items || []).map(i => `• ${i.quantity}x ${i.name}`).join('<br/>')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <span style="font-weight:800;color:var(--accent-green)">Total: ${money(o.total)}</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="openDanfeForOrder(${o.id})">🖨️ DANFE de Envio</button>
            
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
              <button class="btn btn-primary btn-sm" style="background:var(--accent-green);color:#000;font-weight:700" onclick="updateOrderStatusQuick(${o.id}, 'entregue')">
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
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td style="color:#fff">${o.customerName || 'Cliente'}</td>
        <td><span class="status-badge" style="background:#191b1f;border:1px solid #282b30;color:#c7c9cd">${o.paymentMethodLabel}</span></td>
        <td style="font-size:12px;color:var(--text-muted)">${formatDate(o.createdAt)}</td>
        <td style="color:${isPix ? 'var(--accent-green)' : 'var(--text-muted)'}">${isPix ? money(disc) : '-'}</td>
        <td>${money(bruto)}</td>
        <td style="font-weight:800;color:${isCancelled ? '#ff5e65' : 'var(--accent-green)'}">${money(o.total)}</td>
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
        <tr>
          <td>
            <strong style="color:${isIssued ? '#fff' : 'var(--text-muted)'}">${nfNumFormatted}</strong>
          </td>
          <td style="font-family:var(--font-mono);font-size:11px;color:${isIssued ? 'var(--accent-red-light)' : 'var(--text-muted)'}">
            ${accessKey}
            ${isIssued ? `<button onclick="copyAccessKey(this, '${accessKey.replace(/\s+/g, '')}')" title="Copiar chave de acesso" style="background:none;border:none;cursor:pointer;padding:2px 4px;margin-left:4px;vertical-align:middle;color:var(--text-muted);transition:color .2s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--text-muted)'"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}
          </td>
          <td><strong style="color:#fff">Pedido #${o.id}</strong></td>
          <td>${o.customerName || 'Consumidor Final'}</td>
          <td style="font-weight:800;color:var(--accent-green)">${money(o.total)}</td>
          <td style="font-size:12px;color:var(--text-muted)">${issuedDate}</td>
          <td>
            ${isIssued ? '<span class="status-badge nf-emitida">✓ Autorizada</span>' : '<span class="status-badge nf-pendente">⏳ Pendente</span>'}
            ${hasCce ? `<br/><span class="status-badge cce-active-badge" title="Carta de Correção Eletrônica Vinculada">📝 CC-e Ativa (Seq ${cceSeq})</span>` : ''}
          </td>
          <td style="text-align:right;white-space:nowrap;vertical-align:middle">
            ${isIssued ? `
              <div style="display:inline-flex;flex-direction:column;gap:5px;width:125px">
                <button class="btn btn-primary btn-sm" onclick="openDanfeForOrder(${o.id})" title="Imprimir Documento Fiscal" style="justify-content:center;padding:4px 6px;font-size:11px;font-weight:700">
                  🖨️ DANFE
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openEditNfModal(${o.id})" title="Editar campos da DANFE / NFe" style="justify-content:center;padding:4px 6px;font-size:11px;font-weight:600">
                  ✏️ Editar NF
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openCceModal(${o.id})" title="${hasCce ? 'Editar Carta de Correção (CC-e)' : 'Emitir Carta de Correção (CC-e)'}" style="justify-content:center;padding:4px 6px;font-size:11px;font-weight:600;border-color:rgba(255,183,77,0.4);color:#ffb74d;display:flex;align-items:center;gap:4px">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  <span>${hasCce ? 'Editar CC-e' : 'CC-e'}</span>
                </button>
                ${hasCce ? `
                  <button class="btn btn-secondary btn-sm" onclick="openDacceForOrder(${o.id})" title="Visualizar e Imprimir a Carta de Correção" style="justify-content:center;padding:4px 6px;font-size:10.5px;font-weight:700;border-color:rgba(57,201,121,0.4);color:var(--accent-green)">
                    🖨️ Imprimir Correção
                  </button>
                ` : ''}
              </div>
            ` : `
              <button class="btn btn-secondary btn-sm" onclick="manualEmitNf(${o.id})">
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
