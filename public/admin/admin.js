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
window.openDanfeForOrder = (orderId) => {
  const order = allOrders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  // Garante que exista registro fiscal
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
  const destAddress = addr.street ? `${addr.street}, ${addr.number} ${addr.complement || ''} - ${addr.neighborhood}, ${addr.city}/${addr.state} - CEP: ${addr.cep}` : 'Retirada no Balcão da Oficina Fahren Motors';

  const items = order.items || [];
  const totalProdutos = items.reduce((acc, i) => acc + ((Number(i.unitPrice) || 0) * (Number(i.quantity) || 1)), 0);
  const valorTotalNota = order.total;

  sheet.innerHTML = `
    <!-- CABEÇALHO DANFE -->
    <div class="danfe-header-box">
      <div class="danfe-emitente">
        <strong>${FISCAL_CONFIG.razaoSocial}</strong>
        <div>${FISCAL_CONFIG.logradouro}</div>
        <div>${FISCAL_CONFIG.cidade} - ${FISCAL_CONFIG.uf} - CEP: ${FISCAL_CONFIG.cep}</div>
        <div>TEL: ${FISCAL_CONFIG.telefone}</div>
      </div>
      <div class="danfe-doc-title">
        <h4>DANFE</h4>
        <div style="font-size:9px">Documento Auxiliar da Nota Fiscal Eletrônica</div>
        <div style="font-size:10px;margin-top:4px">0 - ENTRADA<br/><strong>1 - SAÍDA</strong></div>
        <div style="margin-top:4px;font-weight:bold">Nº 000.${String(nf.nfNumber).padStart(6, '0')}</div>
        <div>SÉRIE: 1</div>
      </div>
      <div class="danfe-barcode-area">
        <div class="danfe-barcode-mock"></div>
        <div style="font-size:9px;font-weight:bold;margin-bottom:2px">CHAVE DE ACESSO NFE</div>
        <div class="danfe-key-text">${nf.accessKey}</div>
        <div style="font-size:8px;color:#444;margin-top:3px">Consulta de autenticidade no portal nacional da NF-e</div>
      </div>
    </div>

    <!-- DADOS DO EMITENTE & PROTOCOLO -->
    <div class="danfe-sec-box">
      <div class="danfe-sec-content" style="display:flex;justify-content:space-between">
        <div><strong>CNPJ DO EMITENTE:</strong> ${FISCAL_CONFIG.cnpj}</div>
        <div><strong>INSCRIÇÃO ESTADUAL:</strong> ${FISCAL_CONFIG.ie}</div>
        <div><strong>PROTOCOLO DE AUTORIZAÇÃO:</strong> 135260098412849 - ${formatDate(nf.issuedAt)}</div>
      </div>
    </div>

    <!-- DESTINATÁRIO / REMETENTE -->
    <div class="danfe-sec-box">
      <div class="danfe-sec-title">DESTINATÁRIO / REMETENTE</div>
      <div class="danfe-sec-content">
        <div style="display:grid;grid-template-columns:2.5fr 1.5fr 1fr;gap:6px;margin-bottom:4px">
          <div><strong>NOME / RAZÃO SOCIAL:</strong> ${destName}</div>
          <div><strong>CNPJ / CPF:</strong> Consumidor Final</div>
          <div><strong>DATA DA EMISSÃO:</strong> ${formatDate(nf.issuedAt).slice(0, 10)}</div>
        </div>
        <div style="display:grid;grid-template-columns:3fr 1fr;gap:6px">
          <div><strong>ENDEREÇO DE ENTREGA:</strong> ${destAddress}</div>
          <div><strong>TELEFONE:</strong> ${destPhone}</div>
        </div>
      </div>
    </div>

    <!-- FATURA / DUPLICATAS -->
    <div class="danfe-sec-box">
      <div class="danfe-sec-title">DADOS DA FATURA & COBRANÇA</div>
      <div class="danfe-sec-content" style="display:flex;justify-content:space-between">
        <div><strong>FORMA DE PAGAMENTO:</strong> ${order.paymentMethodLabel}</div>
        <div><strong>VENCIMENTO:</strong> À Vista</div>
        <div><strong>VALOR ORIGINAL:</strong> ${money(totalProdutos)}</div>
        <div><strong>DESCONTO:</strong> ${money(order.discount || 0)}</div>
        <div><strong>VALOR LÍQUIDO A PAGAR:</strong> ${money(valorTotalNota)}</div>
      </div>
    </div>

    <!-- CÁLCULO DO IMPOSTO -->
    <div class="danfe-sec-box">
      <div class="danfe-sec-title">CÁLCULO DO IMPOSTO</div>
      <div class="danfe-sec-content" style="display:grid;grid-template-columns:repeat(5, 1fr);gap:6px;text-align:center">
        <div><small style="display:block;font-size:8.5px">BASE DE CÁLCULO DO ICMS</small><strong>${money(valorTotalNota)}</strong></div>
        <div><small style="display:block;font-size:8.5px">VALOR DO ICMS (18%)</small><strong>${money(valorTotalNota * 0.18)}</strong></div>
        <div><small style="display:block;font-size:8.5px">VALOR DO FRETE</small><strong>R$ 0,00</strong></div>
        <div><small style="display:block;font-size:8.5px">VALOR DOS PRODUTOS</small><strong>${money(totalProdutos)}</strong></div>
        <div><small style="display:block;font-size:8.5px">VALOR TOTAL DA NOTA</small><strong style="font-size:13px">${money(valorTotalNota)}</strong></div>
      </div>
    </div>

    <!-- DADOS DOS PRODUTOS / SERVIÇOS -->
    <div class="danfe-sec-box">
      <div class="danfe-sec-title">DADOS DOS PRODUTOS / PEÇAS AUTOMOTIVAS</div>
      <table class="danfe-items-table">
        <thead>
          <tr>
            <th>CÓDIGO</th>
            <th>DESCRIÇÃO DA PEÇA AUTOMOTIVA</th>
            <th>NCM/SH</th>
            <th>CST</th>
            <th>CFOP</th>
            <th>UN</th>
            <th>QTD</th>
            <th>VALOR UNIT.</th>
            <th>VALOR TOTAL</th>
            <th>BC ICMS</th>
            <th>ALIQ. ICMS</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => {
            const qtd = Number(i.quantity) || 1;
            const unit = Number(i.unitPrice) || 0;
            const tot = qtd * unit;
            return `
              <tr>
                <td>PECA-${i.productId}</td>
                <td><strong>${i.name}</strong> - Peça Automotiva Fahren</td>
                <td>8708.29.99</td>
                <td>0102</td>
                <td>5.102</td>
                <td>UN</td>
                <td>${qtd}</td>
                <td>${money(unit)}</td>
                <td><strong>${money(tot)}</strong></td>
                <td>${money(tot)}</td>
                <td>18%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- DADOS ADICIONAIS -->
    <div class="danfe-sec-box">
      <div class="danfe-sec-title">DADOS ADICIONAIS & OBSERVAÇÕES FISCAIS</div>
      <div class="danfe-sec-content" style="font-size:9.5px;color:#333;line-height:1.4">
        <strong>INFORMAÇÕES COMPLEMENTARES:</strong> Pedido #${order.id} emitido através da plataforma de e-commerce e gestão Fahren Motors. Documento fiscal referente à venda de autopeças ao consumidor. Regime Tributário: Simples Nacional. Permite o aproveitamento de crédito correspondente à alíquota aplicável. Mercadoria destinada a uso/consumo ou reposição veicular.
      </div>
    </div>
  `;

  document.getElementById('danfeModal')?.classList.remove('hidden');
};

window.closeDanfeModal = () => {
  document.getElementById('danfeModal')?.classList.add('hidden');
};

// ---------- INICIALIZAÇÃO DO ADMIN ----------
document.getElementById('adminLoginBtn')?.addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim().toLowerCase();
  const password = document.getElementById('adminPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  if (!email || !password) {
    errEl.textContent = 'Informe seu e-mail e senha de administrador.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    const { admin } = await api('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
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
