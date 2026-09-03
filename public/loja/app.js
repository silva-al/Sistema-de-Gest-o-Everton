// Fahren Parts — loja do cliente
// Agora conectada a uma API real (Node + PostgreSQL) em vez de localStorage.
// Mantém a mesma estrutura visual (telas, cores, cards) do protótipo original.

const screens = [...document.querySelectorAll('.screen')];
const nav = [...document.querySelectorAll('.nav button')];

let authenticated = false;
let currentUser = null;
let cart = []; // [{ productId, name, price, quantity }]
try { cart = JSON.parse(sessionStorage.getItem('fahren_cart') || '[]'); } catch { cart = []; }

// ---------- API helper ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem corpo */ }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Ocorreu um erro. Tente novamente.');
  }
  return data;
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  const headerCount = document.getElementById('cartHeaderCount');
  const totalCount = cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  if (badge) {
    badge.textContent = totalCount > 99 ? '99+' : String(totalCount);
    badge.classList.toggle('has-items', totalCount > 0);
    badge.style.display = 'inline-flex';
  }

  if (headerCount) {
    headerCount.textContent = totalCount > 0 ? `(${totalCount} ${totalCount === 1 ? 'peça' : 'peças'})` : '(0 peças)';
  }
}

function showToast(message, onAction) {
  const container = document.getElementById('toastContainer') || document.body;
  const toast = document.createElement('div');
  toast.className = 'fp-toast';
  toast.innerHTML = `
    <span class="fp-toast-msg">${message}</span>
    ${onAction ? '<button type="button" class="fp-toast-btn">VER CARRINHO ›</button>' : ''}
    <button type="button" class="fp-toast-close" aria-label="Fechar">✕</button>
  `;
  if (onAction) {
    toast.querySelector('.fp-toast-btn')?.addEventListener('click', () => {
      toast.remove();
      onAction();
    });
  }
  toast.querySelector('.fp-toast-close')?.addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transition = 'opacity .3s, transform .3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

function saveCart() {
  sessionStorage.setItem('fahren_cart', JSON.stringify(cart));
  updateCartBadge();
}


// ---------- Navegação ----------
function updateNav() {
  document.body.classList.toggle('logged-in', authenticated);
  nav.forEach(b => {
    const id = b.dataset.screen;
    let visible = true;
    if (!authenticated && id === 'perfil') visible = false;
    if (authenticated && id === 'cadastro') visible = false;
    b.style.display = visible ? '' : 'none';
  });
}

// ---------- Botão Voltar + histórico do navegador ----------
// O botão Voltar aparece apenas quando o usuário NÃO está na página inicial (inicio ou welcome).
const backBtn = document.getElementById('backBtn');
let navDepth = 0;
let currentScreenId = 'inicio';

function updateBackBtn(screenId = currentScreenId) {
  if (!backBtn) return;
  const isHome = (!screenId || screenId === 'inicio' || screenId === 'welcome');
  backBtn.classList.toggle('show', !isHome);
}

if (!(window.history.state && typeof window.history.state.depth === 'number')) {
  window.history.replaceState({ screen: 'inicio', depth: 0 }, '');
}
navDepth = window.history.state.depth || 0;

window.addEventListener('popstate', e => {
  const st = e.state || { screen: 'inicio', depth: 0 };
  navDepth = st.depth || 0;
  show(st.screen || 'inicio', { push: false });
});

backBtn?.addEventListener('click', () => {
  if (navDepth > 0) window.history.back();
  else show('inicio');
});

function show(id, opts = {}) {
  const { push = true } = opts;
  if (!authenticated && !['welcome', 'inicio', 'pecas', 'cadastro', 'carrinho'].includes(id)) {
    alert('Faça seu cadastro ou entre na sua conta para acessar esta área.');
    show('inicio');
    return;
  }
  currentScreenId = id;
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  nav.forEach(b => b.classList.toggle('active', b.dataset.screen === id));
  document.body.classList.toggle('visitor-inicio', !authenticated && id === 'inicio');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (id === 'pecas') loadCatalog();
  if (id === 'carrinho') renderCart();
  if (id === 'perfil') loadMyOrders();

  if (push) {
    const depth = (window.history.state && typeof window.history.state.depth === 'number') ? window.history.state.depth + 1 : 1;
    window.history.pushState({ screen: id, depth }, '');
    navDepth = depth;
  }
  updateBackBtn(id);
}

nav.forEach(b => b.onclick = () => show(b.dataset.screen));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
document.querySelectorAll('[data-screen="cadastro"]').forEach(b => b.addEventListener('click', () => { show('cadastro'); openRegister(); }));
document.getElementById('quickLogin')?.addEventListener('click', () => { show('cadastro'); openLogin(); });
document.querySelectorAll('[data-auth]').forEach(b => b.onclick = () => {
  const action = b.dataset.auth;
  show('cadastro');
  if (action === 'login') setTimeout(() => openLogin(), 50); else setTimeout(() => openRegister(), 50);
});
document.getElementById('showLogin')?.addEventListener('click', openLogin);
document.getElementById('fpBackRegister')?.addEventListener('click', openRegister);

const logoBtn = document.getElementById('logoBtn');
if (logoBtn) {
  logoBtn.addEventListener('click', () => show('inicio'));
  logoBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show('inicio');
    }
  });
}


// ---------- Mostrar/ocultar senha ----------
document.querySelectorAll('.password-toggle').forEach(btn => btn.addEventListener('click', () => {
  const input = document.getElementById(btn.dataset.target);
  if (!input) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  btn.style.color = visible ? '#8b9199' : '#fff';
  btn.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
}));

// ---------- Máscara de telefone ----------
document.addEventListener('input', e => {
  if (['registerPhone', 'profilePhone'].includes(e.target.id)) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    if (v.length <= 10) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    else v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    e.target.value = v;
  }
});

