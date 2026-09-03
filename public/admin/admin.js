// Painel de gestão — Fahren Parts
const API = '/api';
let editingProductId = null;
let allProducts = [];

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw new Error((data && data.error) || 'Ocorreu um erro. Tente novamente.');
  return data;
}

function money(v) { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainScreen').classList.add('hidden');
}
function showMain(admin) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
  document.getElementById('adminName').textContent = admin.name || admin.email;
  loadProducts();
}

// ---------- Login ----------
document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim().toLowerCase();
  const password = document.getElementById('adminPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  if (!email || !password) { errEl.textContent = 'Informe e-mail e senha.'; errEl.classList.remove('hidden'); return; }
  try {
    const { admin } = await api('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    showMain(admin);
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('/admin/auth/logout', { method: 'POST' }); } catch { /* ignora */ }
  showLogin();
});

// ---------- Abas ----------
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  const tab = btn.dataset.tab;
  document.getElementById('tab-estoque').classList.toggle('hidden', tab !== 'estoque');
  document.getElementById('tab-pedidos').classList.toggle('hidden', tab !== 'pedidos');
  if (tab === 'pedidos') loadOrders();
}));

// ---------- Estoque ----------
async function loadProducts() {
  const tbody = document.getElementById('productsTableBody');
  try {
    const { products } = await api('/products?in_stock=&q=' + encodeURIComponent(document.getElementById('stockSearch').value || ''));
    allProducts = products;
    renderProductsTable(products);
    fillCategoryList(products);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="error">${err.message}</td></tr>`;
  }
}

function fillCategoryList(products) {
  const list = document.getElementById('categoryList');
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
  list.innerHTML = cats.map(c => `<option value="${c}"></option>`).join('');
}

function renderProductsTable(products) {
  const tbody = document.getElementById('productsTableBody');
  if (!products.length) { tbody.innerHTML = '<tr><td colspan="6">Nenhuma peça cadastrada ainda.</td></tr>'; return; }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${p.code || '-'}</td>
      <td>${p.category || '-'}</td>
      <td>${money(p.price)}</td>
      <td>${p.stockQty}${p.inStock ? '' : ' <span class="badge">esgotado</span>'}</td>
      <td>
        <button class="btn small secondary" data-edit="${p.id}">Editar</button>
        <button class="btn small" style="background:#5b1f20" data-remove="${p.id}">Remover</button>
      </td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => startEdit(b.dataset.edit));
  tbody.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => removeProduct(b.dataset.remove));
}

document.getElementById('stockSearch').addEventListener('input', () => {
  clearTimeout(window.__stockTimer);
  window.__stockTimer = setTimeout(loadProducts, 300);
});

function startEdit(id) {
  const p = allProducts.find(x => String(x.id) === String(id));
  if (!p) return;
  editingProductId = p.id;
  document.getElementById('formTitle').textContent = `Editando: ${p.name}`;
  document.getElementById('pName').value = p.name || '';
  document.getElementById('pCode').value = p.code || '';
  document.getElementById('pCategory').value = p.category || '';
  document.getElementById('pPrice').value = String(p.price).replace('.', ',');
  document.getElementById('pStock').value = p.stockQty;
  document.getElementById('pDescription').value = p.description || '';
  document.getElementById('pPhoto').value = p.photoUrl || '';
  document.getElementById('pCompatibility').value = p.compatibility || '';
  document.getElementById('cancelEditBtn').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
function resetForm() {
  editingProductId = null;
  document.getElementById('formTitle').textContent = 'Cadastrar peça';
  ['pName', 'pCode', 'pCategory', 'pPrice', 'pStock', 'pDescription', 'pPhoto', 'pCompatibility'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('cancelEditBtn').classList.add('hidden');
}

document.getElementById('saveProductBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('productFormError'), msgEl = document.getElementById('productFormMsg');
  errEl.classList.add('hidden'); msgEl.classList.add('hidden');
  const payload = {
    name: document.getElementById('pName').value.trim(),
    code: document.getElementById('pCode').value.trim() || null,
    category: document.getElementById('pCategory').value.trim() || null,
    price: Number(document.getElementById('pPrice').value.replace(',', '.')),
    stockQty: Number(document.getElementById('pStock').value || 0),
    description: document.getElementById('pDescription').value.trim() || null,
    photoUrl: document.getElementById('pPhoto').value.trim() || null,
    compatibility: document.getElementById('pCompatibility').value.trim() || null,
  };
  if (!payload.name || !payload.price || Number.isNaN(payload.price)) {
    errEl.textContent = 'Preencha ao menos nome e preço válidos.'; errEl.classList.remove('hidden'); return;
  }
  try {
    if (editingProductId) {
      await api(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) });
      msgEl.textContent = 'Peça atualizada com sucesso.';
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      msgEl.textContent = 'Peça cadastrada com sucesso.';
    }
    msgEl.classList.remove('hidden');
    resetForm();
    loadProducts();
  } catch (err) {
    errEl.textContent = err.message; errEl.classList.remove('hidden');
  }
});

async function removeProduct(id) {
  if (!confirm('Remover esta peça do catálogo? Ela deixará de aparecer na loja.')) return;
  try {
    await api(`/products/${id}`, { method: 'DELETE' });
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Pedidos ----------
const STATUS_LABEL = { novo: 'Novo', em_preparacao: 'Em preparação', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };

async function loadOrders() {
  const tbody = document.getElementById('ordersTableBody');
  const status = document.getElementById('orderStatusFilter').value;
  try {
    const { orders } = await api('/orders' + (status ? `?status=${status}` : ''));
    if (!orders.length) { tbody.innerHTML = '<tr><td colspan="7">Nenhum pedido ainda.</td></tr>'; return; }
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td>#${o.id}</td>
        <td>${o.customerName}<div style="color:#9da2aa;font-size:12px">${o.customerPhone || ''}</div></td>
        <td>${o.items.map(i => `${i.quantity}x ${i.name}`).join('<br/>')}</td>
        <td>${money(o.total)}${o.discount ? `<div style="color:#39c979;font-size:12px">−${money(o.discount)} no Pix</div>` : ''}</td>
        <td>${o.paymentMethodLabel || '—'}</td>
        <td>${new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
        <td>
          <select class="status-select" data-order="${o.id}">
            ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('');
    tbody.querySelectorAll('.status-select').forEach(sel => sel.addEventListener('change', () => updateOrderStatus(sel.dataset.order, sel.value)));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="error">${err.message}</td></tr>`;
  }
}
document.getElementById('orderStatusFilter').addEventListener('change', loadOrders);

async function updateOrderStatus(id, status) {
  try {
    await api(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  } catch (err) {
    alert(err.message);
    loadOrders();
  }
}

// ---------- Inicialização: verifica se já existe sessão de admin ----------
(async () => {
  try {
    const { admin } = await api('/admin/auth/me');
    if (admin) showMain(admin); else showLogin();
  } catch {
    showLogin();
  }
})();
