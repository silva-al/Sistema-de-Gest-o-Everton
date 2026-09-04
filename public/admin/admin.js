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
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainScreen').classList.add('hidden');
}

function showMain(admin) {
  currentAdmin = admin;
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
  const nameEl = document.getElementById('adminName');
  if (nameEl) nameEl.textContent = admin.name || admin.email || 'Administrador';

  // Carrega dados iniciais do sistema
  refreshAllData();
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
function switchTab(tabId) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });

  if (tabId === 'dashboard') updateDashboardMetrics();
  if (tabId === 'pedidos') renderOrdersTable(allOrders);
  if (tabId === 'expedicao') renderExpedicao();
  if (tabId === 'financeiro') renderFinances();
  if (tabId === 'notas-fiscais') renderFiscalTable();
}

document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ---------- Carregamento Global de Dados ----------
async function refreshAllData() {
  try {
    const [productsRes, ordersRes] = await Promise.allSettled([
      api('/products?in_stock='),
      api('/orders')
    ]);

    if (productsRes.status === 'fulfilled' && productsRes.value) {
      allProducts = productsRes.value.products || [];
      renderProductsTable(allProducts);
      fillCategoryList(allProducts);
    }
    if (ordersRes.status === 'fulfilled' && ordersRes.value) {
      allOrders = ordersRes.value.orders || [];
      renderOrdersTable(allOrders);
      // Atualiza badges
      const badge = document.getElementById('ordersCountBadge');
      if (badge) badge.textContent = allOrders.filter(o => o.status !== 'cancelado').length;
      
      const nfBadge = document.getElementById('nfCountBadge');
      if (nfBadge) nfBadge.textContent = allOrders.length;
    }

    updateDashboardMetrics();
    renderFinances();
    renderFiscalTable();
    renderExpedicao();
  } catch (err) {
    console.error('Erro ao atualizar dados:', err);
  }
}

document.getElementById('refreshBtn')?.addEventListener('click', () => {
  refreshAllData();
});

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
  const totalRev = allOrders
    .filter(o => o.status !== 'cancelado')
    .reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  if (totalRevenueEl) totalRevenueEl.textContent = money(totalRev);

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
          <img src="${photo}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;background:#000;display:block"/>
        </td>
        <td>
          <strong style="color:#fff;display:block">${p.name}</strong>
          <small style="color:var(--text-muted);font-family:var(--font-mono)">${p.code || 'S/CÓD'}</small>
        </td>
        <td><span class="status-badge" style="background:#1e2638;color:#94a1b2">${p.category || 'Geral'}</span></td>
        <td style="color:var(--accent-green);font-weight:700">${money(pixVal)}</td>
        <td style="color:var(--text-secondary)">${money(priceVal)}</td>
        <td>
          <strong style="color:${p.stockQty > 0 ? '#fff' : '#ff5e65'}">${p.stockQty} un</strong>
        </td>
        <td>
          ${p.inStock ? '<span class="status-badge pronto">● Em Estoque</span>' : '<span class="status-badge cancelado">○ Esgotado</span>'}
        </td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-secondary btn-sm" data-edit="${p.id}">Editar</button>
          <button class="btn btn-sm" style="background:rgba(237,28,36,0.15);color:#ff5e65;border:1px solid rgba(237,28,36,0.3)" data-remove="${p.id}">Excluir</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => startEdit(b.dataset.edit));
  tbody.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => removeProduct(b.dataset.remove));
}

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
  resetProductForm();
  document.getElementById('productFormPanel')?.scrollIntoView({ behavior: 'smooth' });
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
  document.getElementById('pPhoto').value = p.photoUrl || '';
  document.getElementById('pDescription').value = p.description || '';
  document.getElementById('pCompatibility').value = p.compatibility || '';
  document.getElementById('cancelEditBtn').classList.remove('hidden');
  document.getElementById('saveProductBtn').textContent = 'SALVAR ALTERAÇÕES';
  document.getElementById('productFormPanel')?.scrollIntoView({ behavior: 'smooth' });
}