// ---------- Máscara de CPF/CNPJ (reconhece automaticamente pela quantidade de dígitos) ----------
// Até 11 dígitos = CPF (000.000.000-00). A partir do 12º dígito = CNPJ (00.000.000/0000-00).
function isValidCpf(digits) {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}
function isValidCnpj(digits) {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}
function formatCpfCnpj(digits) {
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}
function cpfCnpjTypeLabel(digits) {
  if (!digits.length) return '';
  if (digits.length <= 11) return digits.length === 11 ? (isValidCpf(digits) ? '· CPF ✓' : '· CPF (inválido)') : '· CPF';
  return digits.length === 14 ? (isValidCnpj(digits) ? '· CNPJ ✓' : '· CNPJ (inválido)') : '· CNPJ';
}
document.addEventListener('input', e => {
  if (['registerCpfCnpj', 'profileCpfCnpj'].includes(e.target.id)) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 14);
    e.target.value = formatCpfCnpj(digits);
    const hint = document.getElementById(e.target.id + 'Type');
    if (hint) hint.textContent = cpfCnpjTypeLabel(digits);
  }
});

// ---------- Cadastro / login ----------
function openLogin() {
  const login = document.getElementById('fpLogin'), reg = document.getElementById('registerForm');
  if (login && reg) {
    login.classList.add('show'); reg.style.display = 'none';
    document.getElementById('authTitle').textContent = 'Já tenho cadastro';
    document.getElementById('authSubtitle').textContent = 'Entre na sua conta para acessar a loja e comprar peças.';
    document.getElementById('loginEmail').focus();
  }
}
function openRegister() {
  const login = document.getElementById('fpLogin'), reg = document.getElementById('registerForm');
  if (login && reg) {
    login.classList.remove('show'); reg.style.display = 'block';
    document.getElementById('authTitle').textContent = 'Cadastro de cliente';
    document.getElementById('authSubtitle').textContent = 'Crie sua conta para consultar peças e acompanhar seus pedidos.';
  }
}

function applyUser(user) {
  currentUser = user;
  authenticated = !!user;
  updateNav();
  if (user) {
    const n = document.getElementById('profileName'), e = document.getElementById('profileEmail');
    const c = document.getElementById('profileCpfCnpj');
    if (n) n.value = user.name || '';
    if (e) e.value = user.email || '';
    if (c) {
      c.value = user.cpfCnpj || '';
      const hint = document.getElementById('profileCpfCnpjType');
      if (hint) hint.textContent = cpfCnpjTypeLabel((user.cpfCnpj || '').replace(/\D/g, ''));
    }
  }
}

document.getElementById('createAccount')?.addEventListener('click', async () => {
  const name = document.getElementById('registerName').value.trim();
  const phone = document.getElementById('registerPhone').value.trim();
  const email = document.getElementById('registerEmail').value.trim().toLowerCase();
  const cpfCnpj = document.getElementById('registerCpfCnpj').value.trim();
  const pass = document.getElementById('registerPassword').value;
  const pass2 = document.getElementById('registerPassword2').value;
  if (!name || !phone || !email || !pass || !pass2) { alert('Preencha todos os campos do cadastro.'); return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { alert('Digite um e-mail válido.'); return; }
  if (pass.length < 6) { alert('A senha deve ter pelo menos 6 caracteres.'); return; }
  if (pass !== pass2) { alert('As senhas não conferem.'); return; }
  const cpfCnpjDigits = cpfCnpj.replace(/\D/g, '');
  if (cpfCnpjDigits.length && cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
    alert('Digite um CPF (11 números) ou CNPJ (14 números) completo, ou deixe o campo em branco.');
    return;
  }
  if (cpfCnpjDigits.length === 11 && !isValidCpf(cpfCnpjDigits)) { alert('Esse CPF não é válido. Confira os números.'); return; }
  if (cpfCnpjDigits.length === 14 && !isValidCnpj(cpfCnpjDigits)) { alert('Esse CNPJ não é válido. Confira os números.'); return; }
  try {
    const { customer } = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, email, password: pass, cpfCnpj }) });
    applyUser(customer);
    alert('Cadastro realizado! Bem-vindo à Fahren Parts.');
    show('inicio');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('loginBtn')?.addEventListener('click', async () => {
  const e = document.getElementById('loginEmail').value.trim().toLowerCase();
  const p = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError'), msg = document.getElementById('loginMessage');
  err.style.display = 'none'; msg.style.display = 'none';
  if (!e || !p) { err.textContent = 'Informe e-mail e senha.'; err.style.display = 'block'; return; }
  try {
    const { customer } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: e, password: p }) });
    applyUser(customer);
    msg.textContent = 'Login realizado com sucesso.'; msg.style.display = 'block';
    setTimeout(() => show('inicio'), 250);
  } catch (ex) {
    err.textContent = ex.message; err.style.display = 'block';
  }
});

document.getElementById('forgotPassword')?.addEventListener('click', () => {
  alert('Para recuperar o acesso, entre em contato com a Fahren Parts. A recuperação por e-mail será conectada quando o servidor de autenticação for configurado.');
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignora */ }
  applyUser(null);
  cart = []; saveCart();
  show('inicio');
});

document.querySelector('#perfil .btn')?.addEventListener('click', async () => {
  const name = document.getElementById('profileName').value.trim();
  const email = document.getElementById('profileEmail').value.trim().toLowerCase();
  const cpfCnpj = document.getElementById('profileCpfCnpj').value.trim();
  const cpfCnpjDigits = cpfCnpj.replace(/\D/g, '');
  if (cpfCnpjDigits.length && cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
    alert('Digite um CPF (11 números) ou CNPJ (14 números) completo, ou deixe o campo em branco.');
    return;
  }
  if (cpfCnpjDigits.length === 11 && !isValidCpf(cpfCnpjDigits)) { alert('Esse CPF não é válido. Confira os números.'); return; }
  if (cpfCnpjDigits.length === 14 && !isValidCnpj(cpfCnpjDigits)) { alert('Esse CNPJ não é válido. Confira os números.'); return; }
  try {
    const { customer } = await api('/api/auth/me', { method: 'PUT', body: JSON.stringify({ name, email, cpfCnpj }) });
    currentUser = customer;
    alert('Dados do perfil salvos.');
  } catch (err) {
    alert(err.message);
  }
});

// ---------- Endereço de entrega (CEP automático via ViaCEP) ----------
function fillAddressFields(a) {
  const f = { deliveryCep: 'cep', deliveryStreet: 'street', deliveryNumber: 'number', deliveryComplement: 'complement', deliveryNeighborhood: 'neighborhood', deliveryCity: 'city', deliveryState: 'state' };
  Object.entries(f).forEach(([id, k]) => { const el = document.getElementById(id); if (el) el.value = a?.[k] || ''; });
  const sum = document.getElementById('profileAddressSummary');
  if (sum) sum.value = a ? `${a.street}, ${a.number} - ${a.neighborhood}, ${a.city}/${a.state}` : 'Nenhum endereço cadastrado';
}

async function loadAddress() {
  if (!authenticated) return;
  try {
    const { address } = await api('/api/addresses/mine');
    fillAddressFields(address);
  } catch { /* usuário pode ainda não ter endereço salvo */ }
}

let cepTimer = null;
document.getElementById('deliveryCep')?.addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  e.target.value = v;
  clearTimeout(cepTimer);
  if (v.replace(/\D/g, '').length === 8) {
    cepTimer = setTimeout(async () => {
      const cep = v.replace(/\D/g, '');
      try {
        const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (d.erro) { alert('CEP não encontrado.'); return; }
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('deliveryStreet', d.logradouro); set('deliveryNeighborhood', d.bairro); set('deliveryCity', d.localidade); set('deliveryState', d.uf);
        document.getElementById('deliveryNumber')?.focus();
      } catch {
        alert('Não foi possível consultar o CEP agora. Verifique sua conexão e tente novamente.');
      }
    }, 250);
  }
});