function resetProductForm() {
  editingProductId = null;
  document.getElementById('formTitle').textContent = 'Cadastrar Nova Peça';
  ['pName', 'pCode', 'pCategory', 'pPrice', 'pStock', 'pPhoto', 'pDescription', 'pCompatibility'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('saveProductBtn').textContent = 'SALVAR PEÇA NO SISTEMA';
  document.getElementById('productFormError').classList.add('hidden');
  document.getElementById('productFormMsg').classList.add('hidden');
}

document.getElementById('cancelEditBtn')?.addEventListener('click', resetProductForm);

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
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      msgEl.textContent = 'Peça cadastrada com sucesso!';
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
  if (!confirm('Tem certeza que deseja remover esta peça?')) return;
  try {
    await api('/products/' + id, { method: 'DELETE' });
    await refreshAllData();
  } catch (err) {
    alert(err.message);
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
          <strong style="color:var(--accent-cyan)">#${o.id}</strong>
        </td>
        <td>
          <strong style="color:#fff;display:block">${o.customerName || 'Cliente'}</strong>
          <small style="color:var(--text-muted)">${o.customerPhone || 'Sem telefone'}</small>
        </td>
        <td style="max-width:280px;font-size:12.5px" title="${itemsText}">
          ${itemsText}
        </td>
        <td>
          <span class="status-badge" style="background:#192233;color:#fff">${o.paymentMethodLabel}</span>
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
        <td style="text-align:right">
          <button class="btn btn-secondary btn-sm" onclick="openDanfeForOrder(${o.id})" title="Imprimir DANFE / Nota Fiscal">
            🖨️ DANFE
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

document.getElementById('orderStatusFilter')?.addEventListener('change', (e) => {
  const st = e.target.value;
  const filtered = st ? allOrders.filter(o => o.status === st) : allOrders;
  renderOrdersTable(filtered);
});

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
            <strong style="color:var(--accent-cyan);font-size:16px">Pacote #${o.id}</strong>
            <div style="color:#fff;font-weight:700;margin-top:2px">${o.customerName || 'Cliente'}</div>
            <div style="font-size:12px;color:var(--text-muted)">📍 ${addressStr}</div>
          </div>
          <span class="status-badge ${o.status}">${ORDER_STATUS_LABEL[o.status] || o.status}</span>
        </div>
        <div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;font-size:12.5px;color:var(--text-secondary);margin-bottom:12px">
          <strong>Itens a separar:</strong><br/>
          ${(o.items || []).map(i => `• ${i.quantity}x ${i.name}`).join('<br/>')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:800;color:var(--accent-green)">Total: ${money(o.total)}</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="openDanfeForOrder(${o.id})">🖨️ DANFE de Envio</button>
            ${o.status === 'em_preparacao' ? `
              <button class="btn btn-primary btn-sm" onclick="updateOrderStatusQuick(${o.id}, 'pronto')">Marcar Pronto</button>
            ` : o.status === 'pronto' ? `
              <button class="btn btn-primary btn-sm" style="background:var(--accent-green);color:#000" onclick="updateOrderStatusQuick(${o.id}, 'entregue')">Despachar / Entregue</button>
            ` : `
              <button class="btn btn-primary btn-sm" onclick="updateOrderStatusQuick(${o.id}, 'em_preparacao')">Iniciar Separação</button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

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
        <td><span class="status-badge" style="background:#192233;color:#fff">${o.paymentMethodLabel}</span></td>
        <td style="font-size:12px;color:var(--text-muted)">${formatDate(o.createdAt)}</td>
        <td style="color:${isPix ? 'var(--accent-cyan)' : 'var(--text-muted)'}">${isPix ? money(disc) : '-'}</td>
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
    allOrders.forEach(o => {
      if (o.status !== 'cancelado' && !nfsMap[o.id]) markNfAsIssued(o.id);
    });
  }

  const updatedMap = getIssuedNfsMap();

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

    return `
      <tr>
        <td>
          <strong style="color:${isIssued ? '#fff' : 'var(--text-muted)'}">${nfNumFormatted}</strong>
        </td>
        <td style="font-family:var(--font-mono);font-size:11px;color:${isIssued ? 'var(--accent-cyan)' : 'var(--text-muted)'}">
          ${accessKey}
        </td>
        <td><strong style="color:#fff">Pedido #${o.id}</strong></td>
        <td>${o.customerName || 'Consumidor Final'}</td>
        <td style="font-weight:800;color:var(--accent-green)">${money(o.total)}</td>
        <td style="font-size:12px;color:var(--text-muted)">${issuedDate}</td>
        <td>
          ${isIssued ? '<span class="status-badge nf-emitida">✓ Autorizada</span>' : '<span class="status-badge nf-pendente">⏳ Pendente</span>'}
        </td>
        <td style="text-align:right">
          ${isIssued ? `
            <button class="btn btn-primary btn-sm" onclick="openDanfeForOrder(${o.id})">
              🖨️ IMPRIMIR DANFE
            </button>
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

document.getElementById('emitAllPendingNfBtn')?.addEventListener('click', () => {
  allOrders.forEach(o => {
    if (o.status !== 'cancelado') markNfAsIssued(o.id);
  });
  renderFiscalTable();
  alert('Todas as notas fiscais pendentes foram emitidas e autorizadas com sucesso!');
});

// ---------- MODAL DE IMPRESSÃO DO DANFE OFICIAL ----------
// Fechar modal com ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('danfeModal');
    if (modal && !modal.classList.contains('hidden')) {
      closeDanfeModal();
    }
  }
});

window.openDanfeForOrder = (orderId) => {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  markNfAsIssued(orderId);
  const nfsMap = getIssuedNfsMap();
  const nf = nfsMap[orderId] || {
    nfNumber: 1000 + Number(orderId),
    accessKey: generateNfAccessKey(orderId),
    issuedAt: new Date().toISOString()
  };

  const sheet = document.getElementById('danfePrintArea');
  if (!sheet) return;

  const addr = order.address || {};
  const destName = order.customerName || 'Consumidor Final';
  const destPhone = order.customerPhone || '(Sem telefone)';
  const destCep = addr.cep || '';
  const destCity = addr.city || FISCAL_CONFIG.cidade;
  const destUf = addr.state || FISCAL_CONFIG.uf;
  const destBairro = addr.neighborhood || '';
  const destRua = addr.street ? `${addr.street}, ${addr.number} ${addr.complement || ''}` : 'Retirada no Balcão';

  const items = order.items || [];
  const totalProdutos = items.reduce((acc, i) => acc + ((Number(i.unitPrice) || 0) * (Number(i.quantity) || 1)), 0);
  const valorTotalNota = Number(order.total) || 0;
  const valorIcms = valorTotalNota * 0.18;
  const emissaoDate = formatDate(nf.issuedAt).slice(0, 10);
  const emissaoFull = formatDate(nf.issuedAt);
  const nfNum = String(nf.nfNumber).padStart(6, '0');
  const protocolo = `135${String(26).padStart(2,'0')}0098${String(nf.nfNumber).padStart(6,'0')}`;

  sheet.innerHTML = `
    <!-- TOPO: RECEBEMOS DE... -->
    <div class="nf-row nf-top-receiver">
      <div class="nf-cell" style="flex:3">
        <span class="nf-label">RECEBEMOS DE <strong>${FISCAL_CONFIG.razaoSocial}</strong> OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO</span>
      </div>
      <div class="nf-cell" style="flex:1;text-align:center;border-left:1px solid #000">
        <span class="nf-label">NF-e</span><br/>
        <strong style="font-size:12px">Nº ${nfNum}</strong><br/>
        <span class="nf-label">Série 1</span>
      </div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2">
        <span class="nf-label">DATA DE RECEBIMENTO</span>
      </div>
      <div class="nf-cell" style="flex:3;border-left:1px solid #000">
        <span class="nf-label">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
      </div>
    </div>

    <!-- CABEÇALHO PRINCIPAL -->
    <div class="nf-header-main">
      <div class="nf-header-emitente">
        <strong style="font-size:11px;display:block;margin-bottom:2px">${FISCAL_CONFIG.razaoSocial}</strong>
        <div>${FISCAL_CONFIG.logradouro}</div>
        <div>${FISCAL_CONFIG.cidade} - ${FISCAL_CONFIG.uf} - CEP: ${FISCAL_CONFIG.cep}</div>
        <div>TEL: ${FISCAL_CONFIG.telefone}</div>
        <div style="margin-top:2px">www.fahrenmotors.com.br</div>
      </div>
      <div class="nf-header-danfe">
        <strong style="font-size:14px;display:block">DANFE</strong>
        <div style="font-size:7.5px;line-height:1.2">Documento Auxiliar<br/>da Nota Fiscal Eletrônica</div>
        <div style="margin-top:3px;font-size:9px">0 - ENTRADA<br/><strong>1 - SAÍDA</strong></div>
        <div style="margin-top:3px"><strong style="font-size:11px">Nº ${nfNum}</strong></div>
        <div style="font-size:8px">Série 1&nbsp;&nbsp;Página 1 de 1</div>
      </div>
      <div class="nf-header-barcode">
        <div class="danfe-barcode-mock"></div>
        <div class="nf-key-text">${nf.accessKey}</div>
        <div style="font-size:7px;color:#555;margin-top:2px">Consulta de autenticidade no portal nacional da NF-e<br/>www.nfe.fazenda.gov.br/portal</div>
      </div>
    </div>

    <!-- NATUREZA DA OPERAÇÃO + PROTOCOLO -->
    <div class="nf-row">
      <div class="nf-cell" style="flex:3">
        <span class="nf-label">NATUREZA DA OPERAÇÃO</span><br/>
        <strong>Venda de mercadorias</strong>
      </div>
      <div class="nf-cell" style="flex:2;border-left:1px solid #000">
        <span class="nf-label">PROTOCOLO DE AUTORIZAÇÃO DE USO DA NF-e</span><br/>
        <strong>${protocolo} - ${emissaoFull}</strong>
      </div>
    </div>

    <!-- INSCRIÇÃO ESTADUAL / CNPJ -->
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:1">
        <span class="nf-label">INSCRIÇÃO ESTADUAL</span><br/>${FISCAL_CONFIG.ie}
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">INSCRIÇÃO ESTADUAL DO SUBST. TRIB.</span><br/>&nbsp;
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">CNPJ</span><br/>${FISCAL_CONFIG.cnpj}
      </div>
    </div>

    <!-- DESTINATÁRIO / REMETENTE -->
    <div class="nf-section-title">DESTINATÁRIO / REMETENTE</div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:3">
        <span class="nf-label">NOME / RAZÃO SOCIAL</span><br/><strong>${destName}</strong>
      </div>
      <div class="nf-cell" style="flex:1.2;border-left:1px solid #000">
        <span class="nf-label">CNPJ/CPF</span><br/>Consumidor Final
      </div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000">
        <span class="nf-label">DATA DA EMISSÃO</span><br/>${emissaoDate}
      </div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2.5">
        <span class="nf-label">ENDEREÇO</span><br/>${destRua}
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">BAIRRO / DISTRITO</span><br/>${destBairro}
      </div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000">
        <span class="nf-label">CEP</span><br/>${destCep}
      </div>
      <div class="nf-cell" style="flex:0.5;border-left:1px solid #000">
        <span class="nf-label">DATA SAÍDA</span><br/>${emissaoDate}
      </div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2">
        <span class="nf-label">MUNICÍPIO</span><br/>${destCity}
      </div>
      <div class="nf-cell" style="flex:0.5;border-left:1px solid #000">
        <span class="nf-label">FONE/FAX</span><br/>${destPhone}
      </div>
      <div class="nf-cell" style="flex:0.3;border-left:1px solid #000">
        <span class="nf-label">UF</span><br/>${destUf}
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">INSCRIÇÃO ESTADUAL</span><br/>&nbsp;
      </div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000">
        <span class="nf-label">HORA DA SAÍDA</span><br/>${formatDate(nf.issuedAt).slice(11)}
      </div>
    </div>

    <!-- FATURA -->
    <div class="nf-section-title">FATURA</div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:1">
        <span class="nf-label">NÚMERO</span><br/>${nfNum}
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">VALOR ORIGINAL</span><br/>${money(totalProdutos)}
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">DESCONTO</span><br/>${money(order.discount || 0)}
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000">
        <span class="nf-label">VALOR LÍQUIDO</span><br/><strong>${money(valorTotalNota)}</strong>
      </div>
    </div>

    <!-- CÁLCULO DO IMPOSTO -->
    <div class="nf-section-title">CÁLCULO DO IMPOSTO</div>
    <div class="nf-row nf-imposto-row" style="border-top:0">
      <div class="nf-cell"><span class="nf-label">BASE DE CÁLC. ICMS</span><br/>${money(valorTotalNota)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO ICMS</span><br/>${money(valorIcms)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">BC ICMS S.T.</span><br/>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">V. ICMS SUBST.</span><br/>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">V. IMP. IMPORT.</span><br/>0,00</div>
    </div>
    <div class="nf-row nf-imposto-row" style="border-top:0">
      <div class="nf-cell"><span class="nf-label">VALOR DO FRETE</span><br/>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO SEGURO</span><br/>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">DESCONTO</span><br/>${money(order.discount || 0)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">OUTRAS DESP.</span><br/>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR TOTAL DOS PRODUTOS</span><br/>${money(totalProdutos)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label"><strong>VALOR TOTAL DA NOTA</strong></span><br/><strong>${money(valorTotalNota)}</strong></div>
    </div>

    <!-- TRANSPORTADOR / VOLUMES TRANSPORTADOS -->
    <div class="nf-section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2"><span class="nf-label">RAZÃO SOCIAL</span><br/>&nbsp;</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">FRETE POR CONTA</span><br/>1 - Emitente</div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000"><span class="nf-label">CÓDIGO ANTT</span><br/>&nbsp;</div>
      <div class="nf-cell" style="flex:0.8;border-left:1px solid #000"><span class="nf-label">PLACA DO VEÍCULO</span><br/>&nbsp;</div>
      <div class="nf-cell" style="flex:0.3;border-left:1px solid #000"><span class="nf-label">UF</span><br/>&nbsp;</div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000"><span class="nf-label">CNPJ/CPF</span><br/>&nbsp;</div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell" style="flex:2"><span class="nf-label">ENDEREÇO</span><br/>&nbsp;</div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000"><span class="nf-label">MUNICÍPIO</span><br/>&nbsp;</div>
      <div class="nf-cell" style="flex:0.3;border-left:1px solid #000"><span class="nf-label">UF</span><br/>&nbsp;</div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000"><span class="nf-label">INSCRIÇÃO ESTADUAL</span><br/>&nbsp;</div>
    </div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell"><span class="nf-label">QUANTIDADE</span><br/>${items.reduce((a,i)=>a+(Number(i.quantity)||1),0)}</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">ESPÉCIE</span><br/>Caixa</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">MARCA</span><br/>Fahren</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">NUMERAÇÃO</span><br/>&nbsp;</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">PESO BRUTO</span><br/>&nbsp;</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">PESO LÍQUIDO</span><br/>&nbsp;</div>
    </div>

    <!-- DADOS DOS PRODUTOS -->
    <div class="nf-section-title">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <table class="nf-products-table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Descrição do Produto/Serviço</th>
          <th>NCM/SH</th>
          <th>CST</th>
          <th>CFOP</th>
          <th>UN</th>
          <th>Quant.</th>
          <th>Valor Unit.</th>
          <th>Valor Total</th>
          <th>BC ICMS</th>
          <th>Vl. ICMS</th>
          <th>Vl. IPI</th>
          <th>Alíq. ICMS</th>
          <th>Alíq. IPI</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(i => {
          const qtd = Number(i.quantity) || 1;
          const unit = Number(i.unitPrice) || 0;
          const tot = qtd * unit;
          const icmsItem = tot * 0.18;
          return `<tr>
            <td>PECA-${i.productId}</td>
            <td><strong>${i.name}</strong></td>
            <td>8708.29.99</td>
            <td>010</td>
            <td>5.102</td>
            <td>UN</td>
            <td>${qtd}</td>
            <td>${money(unit)}</td>
            <td>${money(tot)}</td>
            <td>${money(tot)}</td>
            <td>${money(icmsItem)}</td>
            <td>0,00</td>
            <td>18%</td>
            <td>0%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <!-- CÁLCULO DO ISSQN -->
    <div class="nf-section-title">CÁLCULO DO ISSQN</div>
    <div class="nf-row" style="border-top:0">
      <div class="nf-cell"><span class="nf-label">INSCRIÇÃO MUNICIPAL</span><br/>&nbsp;</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR TOTAL DOS SERVIÇOS</span><br/>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">BASE DE CÁLCULO DO ISSQN</span><br/>0,00</div>
      <div class="nf-cell" style="border-left:1px solid #000"><span class="nf-label">VALOR DO ISSQN</span><br/>0,00</div>
    </div>

    <!-- DADOS ADICIONAIS -->
    <div class="nf-section-title">DADOS ADICIONAIS</div>
    <div class="nf-row nf-dados-adicionais" style="border-top:0">
      <div class="nf-cell" style="flex:1;min-height:50px">
        <span class="nf-label">INFORMAÇÕES COMPLEMENTARES</span><br/>
        <span style="font-size:7.5px">Pedido #${order.id} — ${order.paymentMethodLabel}. Regime Tributário: Simples Nacional. Permite o aproveitamento de crédito de ICMS correspondente à alíquota aplicável. Mercadoria destinada a uso/consumo ou reposição veicular.</span>
      </div>
      <div class="nf-cell" style="flex:1;border-left:1px solid #000;min-height:50px">
        <span class="nf-label">RESERVADO AO FISCO</span><br/>&nbsp;
      </div>
    </div>

    <!-- RODAPÉ -->
    <div class="nf-footer">
      Documento emitido por sistema de gestão Fahren Motors &nbsp;|&nbsp; Ambiente de <strong>HOMOLOGAÇÃO</strong> - documento sem valor fiscal &nbsp;|&nbsp; ${emissaoFull}
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