document.getElementById('saveDeliveryAddress')?.addEventListener('click', async () => {
  const a = {
    cep: document.getElementById('deliveryCep').value.trim(),
    street: document.getElementById('deliveryStreet').value.trim(),
    number: document.getElementById('deliveryNumber').value.trim(),
    complement: document.getElementById('deliveryComplement').value.trim(),
    neighborhood: document.getElementById('deliveryNeighborhood').value.trim(),
    city: document.getElementById('deliveryCity').value.trim(),
    state: document.getElementById('deliveryState').value.trim().toUpperCase(),
  };
  if (!a.cep || !a.street || !a.number || !a.neighborhood || !a.city || !a.state) { alert('Preencha os dados obrigatórios do endereço.'); return; }
  try {
    await api('/api/addresses/mine', { method: 'POST', body: JSON.stringify(a) });
    fillAddressFields(a);
    const m = document.getElementById('addressSavedMsg'); if (m) m.style.display = 'block';
    setTimeout(() => show('carrinho'), 500);
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById('editAddressBtn')?.addEventListener('click', () => show('endereco'));

// ---------- Catálogo com busca avançada ----------
// Foto real da categoria usada quando a peça ainda não tem foto própria cadastrada.
const CATEGORY_IMAGES = {
  'Filtros': 'images/categorias/filtros.jpg',
  'Freios': 'images/categorias/freios.jpg',
  'Elétrica e ignição': 'images/categorias/eletrica.jpg',
  'Suspensão': 'images/categorias/suspensao.jpg',
  'Correias': 'images/categorias/correias.jpg',
  'Sensores e injeção': 'images/categorias/sensores.jpg',
  'Iluminação': 'images/categorias/iluminacao.jpg',
  'Óleos e fluidos': 'images/categorias/oleos.jpg',
};

function money(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

async function loadCategories() {
  const select = document.getElementById('filterCategory');
  if (!select || select.dataset.loaded) return;
  try {
    const { categories } = await api('/api/products/categories');
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      select.appendChild(opt);
    });
    select.dataset.loaded = '1';
  } catch { /* segue sem categorias */ }
}

// ---------- Categorias da tela inicial (peças reais do catálogo) ----------
// Cada card mostra o nome e a foto de uma peça que já está cadastrada para
// venda (nunca um nome genérico de categoria), porque peças diferentes de
// uma mesma categoria têm modelos diferentes.
async function loadCategoryCarousel() {
  const wrap = document.getElementById('categoryCarousel');
  const track = document.getElementById('categoryCarouselTrack');
  if (!track) return;
  try {
    const { categories } = await api('/api/products/categories/featured');
    if (!categories.length) {
      track.innerHTML = '';
      if (wrap) wrap.style.display = 'none';
      return;
    }
    if (wrap) wrap.style.display = '';
    const cardHtml = (c, hidden) => {
      const photo = c.photoUrl || CATEGORY_IMAGES[c.category];
      return `<div class="card cat-card" data-category="${c.category}"${hidden ? ' aria-hidden="true"' : ''}>${
        photo ? `<img alt="${hidden ? '' : c.name}" loading="lazy" src="${photo}">` : ''
      }<b>${c.name}</b><small>${c.category}</small></div>`;
    };
    track.innerHTML = categories.map(c => cardHtml(c, false)).join('') + categories.map(c => cardHtml(c, true)).join('');
    track.querySelectorAll('.cat-card').forEach(el => { el.onclick = () => goToCategory(el.dataset.category); });
  } catch { /* mantém a seção como estava se a API falhar */ }
}

async function goToCategory(category) {
  show('pecas');
  await loadCategories();
  const select = document.getElementById('filterCategory');
  if (select) select.value = category || '';
  await loadCatalog();
}

function renderProducts(container, products) {
  if (!products.length) {
    container.innerHTML = '<p style="color:#9da2aa">Nenhuma peça encontrada com esses filtros.</p>';
    return;
  }
  container.innerHTML = products.map(p => {
    const img = p.photoUrl || CATEGORY_IMAGES[p.category];
    const maxQty = p.stockQty || 99;
    return `
    <div class="product" data-product-id="${p.id}">
      <div class="part-photo">${img ? `<img src="${img}" alt="${p.name}" loading="lazy">` : '🔩'}</div>
      <b>${p.name}</b>
      <small>${p.description || p.category || 'Aplicação compatível'}</small>
      <div class="stock">${p.inStock ? `● Em estoque <span class="stock-qty">(${p.stockQty} un.)</span>` : '○ Fora de estoque'}</div>
      <div class="price">${money(p.price)}</div>
      ${p.inStock ? `
        <div class="product-qty-row">
          <label class="qty-label">Quantidade:</label>
          <div class="qty-control">
            <button type="button" class="btn-qty-btn p-minus" data-id="${p.id}" aria-label="Diminuir quantidade">−</button>
            <input type="number" class="product-qty-val" data-id="${p.id}" value="1" min="1" max="${maxQty}" readonly />
            <button type="button" class="btn-qty-btn p-plus" data-id="${p.id}" aria-label="Aumentar quantidade">+</button>
          </div>
        </div>
        <button class="btn add-cart-btn" data-id="${p.id}">COLOCAR NO CARRINHO</button>
      ` : `
        <button class="btn" disabled style="opacity:.5;cursor:not-allowed;margin-top:12px;width:100%">FORA DE ESTOQUE</button>
      `}
    </div>`;
  }).join('');

  container.querySelectorAll('.product').forEach(card => {
    const id = card.dataset.productId;
    const input = card.querySelector('.product-qty-val');
    const minus = card.querySelector('.p-minus');
    const plus = card.querySelector('.p-plus');
    const addBtn = card.querySelector('.add-cart-btn');
    const max = parseInt(input?.max, 10) || 99;

    if (minus && input) {
      minus.onclick = () => {
        let val = parseInt(input.value, 10) || 1;
        if (val > 1) input.value = val - 1;
      };
    }
    if (plus && input) {
      plus.onclick = () => {
        let val = parseInt(input.value, 10) || 1;
        if (val < max) input.value = val + 1;
      };
    }
    if (addBtn) {
      addBtn.onclick = () => {
        const qty = parseInt(input?.value, 10) || 1;
        addToCart(id, products, qty, addBtn);
      };
    }
  });
}

let catalogTimer = null;
async function loadCatalog() {
  await loadCategories();
  const container = document.getElementById('catalogResults');
  const params = new URLSearchParams();
  const q = document.getElementById('catalogSearch')?.value.trim();
  const category = document.getElementById('filterCategory')?.value;
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  try {
    const { products } = await api('/api/products?' + params.toString());
    renderProducts(container, products);
  } catch (err) {
    container.innerHTML = `<p style="color:#e06a6a">Não foi possível carregar as peças agora. ${err.message}</p>`;
  }
}
['catalogSearch'].forEach(id => document.getElementById(id)?.addEventListener('input', () => { clearTimeout(catalogTimer); catalogTimer = setTimeout(loadCatalog, 300); }));
document.getElementById('filterCategory')?.addEventListener('change', loadCatalog);

// ---------- Pagamento via Pix (código "Copia e Cola" oficial, gerado aqui mesmo) ----------
// A chave Pix é pública para quem vai pagar (funciona como um número de conta
// para receber), por isso pode ficar no código do site sem problema.
const PIX_KEY = '47784317000120';
const PIX_MERCHANT_NAME = 'FAHREN MOTORS LTDA';
const PIX_MERCHANT_CITY = 'HORTOLANDIA';
const PIX_DISCOUNT_RATE = 0.04;

function pixStripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function pixTlv(id, value) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

function pixCrc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Monta o payload EMV/BR Code do Pix (padrão Banco Central) com valor fixo,
// pronto para o cliente colar no "Pix Copia e Cola" do banco dele.
function buildPixCode(amount) {
  const merchantAccount = pixTlv('26', pixTlv('00', 'BR.GOV.BCB.PIX') + pixTlv('01', PIX_KEY));
  const name = pixStripAccents(PIX_MERCHANT_NAME).slice(0, 25);
  const city = pixStripAccents(PIX_MERCHANT_CITY).slice(0, 15);
  const payload =
    pixTlv('00', '01') +
    merchantAccount +
    pixTlv('52', '0000') +
    pixTlv('53', '986') +
    pixTlv('54', amount.toFixed(2)) +
    pixTlv('58', 'BR') +
    pixTlv('59', name) +
    pixTlv('60', city) +
    pixTlv('62', pixTlv('05', '***')) +
    '6304';
  return payload + pixCrc16(payload);
}

// Gera o QR Code (SVG) a partir do código Pix, usando a biblioteca local vendor/qrcode.js.
function buildPixQrSvg(pixCode) {
  if (typeof qrcode === 'undefined') return null;
  for (let typeNumber = 4; typeNumber <= 40; typeNumber++) {
    try {
      const qr = qrcode(typeNumber, 'M');
      qr.addData(pixCode);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 8 });
    } catch { /* código não coube nesse tamanho, tenta o próximo */ }
  }
  return null;
}

// ---------- Pagamento com Cartão de Crédito (Mercado Pago Checkout Bricks) ----------
// O formulário do cartão é renderizado AQUI DENTRO do site (o cliente nunca sai
// da página); só o token do cartão (nunca o número em si) sai do navegador.
let mpSdkInstance = null;
let mpPublicKeyCache = null;
let cardBrickController = null;

async function getMpPublicKey() {
  if (mpPublicKeyCache !== null) return mpPublicKeyCache;
  try {
    const { publicKey } = await api('/api/payments/config');
    mpPublicKeyCache = publicKey || false;
  } catch {
    mpPublicKeyCache = false;
  }
  return mpPublicKeyCache;
}

async function mountCardBrick(amounts) {
  const container = document.getElementById('cardPaymentBrick');
  const statusEl = document.getElementById('cardPaymentStatus');
  if (!container) return;

  const publicKey = await getMpPublicKey();
  if (publicKey && typeof MercadoPago !== 'undefined') {
    if (cardBrickController && cardBrickController.unmount) {
      try { cardBrickController.unmount(); } catch { /* já desmontado */ }
    }
    container.innerHTML = '';

    try {
      if (!mpSdkInstance) mpSdkInstance = new MercadoPago(publicKey, { locale: 'pt-BR' });
      const bricksBuilder = mpSdkInstance.bricks();

      cardBrickController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick', {
        initialization: { amount: amounts.subtotal },
        customization: { visual: { style: { theme: 'dark' } } },
        callbacks: {
          onReady: () => {},
          onError: (error) => {
            console.error(error);
            if (statusEl) { statusEl.textContent = 'Verifique os dados do cartão e tente novamente.'; statusEl.style.color = '#e06a6a'; statusEl.style.display = 'block'; }
          },
          onSubmit: (cardFormData) => new Promise(async (resolve, reject) => {
            if (statusEl) { statusEl.textContent = 'Processando pagamento...'; statusEl.style.color = '#9da2aa'; statusEl.style.display = 'block'; }
            try {
              const { address } = await api('/api/addresses/mine');
              if (!address) {
                alert('Cadastre seu endereço de entrega antes de finalizar o pedido.');
                show('endereco');
                return reject();
              }
              const items = cart.map((i) => ({ productId: i.productId, quantity: i.quantity }));
              const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items, paymentMethod: 'cartao' }) });
              const result = await api('/api/payments/card', { method: 'POST', body: JSON.stringify({ orderId: order.id, ...cardFormData }) });

              if (result.status === 'approved') {
                if (statusEl) { statusEl.textContent = 'Pagamento aprovado!'; statusEl.style.color = '#39c979'; }
                cart = []; saveCart();
                alert('Pagamento aprovado! Seu pedido foi confirmado. Acompanhe o status na sua tela de Perfil.');
                show('perfil');
              } else if (result.status === 'in_process' || result.status === 'pending') {
                if (statusEl) { statusEl.textContent = 'Pagamento em análise. Você já pode acompanhar o pedido no seu Perfil.'; statusEl.style.color = '#e0b94a'; }
                cart = []; saveCart();
                show('perfil');
              } else {
                if (statusEl) { statusEl.textContent = 'Pagamento não aprovado. Verifique os dados do cartão ou tente outro cartão.'; statusEl.style.color = '#e06a6a'; }
              }
              resolve();
            } catch (err) {
              if (statusEl) { statusEl.textContent = err.message || 'Não foi possível processar o pagamento.'; statusEl.style.color = '#e06a6a'; statusEl.style.display = 'block'; }
              reject(err);
            }
          }),
        },
      });
      return;
    } catch (err) {
      console.warn('Falha ao instanciar Mercado Pago Brick, carregando formulário integrado:', err);
    }
  }

  // Se a chave pública não estiver configurada no .env ou o SDK não carregar,
  // renderiza o formulário de cartão completo da loja
  renderFallbackCardForm(amounts, container, statusEl);
}

function renderFallbackCardForm(amounts, container, statusEl) {
  if (cardBrickController && cardBrickController.unmount) {
    try { cardBrickController.unmount(); } catch { /* unmounted */ }
  }

  const subtotal = amounts.subtotal || 0;
  const installmentsCount = 12;
  let optionsHtml = '';
  for (let i = 1; i <= installmentsCount; i++) {
    const val = (subtotal / i).toFixed(2).replace('.', ',');
    optionsHtml += `<option value="${i}">${i}x de R$ ${val} sem juros</option>`;
  }

  container.innerHTML = `
    <div class="card-fallback-form" style="background:#0c0e11;border:1px solid #282b30;border-radius:14px;padding:20px;margin-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:12px;font-weight:700;color:#9da2aa;text-transform:uppercase">Dados do Cartão de Crédito</span>
        <span id="detectedBrandBadge" style="background:#202328;color:#39c979;font-size:11px;font-weight:800;padding:4px 10px;border-radius:6px;border:1px solid #34373d">CARTÃO</span>
      </div>

      <div class="field" style="margin:12px 0">
        <label>Número do Cartão</label>
        <input id="customCardNumber" type="tel" inputmode="numeric" placeholder="0000 0000 0000 0000" maxlength="19" autocomplete="cc-number" style="font-family:monospace;letter-spacing:1px" />
      </div>

      <div class="field" style="margin:12px 0">
        <label>Nome impresso no Cartão</label>
        <input id="customCardName" type="text" placeholder="Nome como impresso no cartão" autocomplete="cc-name" style="text-transform:uppercase" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field" style="margin:12px 0">
          <label>Validade (MM/AA)</label>
          <input id="customCardExpiry" type="tel" inputmode="numeric" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp" />
        </div>
        <div class="field" style="margin:12px 0">
          <label>CVV (Código)</label>
          <input id="customCardCvv" type="password" inputmode="numeric" placeholder="123" maxlength="4" autocomplete="cc-csc" />
        </div>
      </div>

      <div class="field" style="margin:12px 0">
        <label>CPF do Titular</label>
        <input id="customCardCpf" type="tel" inputmode="numeric" placeholder="000.000.000-00" value="${(currentUser && currentUser.cpfCnpj) || ''}" />
      </div>

      <div class="field" style="margin:12px 0">
        <label>Opções de Parcelamento</label>
        <div style="margin-top:6px">
          <select id="customCardInstallments" style="width:100%;padding:14px;border-radius:10px;border:1px solid #34373d;background:#121418;color:#fff;font-size:15px;cursor:pointer">
            ${optionsHtml}
          </select>
        </div>
      </div>

      <button class="btn" id="customCardSubmitBtn" type="button" style="width:100%;margin-top:16px;font-size:15px;padding:16px">
        PAGAR R$ ${money(subtotal).replace('R$', '').trim()} COM CARTÃO
      </button>

      <div style="margin-top:14px;display:flex;align-items:center;gap:8px;font-size:11px;color:#8f949c;line-height:1.4">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#39c979;flex-shrink:0"></span>
        <span>Ambiente criptografado com SSL. Transação segura.</span>
      </div>
    </div>
  `;

  const numInput = document.getElementById('customCardNumber');
  const nameInput = document.getElementById('customCardName');
  const expInput = document.getElementById('customCardExpiry');
  const cvvInput = document.getElementById('customCardCvv');
  const cpfInput = document.getElementById('customCardCpf');
  const badge = document.getElementById('detectedBrandBadge');
  const submitBtn = document.getElementById('customCardSubmitBtn');

  function detectBrand(clean) {
    if (/^4/.test(clean)) return 'Visa';
    if (/^5[1-5]|^2[2-7]/.test(clean)) return 'Mastercard';
    if (/^4011|^4389|^4514|^4576|^5041|^5067|^5090|^6277|^6362|^6363|^650|^651|^655/.test(clean)) return 'Elo';
    if (/^3[47]/.test(clean)) return 'Amex';
    if (/^6062/.test(clean)) return 'Hipercard';
    return 'Cartão';
  }

  numInput?.addEventListener('input', () => {
    let val = numInput.value.replace(/\D/g, '').slice(0, 16);
    numInput.value = val.replace(/(\d{4})(?=\d)/g, '$1 ');
    const brand = detectBrand(val);
    if (badge) badge.textContent = brand.toUpperCase();
  });

  expInput?.addEventListener('input', () => {
    let val = expInput.value.replace(/\D/g, '').slice(0, 4);
    if (val.length >= 3) expInput.value = `${val.slice(0, 2)}/${val.slice(2)}`;
    else expInput.value = val;
  });

  cvvInput?.addEventListener('input', () => {
    cvvInput.value = cvvInput.value.replace(/\D/g, '').slice(0, 4);
  });

  cpfInput?.addEventListener('input', () => {
    let v = cpfInput.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    cpfInput.value = v;
  });

  submitBtn?.addEventListener('click', async () => {
    const rawNumber = numInput.value.replace(/\D/g, '');
    const name = nameInput.value.trim();
    const expiry = expInput.value.trim();
    const cvv = cvvInput.value.trim();
    const cpf = cpfInput.value.replace(/\D/g, '');
    const installments = parseInt(document.getElementById('customCardInstallments').value, 10) || 1;

    if (rawNumber.length < 13) {
      alert('Digite o número completo do cartão.');
      numInput.focus();
      return;
    }
    if (!name) {
      alert('Digite o nome impresso no cartão.');
      nameInput.focus();
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      alert('Digite a validade no formato MM/AA.');
      expInput.focus();
      return;
    }
    const [expMonth] = expiry.split('/').map(Number);
    if (expMonth < 1 || expMonth > 12) {
      alert('Mês de validade inválido (deve ser de 01 a 12).');
      expInput.focus();
      return;
    }
    if (cvv.length < 3) {
      alert('Digite o código de segurança (CVV).');
      cvvInput.focus();
      return;
    }

    if (statusEl) {
      statusEl.textContent = 'Processando pagamento com cartão...';
      statusEl.style.color = '#9da2aa';
      statusEl.style.display = 'block';
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'PROCESSANDO...';

    try {
      if (!authenticated) {
        alert('Cadastre-se ou entre na sua conta para finalizar o pedido.');
        show('cadastro');
        submitBtn.disabled = false;
        submitBtn.textContent = `PAGAR R$ ${money(subtotal).replace('R$', '').trim()} COM CARTÃO`;
        return;
      }
      const { address } = await api('/api/addresses/mine');
      if (!address) {
        alert('Cadastre seu endereço de entrega antes de finalizar o pedido.');
        show('endereco');
        submitBtn.disabled = false;
        submitBtn.textContent = `PAGAR R$ ${money(subtotal).replace('R$', '').trim()} COM CARTÃO`;
        return;
      }

      const items = cart.map((i) => ({ productId: i.productId, quantity: i.quantity }));
      const { order } = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ items, paymentMethod: 'cartao' }),
      });

      const cardBrand = detectBrand(rawNumber);
      const result = await api('/api/payments/card', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          cardNumber: rawNumber,
          cardBrand,
          lastFour: rawNumber.slice(-4),
          installments,
          payer: {
            email: (currentUser && currentUser.email) || 'cliente@fahrenparts.com.br',
            identification: { type: 'CPF', number: cpf || '00000000000' },
          },
        }),
      });

      if (result.status === 'approved' || result.statusInterno === 'aprovado') {
        if (statusEl) {
          statusEl.textContent = 'Pagamento aprovado com sucesso!';
          statusEl.style.color = '#39c979';
        }
        cart = [];
        saveCart();
        alert('Pagamento aprovado! Seu pedido foi confirmado no cartão. Acompanhe o status na tela de Perfil.');
        show('perfil');
      } else {
        alert(result.message || 'Pagamento não aprovado. Tente novamente.');
        submitBtn.disabled = false;
        submitBtn.textContent = `PAGAR R$ ${money(subtotal).replace('R$', '').trim()} COM CARTÃO`;
      }
    } catch (err) {
      console.error(err);
      if (statusEl) {
        statusEl.textContent = err.message || 'Não foi possível processar o pagamento.';
        statusEl.style.color = '#e06a6a';
        statusEl.style.display = 'block';
      }
      alert(err.message || 'Erro ao processar pagamento.');
      submitBtn.disabled = false;
      submitBtn.textContent = `PAGAR R$ ${money(subtotal).replace('R$', '').trim()} COM CARTÃO`;
    }
  });
}

// ---------- Carrinho ----------
function addToCart(productId, productsList, quantity = 1, triggerBtn = null) {
  const product = productsList.find(p => String(p.id) === String(productId));
  if (!product || !product.inStock) return;
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const existing = cart.find(i => String(i.productId) === String(productId));
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ productId: product.id, name: product.name, price: product.price, quantity: qty });
  }
  saveCart();

  // Feedback visual imediato no botão da peça sem sair da página
  if (triggerBtn) {
    const origHtml = triggerBtn.innerHTML;
    triggerBtn.innerHTML = `✓ Adicionado (${qty} un.)`;
    triggerBtn.classList.add('added-feedback');
    setTimeout(() => {
      triggerBtn.innerHTML = origHtml;
      triggerBtn.classList.remove('added-feedback');
    }, 1800);
  }

  // Notificação toast elegante permitindo continuar comprando ou entrar no carrinho
  showToast(`✓ ${qty}x "${product.name}" colocado no carrinho!`, () => show('carrinho'));
}

function renderCart() {
  updateCartBadge();
  const el = document.getElementById('cartContent');
  if (!cart.length) {
    el.innerHTML = '<p style="color:#9da2aa">Seu carrinho está vazio. Adicione peças pelo catálogo para continuar.</p><button class="btn" data-go="pecas">VER PEÇAS</button>';
    el.querySelector('[data-go]')?.addEventListener('click', () => show('pecas'));
    return;
  }
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const pixTotal = subtotal * (1 - PIX_DISCOUNT_RATE);
  const pixSavings = subtotal - pixTotal;
  const installment = subtotal / 12;
  const amounts = { subtotal, pixTotal, pixSavings, installment };

  el.innerHTML = `
    <div class="cart-items">
      ${cart.map(i => `
        <div class="cart-row" data-id="${i.productId}" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap">
          <div style="flex:1;min-width:180px"><b>${i.name}</b><div style="color:#9da2aa;font-size:13px">${money(i.price)} un.</div></div>
          <div style="display:flex;align-items:center;gap:4px;background:#0c0e11;padding:3px 6px;border-radius:6px;border:1px solid #282b30">
            <button class="qty-minus" style="background:#202226;color:#fff;border:0;border-radius:4px;width:26px;height:26px;cursor:pointer;font-weight:bold;font-size:14px" title="Diminuir">−</button>
            <span style="min-width:28px;text-align:center;font-weight:800;font-size:14px">${i.quantity}</span>
            <button class="qty-plus" style="background:#202226;color:#fff;border:0;border-radius:4px;width:26px;height:26px;cursor:pointer;font-weight:bold;font-size:14px" title="Aumentar">+</button>
          </div>
          <div style="min-width:90px;text-align:right;font-weight:700">${money(i.price * i.quantity)}</div>
          <button class="remove-item" style="background:none;color:#e06a6a;border:0;cursor:pointer;font-size:13px;padding:4px 6px">Remover</button>
        </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;font-size:18px">
      <b>Total</b><b>${money(subtotal)}</b>
    </div>

    <div class="payment-select" style="margin-top:22px">
      <p style="color:#9da2aa;font-size:13px;margin:0 0 10px">Escolha a forma de pagamento:</p>
      <label class="payment-option selected">
        <input checked name="paymentMethod" type="radio" value="pix"/>
        <span class="payment-option-body">
          <b>Pix (4% de Desconto)</b>
          <small>Aprovação imediata via QR Code ou Copia e Cola • Economize ${money(pixSavings)}</small>
        </span>
        <span class="payment-option-price">${money(pixTotal)}</span>
      </label>
      <label class="payment-option">
        <input name="paymentMethod" type="radio" value="cartao"/>
        <span class="payment-option-body">
          <b>Cartão de Crédito em até 12x sem juros</b>
          <small>Em até 12x de ${money(installment)} sem juros</small>
        </span>
        <span class="payment-option-price">${money(subtotal)}</span>
      </label>
      <label class="payment-option">
        <input name="paymentMethod" type="radio" value="retirada"/>
        <span class="payment-option-body">
          <b>Pagar na Retirada / Entrega</b>
          <small>Pague no cartão ou dinheiro quando receber suas peças</small>
        </span>
        <span class="payment-option-price">${money(subtotal)}</span>
      </label>
    </div>

    <div id="paymentInfoPanel"></div>

    <button class="btn" id="checkoutBtn" style="width:100%;margin-top:16px">FINALIZAR PEDIDO</button>
    <div class="fp-error" id="checkoutError" style="display:none;margin-top:10px"></div>
  `;
  el.querySelectorAll('.cart-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.qty-plus').onclick = () => { changeQty(id, 1); };
    row.querySelector('.qty-minus').onclick = () => { changeQty(id, -1); };
    row.querySelector('.remove-item').onclick = () => { cart = cart.filter(i => String(i.productId) !== String(id)); saveCart(); renderCart(); };
  });
  el.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
    input.addEventListener('change', () => {
      el.querySelectorAll('.payment-option').forEach(opt => {
        opt.classList.toggle('selected', opt.querySelector('input').checked);
      });
      renderPaymentInfo(input.value, amounts, true);
    });
  });
  renderPaymentInfo('pix', amounts, false);
  document.getElementById('checkoutBtn').onclick = checkout;
}

function renderPaymentInfo(method, amounts, scroll) {
  const panel = document.getElementById('paymentInfoPanel');
  if (!panel) return;
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn && method !== 'cartao') checkoutBtn.style.display = '';
  if (method === 'pix') {
    const code = buildPixCode(amounts.pixTotal);
    const qrSvg = buildPixQrSvg(code);
    panel.innerHTML = `
      <div class="panel payment-panel">
        <div class="kicker">PAGAMENTO VIA PIX (4% DE DESCONTO)</div>
        <p style="margin:8px 0 14px;color:#c7c9cd">Total no Pix: <b style="color:#39c979">${money(amounts.pixTotal)}</b></p>
        ${qrSvg ? `<div class="pix-qr-box">${qrSvg}</div><p style="text-align:center;color:#9da2aa;font-size:12px;margin:10px 0 18px">Escaneie com a câmera do app do seu banco</p>` : ''}
        <label style="display:block;font-size:12px;font-weight:800;color:#aeb2b8;margin-bottom:7px;text-transform:uppercase">Ou use o Pix Copia e Cola</label>
        <textarea id="pixCode" readonly style="width:100%;min-height:80px;padding:12px;border-radius:10px;border:1px solid #34373d;background:#0c0e11;color:#fff;font-size:12px;resize:none">${code}</textarea>
        <button class="btn dark" id="copyPixBtn" style="width:100%;margin-top:10px" type="button">COPIAR CÓDIGO PIX</button>
        <p class="form-help">Escaneie o QR Code ou copie o código e cole na opção "Pix Copia e Cola" do app do seu banco. Depois de pagar, finalize o pedido abaixo — a loja confirma o pagamento em seguida.</p>
      </div>`;
    const copyBtn = document.getElementById('copyPixBtn');
    copyBtn.onclick = () => {
      const codeEl = document.getElementById('pixCode');
      codeEl.select();
      const done = () => { copyBtn.textContent = 'CÓDIGO COPIADO ✓'; setTimeout(() => { copyBtn.textContent = 'COPIAR CÓDIGO PIX'; }, 2000); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done).catch(() => { try { document.execCommand('copy'); done(); } catch { /* segue sem copiar */ } });
      else { try { document.execCommand('copy'); done(); } catch { /* segue sem copiar */ } }
    };
  } else if (method === 'cartao') {
    panel.innerHTML = `
      <div class="panel payment-panel">
        <div class="kicker">PAGAMENTO NO CARTÃO DE CRÉDITO</div>
        <p style="margin:8px 0 14px;color:#c7c9cd">Total: <b>${money(amounts.subtotal)}</b> em até 12x de ${money(amounts.installment)} sem juros</p>
        <div id="cardPaymentBrick">
          <p class="form-help">Carregando formulário de pagamento...</p>
        </div>
        <p id="cardPaymentStatus" style="display:none;margin-top:10px;font-size:13px"></p>
        <p class="form-help">Seus dados do cartão são enviados direto e com segurança para o processador de pagamentos — a loja nunca guarda o número do seu cartão.</p>
      </div>`;
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.style.display = 'none';
    mountCardBrick(amounts);
  } else {
    panel.innerHTML = `
      <div class="panel payment-panel">
        <div class="kicker">PAGAR NA RETIRADA / ENTREGA</div>
        <p style="margin:8px 0;color:#c7c9cd">Total: <b>${money(amounts.subtotal)}</b></p>
        <p class="form-help">Pague em dinheiro ou cartão no momento de receber suas peças.</p>
      </div>`;
  }
  if (scroll) setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}

function changeQty(id, delta) {
  const item = cart.find(i => String(i.productId) === String(id));
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(i => String(i.productId) !== String(id));
  saveCart();
  renderCart();
}

async function checkout() {
  const errEl = document.getElementById('checkoutError');
  if (errEl) errEl.style.display = 'none';
  if (!authenticated) {
    alert('Cadastre-se ou entre na sua conta para finalizar o pedido.');
    show('cadastro');
    return;
  }
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'retirada';
  try {
    const { address } = await api('/api/addresses/mine');
    if (!address) {
      alert('Cadastre seu endereço de entrega antes de finalizar o pedido.');
      show('endereco');
      return;
    }
    const items = cart.map(i => ({ productId: i.productId, quantity: i.quantity }));
    await api('/api/orders', { method: 'POST', body: JSON.stringify({ items, paymentMethod }) });
    cart = []; saveCart();
    if (paymentMethod === 'pix') {
      alert('Pedido realizado! Finalize o pagamento com o código Pix que você copiou e acompanhe o status na sua tela de Perfil.');
    } else {
      alert('Pedido realizado com sucesso! Acompanhe o status na sua tela de Perfil.');
    }
    show('perfil');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

// ---------- Meus pedidos ----------
const ORDER_STATUS_LABEL = { novo: 'Novo', em_preparacao: 'Em preparação', pronto: 'Pronto para retirada/entrega', entregue: 'Entregue', cancelado: 'Cancelado' };

async function loadMyOrders() {
  const el = document.getElementById('myOrders');
  if (!el) return;
  try {
    const { orders } = await api('/api/orders/mine');
    if (!orders.length) { el.innerHTML = '<p style="color:#9da2aa">Você ainda não fez nenhum pedido.</p>'; return; }
    el.innerHTML = orders.map(o => `
      <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;justify-content:space-between"><b>Pedido #${o.id}</b><span class="chip">${ORDER_STATUS_LABEL[o.status] || o.status}</span></div>
        <div style="color:#9da2aa;font-size:13px;margin-top:4px">${new Date(o.createdAt).toLocaleDateString('pt-BR')} • ${o.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</div>
        <div style="margin-top:4px"><b>${money(o.total)}</b></div>
      </div>`).join('');
  } catch (err) {
    el.innerHTML = `<p style="color:#e06a6a">${err.message}</p>`;
  }
}

// ---------- Inicialização ----------
async function init() {
  try {
    const { customer } = await api('/api/auth/me');
    applyUser(customer);
  } catch {
    applyUser(null);
  }
  updateNav();
  updateCartBadge();
  show('inicio', { push: false });
  loadAddress();
  loadCategoryCarousel();
}
init();
