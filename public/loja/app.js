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
  if (st.screen === 'produto' && st.productId) {
    openProductDetails(st.productId, null, false);
  } else {
    show(st.screen || 'inicio', { push: false });
  }
});

backBtn?.addEventListener('click', () => {
  if (navDepth > 0) window.history.back();
  else show('inicio');
});

// Tecla ESC para voltar de telas, fechar zoom ou cancelar
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const zoomModal = document.getElementById('zoomModal');
    if (zoomModal && !zoomModal.classList.contains('hidden')) {
      zoomModal.classList.add('hidden');
      return;
    }
    if (currentScreenId && currentScreenId !== 'inicio' && currentScreenId !== 'welcome') {
      if (navDepth > 0) {
        window.history.back();
      } else {
        show('inicio');
      }
    }
  }
});

function show(id, opts = {}) {
  const { push = true } = opts;
  if (!authenticated && !['welcome', 'inicio', 'pecas', 'cadastro', 'carrinho', 'produto'].includes(id)) {
    alert('Faça seu cadastro ou entre na sua conta para acessar esta área.');
    show('inicio');
    return;
  }
  currentScreenId = id;
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  nav.forEach(b => b.classList.toggle('active', b.dataset.screen === id));
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

// ---------- Busca rápida e categorias na tela inicial ----------
const homeSearchInput = document.getElementById('homeSearchInput');
const homeSearchBtn = document.getElementById('homeSearchBtn');

// Limpa qualquer autofill indevido do navegador (ex: admin, CPF ou senhas salvas)
if (homeSearchInput) {
  homeSearchInput.value = '';
  setTimeout(() => { if (homeSearchInput) homeSearchInput.value = ''; }, 60);
  setTimeout(() => { if (homeSearchInput) homeSearchInput.value = ''; }, 300);
}

function executeHomeSearch() {
  const q = homeSearchInput?.value?.trim() || '';
  show('pecas');
  const catInput = document.getElementById('catalogSearch');
  if (catInput) {
    catInput.value = q;
    loadCatalog();
  }
}
homeSearchBtn?.addEventListener('click', executeHomeSearch);
homeSearchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') executeHomeSearch();
});

document.querySelectorAll('.clean-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.clean-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const cat = chip.dataset.cat || '';
    goToCategory(cat);
  });
});

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
    alert('Cadastro realizado! Bem-vindo à Fahren Motors.');
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
  alert('Para recuperar o acesso, entre em contato com a Fahren Motors. A recuperação por e-mail será conectada quando o servidor de autenticação for configurado.');
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
  if (!select) return;
  const currentVal = select.value;
  try {
    const data = await api('/api/products/categories');
    const list = data.categories || [];
    select.innerHTML = '<option value="">Todas as categorias</option>';
    list.forEach(item => {
      const name = typeof item === 'string' ? item : item.name;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
    select.dataset.loaded = '1';
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

// ---------- Carrossel automático infinito de todas as peças (exclusivo da tela Início) ----------
async function loadCategoryCarousel() {
  const wrap = document.getElementById('categoryCarousel');
  const track = document.getElementById('categoryCarouselTrack');
  if (!track) return;
  try {
    const res = await api('/api/products/categories/featured');
    const items = res.products || res.categories || [];
    if (!items.length) {
      if (wrap) wrap.style.display = 'none';
      return;
    }
    if (wrap) wrap.style.display = '';

    const cardHtml = (c, hidden) => {
      const photo = c.photoUrl || CATEGORY_IMAGES[c.category] || 'images/categorias/filtros.jpg';
      const priceVal = typeof c.price === 'number' ? c.price : (c.price_cents ? c.price_cents / 100 : 0);
      const pixVal = priceVal > 0 ? (priceVal * (1 - (PIX_DISCOUNT_RATE || 0.04))) : 0;
      const installmentVal = priceVal > 0 ? priceVal / 6 : 0;
      return `<div class="card cat-card" data-product-id="${c.id || ''}" data-category="${c.category || ''}"${hidden ? ' aria-hidden="true"' : ''}>
        <div class="cat-card-img-wrap">
          <img alt="${hidden ? '' : c.name}" loading="lazy" src="${photo}">
          ${priceVal > 0 ? `<span class="cat-card-pix-badge">-4% PIX</span>` : ''}
        </div>
        <b>${c.name}</b>
        <small>${c.category || 'Peça'}</small>
        ${c.compatibility ? `<div class="cat-card-compat" title="${c.compatibility}"><span>🚗 ${c.compatibility}</span></div>` : ''}
        <div class="cat-card-price-block">
          <div class="cat-card-pix">${priceVal > 0 ? money(pixVal) : 'Disponível'} <span class="pix-micro-tag">no Pix</span></div>
          ${priceVal > 0 ? `<div class="cat-card-alt">ou ${money(priceVal)}</div>` : ''}
          ${priceVal > 0 ? `<div class="cat-card-installment">Em até 6x de ${money(installmentVal)}</div>` : ''}
        </div>
        ${c.inStock !== false && priceVal > 0 ? `
        <button type="button" class="cat-card-cart-btn" data-cart-id="${c.id || ''}" aria-label="Adicionar ao carrinho" title="Adicionar ao carrinho">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </button>` : ''}
      </div>`;
    };

    const cardAllHtml = (hidden) => `
      <div class="card cat-card cat-card-all" data-go-all="1"${hidden ? ' aria-hidden="true"' : ''} title="Ver todas as peças do catálogo">
        <div class="cat-card-all-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
        <b>Ver Todas</b>
        <small>Catálogo completo ›</small>
      </div>`;

    // Garante itens suficientes para um loop perfeito e contínuo sem saltos
    let baseList = items;
    while (baseList.length < 8) {
      baseList = baseList.concat(items);
    }
    const htmlContent = baseList.map(c => cardHtml(c, false)).join('') + cardAllHtml(false)
                      + baseList.map(c => cardHtml(c, true)).join('') + cardAllHtml(true);

    track.innerHTML = htmlContent;

    // Velocidade proporcional e suave: cada peça permanece legível sem passar rápido
    const totalHalfItems = baseList.length + 1;
    const durationSeconds = Math.max(55, Math.round(totalHalfItems * 2.8));
    track.style.animationDuration = `${durationSeconds}s`;

    // Pausa no toque (mobile) para inspecionar com facilidade
    track.addEventListener('touchstart', () => { track.style.animationPlayState = 'paused'; }, { passive: true });
    track.addEventListener('touchend', () => { track.style.animationPlayState = 'running'; }, { passive: true });
    track.addEventListener('touchcancel', () => { track.style.animationPlayState = 'running'; }, { passive: true });

    track.querySelectorAll('.cat-card:not(.cat-card-all)').forEach(el => {
      el.onclick = () => {
        const prodId = el.dataset.productId;
        if (prodId) {
          const prodObj = items.find(p => String(p.id) === String(prodId));
          openProductDetails(prodId, prodObj);
        } else {
          goToCategory(el.dataset.category);
        }
      };
    });
    track.querySelectorAll('.cat-card-all').forEach(el => {
      el.onclick = () => show('pecas');
    });
    track.querySelectorAll('.cat-card-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.dataset.cartId;
        if (prodId) addToCart(prodId, items, 1, btn);
      });
    });
  } catch (err) {
    console.error('Erro ao carregar carrossel:', err);
  }
}

// ---------- Peças Recomendadas da Mesma Categoria (Grid estático, sem carrossel) ----------
async function loadRecommendedProducts(product) {
  const section = document.getElementById('detailRelatedSection');
  const grid = document.getElementById('detailRecommendedGrid');
  const catNameEl = document.getElementById('detailRelatedCategoryName');
  const seeCatBtn = document.getElementById('detailRelatedSeeCategoryBtn');

  if (!section || !grid) return;

  const categoryName = product?.category || '';
  if (catNameEl) catNameEl.textContent = categoryName || 'Peças Automotivas';
  if (seeCatBtn) {
    seeCatBtn.onclick = () => goToCategory(categoryName);
  }

  grid.innerHTML = '<p style="color:#9da2aa;grid-column:1/-1;padding:20px 0">Buscando peças recomendadas...</p>';

  try {
    let items = [];
    if (categoryName) {
      const res = await api('/api/products?category=' + encodeURIComponent(categoryName));
      items = (res.products || []).filter(p => String(p.id) !== String(product.id));
    }

    // Se a mesma categoria tiver poucas opções, busca itens gerais para complementar
    if (items.length < 4) {
      try {
        const altRes = await api('/api/products/categories/featured');
        const alts = (altRes.products || altRes.categories || []).filter(
          p => String(p.id) !== String(product.id) && !items.some(i => String(i.id) === String(p.id))
        );
        items = items.concat(alts);
      } catch (_) {}
    }

    const recommended = items.slice(0, 4);

    if (!recommended.length) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    grid.innerHTML = recommended.map(p => {
      const photo = p.photoUrl || CATEGORY_IMAGES[p.category] || 'images/categorias/filtros.jpg';
      const priceVal = typeof p.price === 'number' ? p.price : (p.price_cents ? p.price_cents / 100 : 0);
      const pixVal = priceVal > 0 ? (priceVal * (1 - (PIX_DISCOUNT_RATE || 0.04))) : 0;
      return `
        <div class="fp-rec-card" data-rec-id="${p.id}" role="button" tabindex="0">
          <div class="fp-rec-card-img-wrap">
            <img src="${photo}" alt="${p.name}" loading="lazy" />
          </div>
          <div class="fp-rec-card-body">
            <span class="fp-rec-card-cat">${p.category || 'Peça'}</span>
            <strong class="fp-rec-card-name" title="${p.name}">${p.name}</strong>
            <div class="cat-card-price-block">
              <div class="cat-card-pix">${priceVal > 0 ? money(pixVal) : 'Disponível'} <span class="pix-micro-tag">no Pix</span></div>
              ${priceVal > 0 ? `<div class="cat-card-alt">ou ${money(priceVal)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.fp-rec-card').forEach(card => {
      card.onclick = () => {
        const id = card.dataset.recId;
        const target = recommended.find(p => String(p.id) === String(id));
        if (target) {
          openProductDetails(id, target);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      };
    });
  } catch (err) {
    console.error('Erro ao carregar peças recomendadas:', err);
    section.style.display = 'none';
  }
}

async function goToCategory(category) {
  show('pecas');
  const searchInput = document.getElementById('catalogSearch');
  if (searchInput) {
    searchInput.value = category || '';
    searchInput.focus();
  }
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
    const priceVal = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
    const pixVal = priceVal > 0 ? (priceVal * (1 - (PIX_DISCOUNT_RATE || 0.04))) : 0;
    return `
    <div class="product" data-product-id="${p.id}">
      <div class="part-photo">${img ? `<img src="${img}" alt="${p.name}" loading="lazy">` : '🔩'}</div>
      <div class="product-info-wrap">
        <b class="product-name" title="${p.name}">${p.name}</b>
        <small class="product-meta">${p.description || p.category || 'Aplicação compatível'}</small>
        <div class="stock">${p.inStock ? '● Disponível' : '○ Fora de estoque'}</div>
      </div>
      <div class="product-price-block">
        <div class="product-pix-row">
          <span class="product-pix-price">${priceVal > 0 ? money(pixVal) : 'Sob Consulta'}</span>
          ${priceVal > 0 ? `
            <span class="product-pix-tag">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z"/></svg>
              no Pix
            </span>
            <span class="product-pix-badge">4% OFF</span>
          ` : ''}
        </div>
        ${priceVal > 0 ? `
          <div class="product-alt-price">ou <strong>${money(priceVal)}</strong> em até 12x no cartão</div>
        ` : ''}
      </div>
      <div class="product-bottom-actions">
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
          <button class="btn" disabled style="opacity:.5;cursor:not-allowed;width:100%">FORA DE ESTOQUE</button>
        `}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.product').forEach(card => {
    const id = card.dataset.productId;
    const input = card.querySelector('.product-qty-val');
    const minus = card.querySelector('.p-minus');
    const plus = card.querySelector('.p-plus');
    const addBtn = card.querySelector('.add-cart-btn');
    const max = parseInt(input?.max, 10) || 99;

    // Ao clicar na foto, nome ou card da peça, abre a tela completa com hiper zoom
    card.addEventListener('click', (e) => {
      if (e.target.closest('.product-qty-row') || e.target.closest('.add-cart-btn') || e.target.closest('button')) {
        return;
      }
      const prod = products.find(p => String(p.id) === String(id));
      openProductDetails(id, prod);
    });

    if (minus && input) {
      minus.onclick = (e) => {
        e.stopPropagation();
        let val = parseInt(input.value, 10) || 1;
        if (val > 1) input.value = val - 1;
      };
    }
    if (plus && input) {
      plus.onclick = (e) => {
        e.stopPropagation();
        let val = parseInt(input.value, 10) || 1;
        if (val < max) input.value = val + 1;
      };
    }
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.stopPropagation();
        const qty = parseInt(input?.value, 10) || 1;
        addToCart(id, products, qty, addBtn);
      };
    }
  });
}

// ---------- Detalhes da Peça e Visualizador de Hiper Zoom 3D ----------
let currentProduct = null;

async function openProductDetails(productId, cachedProduct = null, push = true) {
  let product = cachedProduct;
  if (!product) {
    try {
      const data = await api('/api/products/' + productId);
      product = data.product;
    } catch (err) {
      console.error('Erro ao buscar detalhes da peça:', err);
    }
  }

  if (!product) {
    alert('Não foi possível carregar os dados desta peça no momento.');
    return;
  }

  currentProduct = product;
  const img = product.photoUrl || CATEGORY_IMAGES[product.category] || 'images/categorias/filtros.jpg';
  const priceVal = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
  const pixPrice = priceVal * (1 - (PIX_DISCOUNT_RATE || 0.04));
  const installmentVal = priceVal > 0 ? (priceVal / 12) : 0;
  const inStock = product.inStock !== false && (product.stockQty == null || product.stockQty > 0);
  const stockQty = product.stockQty || 0;
  const maxQty = inStock ? (stockQty > 0 ? stockQty : 99) : 0;

  // Breadcrumbs e Títulos
  const crumbCat = document.getElementById('detailBreadcrumbCat');
  const crumbName = document.getElementById('detailBreadcrumbName');
  if (crumbCat) crumbCat.textContent = product.category || 'Peças';
  if (crumbName) crumbName.textContent = product.name;

  const catBadge = document.getElementById('detailCategoryBadge');
  const codeBadge = document.getElementById('detailCodeBadge');
  if (catBadge) catBadge.textContent = product.category || 'Geral';
  if (codeBadge) codeBadge.textContent = `Cód: #${product.code || ('FP-00' + product.id)}`;

  const titleEl = document.getElementById('detailTitle');
  const subtitleEl = document.getElementById('detailSubtitle');
  if (titleEl) titleEl.textContent = product.name;
  if (subtitleEl) subtitleEl.textContent = product.description || 'Aplicação compatível e procedência certificada com garantia.';

  // Imagem e Lightbox
  const mainImg = document.getElementById('detailMainImg');
  const lbImg = document.getElementById('lightboxImg');
  const lbTitle = document.getElementById('lightboxTitle');
  if (mainImg) {
    mainImg.src = img;
    mainImg.alt = product.name;
  }
  if (lbImg) lbImg.src = img;
  if (lbTitle) lbTitle.textContent = `${product.name} - Inspeção em Alta Resolução`;

  // Ações de Botões e Estoque
  const addCartBtn = document.getElementById('detailAddCartBtn');
  const buyNowBtn = document.getElementById('detailBuyNowBtn');
  if (addCartBtn) {
    addCartBtn.disabled = !inStock;
    addCartBtn.style.opacity = inStock ? '1' : '.5';
    addCartBtn.style.cursor = inStock ? 'pointer' : 'not-allowed';
    addCartBtn.textContent = inStock ? '🛒 COLOCAR NO CARRINHO' : 'FORA DE ESTOQUE';
  }
  if (buyNowBtn) {
    buyNowBtn.disabled = !inStock;
    buyNowBtn.style.display = inStock ? 'inline-block' : 'none';
  }

  // Preço e Parcelamento
  const pixEl = document.getElementById('detailPixPrice');
  const regEl = document.getElementById('detailPrice');
  const instEl = document.getElementById('detailInstallment');
  if (pixEl) pixEl.textContent = money(pixPrice);
  if (regEl) regEl.textContent = money(priceVal);
  if (instEl) instEl.textContent = `em até 12x de ${money(installmentVal)} sem juros`;

  // Seletor de Quantidade
  const qtyInput = document.getElementById('detailQtyInput');
  const qtySubtotal = document.getElementById('detailQtySubtotal');
  if (qtyInput) {
    qtyInput.value = 1;
    qtyInput.max = maxQty;
  }
  function updateDetailSubtotal() {
    const q = parseInt(qtyInput?.value, 10) || 1;
    if (qtySubtotal) qtySubtotal.textContent = `Total: ${money(priceVal * q)}`;
  }
  updateDetailSubtotal();

  const minusBtn = document.getElementById('detailQtyMinus');
  const plusBtn = document.getElementById('detailQtyPlus');
  if (minusBtn && qtyInput) {
    minusBtn.onclick = () => {
      let q = parseInt(qtyInput.value, 10) || 1;
      if (q > 1) {
        qtyInput.value = q - 1;
        updateDetailSubtotal();
      }
    };
  }
  if (plusBtn && qtyInput) {
    plusBtn.onclick = () => {
      let q = parseInt(qtyInput.value, 10) || 1;
      if (q < maxQty) {
        qtyInput.value = q + 1;
        updateDetailSubtotal();
      }
    };
  }

  // Ações de Carrinho
  if (addCartBtn) {
    addCartBtn.onclick = () => {
      if (!inStock) return;
      const q = parseInt(qtyInput?.value, 10) || 1;
      addToCart(product.id, [product], q, addCartBtn);
    };
  }
  if (buyNowBtn) {
    buyNowBtn.onclick = () => {
      if (!inStock) return;
      const q = parseInt(qtyInput?.value, 10) || 1;
      addToCart(product.id, [product], q, buyNowBtn);
      show('carrinho');
    };
  }

  // Link para WhatsApp com mensagem personalizada
  const waLink = document.getElementById('detailWhatsAppLink');
  if (waLink) {
    const msg = `Olá! Gostaria de tirar uma dúvida sobre a peça ${product.name} (Código: ${product.code || product.id}).`;
    waLink.href = `https://wa.me/5519989932064?text=${encodeURIComponent(msg)}`;
  }

  // Descrição Técnica Completa
  const fullDesc = document.getElementById('detailFullDescription');
  if (fullDesc) {
    fullDesc.innerHTML = `
      <p style="font-size:15px;line-height:1.6;color:#e1e4ea">
        ${product.description ? product.description : `A peça <strong>${product.name}</strong> é desenvolvida atendendo aos mais rigorosos padrões de qualidade e especificações técnicas de montadoras automotivas.`}
      </p>
      <p style="margin-top:12px;color:#9da2aa;line-height:1.5">
        Item essencial para o correto funcionamento e durabilidade do veículo. Proporciona alto rendimento, durabilidade prolongada e encaixe preciso de fábrica sem necessidade de adaptações.
      </p>
      <div style="margin-top:16px;padding:12px 14px;background:#14171e;border-left:3px solid #ed1c24;border-radius:6px;font-size:13.5px;color:#cbd0d8">
        <strong style="color:#fff">⚠️ Recomendação de Instalação:</strong> Para garantir a segurança e a validade da garantia de 90 dias com Nota Fiscal, a instalação deve ser realizada por um profissional ou centro automotivo especializado.
      </div>
    `;
  }

  const specName = document.getElementById('specName');
  const specCode = document.getElementById('specCode');
  const specCat = document.getElementById('specCategory');
  const specStock = document.getElementById('specStock');
  if (specName) specName.textContent = product.name;
  if (specCode) specCode.textContent = product.code || `#FP-${product.id}`;
  if (specCat) specCat.textContent = product.category || 'Geral';
  if (specStock) specStock.textContent = inStock ? 'Disponível para pronta entrega' : 'Sob consulta';

  // Aplicação e Compatibilidade Veicular Detalhada
  const compatBody = document.getElementById('detailCompatibility');
  if (compatBody) {
    const hasCustomCompat = Boolean(product.compatibility && product.compatibility.trim());
    compatBody.innerHTML = `
      <div class="fp-compat-header" style="margin-bottom:18px">
        <h3 style="font-size:17px;color:#fff;margin-bottom:6px;display:flex;align-items:center;gap:8px">
          <span>🚗</span> Aplicação e Veículos Compatíveis
        </h3>
        <p style="color:#9da2aa;font-size:13.5px">
          ${hasCustomCompat 
            ? 'Esta peça possui as seguintes aplicações veiculares e modelos compatíveis homologados:'
            : 'Aplicações compatíveis com as linhas de montadoras que utilizam esta especificação:'}
        </p>
      </div>

      <div class="fp-compat-detail-box" style="background:#111319;border:1px solid #292d37;border-radius:12px;padding:18px;margin-bottom:18px">
        ${hasCustomCompat ? `
          <div style="white-space:pre-line;color:#f0f2f5;font-size:14.5px;line-height:1.7;font-weight:500">
            ${product.compatibility.trim()}
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px">
            <div>
              <span style="color:#8e949c;font-size:11.5px;text-transform:uppercase;display:block">Referência / Código:</span>
              <strong style="color:#fff;font-size:14.5px">${product.code || ('FP-00' + product.id)}</strong>
            </div>
            <div>
              <span style="color:#8e949c;font-size:11.5px;text-transform:uppercase;display:block">Sistema do Veículo:</span>
              <strong style="color:#fff;font-size:14.5px">${product.category || 'Peças Automotivas'}</strong>
            </div>
            <div>
              <span style="color:#8e949c;font-size:11.5px;text-transform:uppercase;display:block">Padrão de Fabricação:</span>
              <strong style="color:#3fb950;font-size:14.5px">Encaixe Original 100% Plug & Play</strong>
            </div>
          </div>
          <p style="margin-top:14px;color:#a0a5ae;font-size:13px;border-top:1px solid #20242e;padding-top:12px">
            Peça de primeira linha compatível com montadoras que adotam este padrão. Ao cadastrar novas peças ou atualizá-las no painel administrativo, os detalhes de modelos, motorizações e anos compatíveis serão listados aqui.
          </p>
        `}
      </div>

      <div class="fp-compat-cta" style="background:#141720;border-left:4px solid #ed1c24;border-radius:8px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <strong style="color:#fff;font-size:14px;display:block">Dúvida sobre o chassi, motor ou ano do seu carro?</strong>
          <span style="color:#9da2aa;font-size:12.5px">Nossa equipe confirma na hora pelo catálogo técnico da montadora.</span>
        </div>
        <a href="https://wa.me/5519989932064?text=${encodeURIComponent('Olá! Gostaria de confirmar a compatibilidade da peça ' + product.name + ' (Código: ' + (product.code || product.id) + ') com o modelo do meu carro.')}" target="_blank" rel="noopener" style="background:#238636;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:background .15s">
          <span>💬</span> Confirmar no WhatsApp
        </a>
      </div>
    `;
  }

  // Reseta a galeria para o primeiro slide
  if (typeof window.resetProductGallery === 'function') {
    window.resetProductGallery();
  } else if (typeof window.resetViewer === 'function') {
    window.resetViewer();
  }

  // Atualiza texto de compatibilidade no slide 2 da galeria
  const slideCompat = document.getElementById('slideCompatText');
  if (slideCompat) {
    if (product.compatibility && product.compatibility.trim()) {
      slideCompat.textContent = `Compatível com: ${product.compatibility}`;
    } else {
      slideCompat.textContent = `Compatível com padrão original da montadora para ${product.category || 'este veículo'}. Consulte a tabela completa abaixo.`;
    }
  }

  // Navega para a tela do produto
  show('produto', { push });
  if (push) {
    window.history.replaceState({ screen: 'produto', depth: navDepth, productId: product.id }, '');
  }
  loadRecommendedProducts(product);
}

// Inicializador da Galeria de Fotos e Detalhes Deslizável por Arrastar/Toque
function initProductViewer() {
  const slider = document.getElementById('gallerySlider');
  const track = document.getElementById('gallerySlidesTrack');
  const prevBtn = document.getElementById('galleryPrevBtn');
  const nextBtn = document.getElementById('galleryNextBtn');
  const dotsRow = document.getElementById('galleryDotsRow');
  const counter = document.getElementById('detailSlideCounter');
  const badgeText = document.getElementById('viewerBadgeText');
  const zoomBtn = document.getElementById('galleryZoomBtn');

  if (!slider || !track) return;

  const totalSlides = 3;
  let currentSlide = 0;
  let startX = 0;
  let isDragging = false;

  function updateGallery(index) {
    currentSlide = Math.max(0, Math.min(totalSlides - 1, index));
    track.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.25, 1)';
    track.style.transform = `translateX(-${currentSlide * 100}%)`;

    if (counter) counter.textContent = `${currentSlide + 1} / ${totalSlides}`;
    if (dotsRow) {
      dotsRow.querySelectorAll('.g-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
      });
    }

    if (badgeText) {
      if (currentSlide === 0) badgeText.textContent = 'Arraste para o lado para ver mais';
      else if (currentSlide === 1) badgeText.textContent = 'Compatibilidade & Aplicação';
      else badgeText.textContent = 'Garantia & Procedência';
    }
  }

  window.resetProductGallery = function() {
    updateGallery(0);
  };
  window.resetViewer = window.resetProductGallery;

  prevBtn?.addEventListener('click', () => {
    if (currentSlide > 0) updateGallery(currentSlide - 1);
  });

  nextBtn?.addEventListener('click', () => {
    if (currentSlide < totalSlides - 1) updateGallery(currentSlide + 1);
  });

  dotsRow?.querySelectorAll('.g-dot').forEach((dot, idx) => {
    dot.addEventListener('click', () => updateGallery(idx));
  });

  // Touch & Mouse Dragging manual e suave
  function getPositionX(e) {
    return e.type.includes('mouse') ? e.pageX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
  }

  function touchStart(e) {
    isDragging = true;
    startX = getPositionX(e);
    track.style.transition = 'none';
  }

  function touchMove(e) {
    if (!isDragging) return;
    const currentX = getPositionX(e);
    const diff = currentX - startX;
    const offset = -currentSlide * slider.offsetWidth + diff;
    track.style.transform = `translateX(${offset}px)`;
  }

  function touchEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    const endX = e.type.includes('mouse') ? e.pageX : (e.changedTouches ? e.changedTouches[0].clientX : startX);
    const diff = endX - startX;

    if (diff < -40 && currentSlide < totalSlides - 1) {
      updateGallery(currentSlide + 1);
    } else if (diff > 40 && currentSlide > 0) {
      updateGallery(currentSlide - 1);
    } else {
      updateGallery(currentSlide);
    }
  }

  slider.addEventListener('touchstart', touchStart, { passive: true });
  slider.addEventListener('touchmove', touchMove, { passive: true });
  slider.addEventListener('touchend', touchEnd);

  slider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    touchStart(e);
  });
  window.addEventListener('mousemove', (e) => {
    if (isDragging) touchMove(e);
  });
  window.addEventListener('mouseup', (e) => {
    if (isDragging) touchEnd(e);
  });

  zoomBtn?.addEventListener('click', () => {
    const modal = document.getElementById('detailLightboxModal');
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (typeof window.resetLbPan === 'function') window.resetLbPan();
    }
  });

  // Lightbox Modal para tela cheia com movimentação livre por toque ou mouse
  const modal = document.getElementById('detailLightboxModal');
  const lbOverlay = document.getElementById('lightboxOverlay');
  const lbClose = document.getElementById('lightboxClose');
  const lbImg = document.getElementById('lightboxImg');
  const lbViewport = document.getElementById('lightboxViewport');
  const lbZoomIn = document.getElementById('lbZoomIn');
  const lbZoomOut = document.getElementById('lbZoomOut');
  const lbResetPan = document.getElementById('lbResetPan');
  const lbZoomLevel = document.getElementById('lbZoomLevel');

  let lbScale = 2.0;
  let lbPanX = 0;
  let lbPanY = 0;
  let lbDragging = false;
  let lbStartX = 0;
  let lbStartY = 0;

  function updateLbTransform() {
    if (lbImg) {
      lbImg.style.transform = `translate3d(${lbPanX}px, ${lbPanY}px, 0px) scale(${lbScale})`;
    }
    if (lbZoomLevel) {
      lbZoomLevel.textContent = `${lbScale.toFixed(1)}x`;
    }
  }

  function openLightbox() {
    if (modal) {
      modal.style.display = 'flex';
      lbScale = 2.0;
      lbPanX = 0;
      lbPanY = 0;
      updateLbTransform();
    }
  }

  function closeLightbox() {
    if (modal) modal.style.display = 'none';
    lbDragging = false;
    lbViewport?.classList.remove('is-dragging');
  }

  // Abre tela cheia exclusivamente pelo botão "Tela Cheia" (sem duplo clique acidental)
  document.getElementById('ctrlFullscreen')?.addEventListener('click', openLightbox);
  lbOverlay?.addEventListener('click', closeLightbox);
  lbClose?.addEventListener('click', closeLightbox);

  // Controles de Zoom
  lbZoomIn?.addEventListener('click', () => {
    if (lbScale < 4.5) {
      lbScale = Math.min(4.5, lbScale + 0.5);
      updateLbTransform();
    }
  });

  lbZoomOut?.addEventListener('click', () => {
    if (lbScale > 1.0) {
      lbScale = Math.max(1.0, lbScale - 0.5);
      updateLbTransform();
    }
  });

  lbResetPan?.addEventListener('click', () => {
    lbScale = 2.0;
    lbPanX = 0;
    lbPanY = 0;
    updateLbTransform();
  });

  // Movimentação livre com Mouse (Desktop)
  if (lbViewport) {
    lbViewport.addEventListener('mousedown', (e) => {
      e.preventDefault();
      lbDragging = true;
      lbStartX = e.clientX - lbPanX;
      lbStartY = e.clientY - lbPanY;
      lbViewport.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!lbDragging) return;
      lbPanX = e.clientX - lbStartX;
      lbPanY = e.clientY - lbStartY;
      updateLbTransform();
    });

    window.addEventListener('mouseup', () => {
      if (lbDragging) {
        lbDragging = false;
        lbViewport.classList.remove('is-dragging');
      }
    });

    // Movimentação livre com a Mão / Toque (Mobile & Tablet)
    lbViewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        lbDragging = true;
        lbStartX = e.touches[0].clientX - lbPanX;
        lbStartY = e.touches[0].clientY - lbPanY;
        lbViewport.classList.add('is-dragging');
      }
    }, { passive: true });

    lbViewport.addEventListener('touchmove', (e) => {
      if (!lbDragging || e.touches.length !== 1) return;
      lbPanX = e.touches[0].clientX - lbStartX;
      lbPanY = e.touches[0].clientY - lbStartY;
      updateLbTransform();
    }, { passive: true });

    lbViewport.addEventListener('touchend', () => {
      lbDragging = false;
      lbViewport.classList.remove('is-dragging');
    });
  }

  // Navegação por Abas
  document.querySelectorAll('.fp-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fp-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.fp-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  // Botões de Voltar ao Catálogo
  document.getElementById('backToCatalogBtn')?.addEventListener('click', () => {
    if (navDepth > 0) window.history.back();
    else show('pecas');
  });
  document.getElementById('crumbCatalogLink')?.addEventListener('click', () => {
    show('pecas');
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

  // Não exibe peças soltas até o cliente pesquisar
  if (!q) {
    container.innerHTML = `
      <div class="catalog-prompt-empty" style="text-align:center;padding:46px 16px;color:#8f949c;">
        <div style="width:52px;height:52px;margin:0 auto 14px;border-radius:50%;background:rgba(237,28,36,0.1);border:1px solid rgba(237,28,36,0.25);display:flex;align-items:center;justify-content:center;color:#ed1c24;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <p style="font-size:15px;color:#ffffff;font-weight:700;margin:0 0 6px;">O que você procura?</p>
        <p style="font-size:13px;color:#8f949c;margin:0 auto;max-width:320px;">Digite o nome da peça, modelo do veículo ou código para pesquisar no catálogo.</p>
      </div>`;
    return;
  }

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

// ---------- Controle da Tela de Carregamento (Splash Screen) ----------
function hideSplashScreen() {
  const splash = document.getElementById('splashScreen');
  if (!splash || splash.classList.contains('hidden')) return;
  splash.classList.add('hidden');
  setTimeout(() => {
    splash.style.display = 'none';
  }, 450);
}

// ---------- Tecla ESC para sair de modais ou voltar telas ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // 1. Fecha lightbox de fotos se aberto
    const lb = document.getElementById('imageLightbox');
    if (lb && !lb.classList.contains('hidden')) {
      const closeBtn = document.getElementById('lightboxCloseBtn');
      if (closeBtn) closeBtn.click();
      else lb.classList.add('hidden');
      return;
    }
    // 2. Fecha qualquer modal ativo
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden), .modal:not(.hidden)');
    if (openModals.length > 0) {
      openModals.forEach(m => m.classList.add('hidden'));
      return;
    }
    // 3. Se estiver em detalhes do produto ou carrinho, volta ao catálogo
    const detailsView = document.getElementById('view-detalhes');
    if (detailsView && !detailsView.classList.contains('hidden')) {
      show('catalogo');
      return;
    }
    const cartView = document.getElementById('view-carrinho');
    if (cartView && !cartView.classList.contains('hidden')) {
      show('catalogo');
      return;
    }
  }
});

// ---------- Inicialização ----------
async function init() {
  // Timeout de segurança para nunca travar a tela caso a conexão caia
  const safetyTimer = setTimeout(hideSplashScreen, 1800);

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
  
  // Pré-carrega carrossel da home e catálogo de peças em paralelo para velocidade máxima
  try {
    await Promise.allSettled([
      loadCategoryCarousel(),
      loadCatalog()
    ]);
  } catch (err) {
    console.error('Erro no pré-carregamento:', err);
  }

  initProductViewer();

  clearTimeout(safetyTimer);
  // Transição suave para revelar a página 100% pronta
  setTimeout(hideSplashScreen, 200);
}
init();

// ================== REDESIGN HOME: cabeçalho, localizador de veículo, categorias e barra inferior mobile ==================
(function () {
  // Categorias — botão do cabeçalho (desktop)
  const catBtn = document.getElementById('headerCatBtn');
  const catMenu = document.getElementById('headerCatMenu');
  if (catBtn && catMenu) {
    catBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = catMenu.classList.toggle('open');
      catBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!catMenu.contains(e.target) && e.target !== catBtn) {
        catMenu.classList.remove('open');
        catBtn.setAttribute('aria-expanded', 'false');
      }
    });
    catMenu.querySelectorAll('.clean-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        catMenu.classList.remove('open');
        catBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Busca do cabeçalho (desktop e mobile) — reaproveita a busca do catálogo
  function runHeaderSearch(inputEl) {
    const q = inputEl?.value?.trim() || '';
    show('pecas');
    const catInput = document.getElementById('catalogSearch');
    if (catInput) {
      catInput.value = q;
      if (typeof loadCatalog === 'function') loadCatalog();
    }
  }
  const hSearchIn = document.getElementById('headerSearchInput');
  const hSearchBtn = document.getElementById('headerSearchBtn');
  const hSearchInM = document.getElementById('headerSearchInputMobile');
  const hSearchBtnM = document.getElementById('headerSearchBtnMobile');
  hSearchBtn?.addEventListener('click', () => runHeaderSearch(hSearchIn));
  hSearchIn?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runHeaderSearch(hSearchIn); });
  hSearchBtnM?.addEventListener('click', () => runHeaderSearch(hSearchInM));
  hSearchInM?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runHeaderSearch(hSearchInM); });

  // Grade de categorias na home
  document.querySelectorAll('.cat-grid-item[data-cat]').forEach((item) => {
    item.addEventListener('click', () => {
      if (typeof goToCategory === 'function') goToCategory(item.dataset.cat || '');
    });
  });

  // Quantidade real de peças por categoria (busca no banco de dados, sem número inventado)
  (async function loadCategoryCounts() {
    const els = [...document.querySelectorAll('.cat-grid-count[data-count-for]')];
    if (!els.length) return;
    try {
      const res = await fetch('/api/products/categories');
      const data = await res.json();
      const counts = {};
      (data.categories || []).forEach((c) => { counts[c.name] = c.count; });
      els.forEach((el) => {
        const cat = el.dataset.countFor;
        const n = counts[cat] || 0;
        el.textContent = n === 1 ? '1 item' : `${n} itens`;
      });
    } catch (e) {
      els.forEach((el) => { el.textContent = ''; });
    }
  })();

  // Localizador de veículo — ainda não há dados de veículo/compatibilidade no catálogo,
  // então por enquanto ele leva o cliente para o catálogo já com os termos escolhidos na busca.
  const vfBtn = document.getElementById('vfBuscarBtn');
  vfBtn?.addEventListener('click', () => {
    const vals = ['vfMontadora', 'vfModelo', 'vfAno', 'vfMotor']
      .map((id) => document.getElementById(id)?.value)
      .filter(Boolean);
    show('pecas');
    const catInput = document.getElementById('catalogSearch');
    if (catInput) {
      catInput.value = vals.join(' ');
      if (typeof loadCatalog === 'function') loadCatalog();
    }
  });

  // Atalho "Informe seu veículo" leva para o localizador de veículo da home
  document.getElementById('qaVehicle')?.addEventListener('click', () => {
    show('inicio');
    setTimeout(() => {
      const vf = document.querySelector('.vehicle-finder');
      vf?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => document.getElementById('vfMontadora')?.focus(), 400);
    }, 80);
  });

  // Ofertas especiais — monta os cards com peças reais do catálogo e o desconto do Pix
  (async function loadOffers() {
    const section = document.getElementById('offersSection');
    const list = document.getElementById('offersList');
    if (!section || !list) return;
    try {
      const res = await fetch('/api/products/categories/featured');
      const data = await res.json();
      const allEligible = (data.products || data.categories || []).filter(p => {
        const v = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
        return v > 0 && p.inStock !== false;
      });
      if (!allEligible.length) return;

      // Seleciona ofertas destacadas garantindo variedade entre as categorias automotivas
      const byCategory = new Map();
      allEligible.forEach(p => {
        const cat = p.category || 'Geral';
        if (!byCategory.has(cat)) byCategory.set(cat, p);
      });
      let items = Array.from(byCategory.values());
      if (items.length < 8) {
        const usedIds = new Set(items.map(p => p.id));
        for (const p of allEligible) {
          if (!usedIds.has(p.id)) {
            items.push(p);
            usedIds.add(p.id);
            if (items.length >= 8) break;
          }
        }
      }

      list.innerHTML = items.map(p => {
        const photo = p.photoUrl || CATEGORY_IMAGES[p.category] || 'images/categorias/filtros.jpg';
        const priceVal = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
        const pixVal = priceVal * (1 - (PIX_DISCOUNT_RATE || 0.04));
        const pixStr = money(pixVal).replace('R$', '').trim();
        return `
        <button type="button" class="offer-card" data-product-id="${p.id}">
          <div class="offer-card-text">
            <div class="offer-card-badges">
              <span class="offer-card-cat">${p.category || 'Peça'}</span>
              <span class="offer-card-tag-pix">-4% PIX</span>
            </div>
            <div class="offer-card-name">${p.name}</div>
            ${p.compatibility ? `<div class="offer-card-compat" title="${p.compatibility}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2 10.9 2 11.2 2 11.5V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg><span>${p.compatibility}</span></div>` : ''}
            <div class="offer-card-price-block">
              <div class="offer-card-price-main">
                <span class="offer-card-label">À vista no Pix</span>
                <span class="offer-card-price"><small>R$</small>${pixStr}</span>
              </div>
              <span class="offer-card-cta">
                <span>VER PEÇA</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </span>
            </div>
            <div class="offer-card-note">ou ${money(priceVal)} em até 12x no cartão</div>
          </div>
          <div class="offer-card-img">
            <img src="${photo}" alt="${p.name}" loading="lazy">
            <span class="offer-img-badge">OFERTA</span>
          </div>
        </button>`;
      }).join('');

      list.querySelectorAll('.offer-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.productId;
          const prod = items.find(p => String(p.id) === String(id));
          if (typeof openProductDetails === 'function') openProductDetails(id, prod);
        });
      });
      const btnAll = section.querySelector('.btn-offers-all');
      if (btnAll) {
        btnAll.onclick = () => show('pecas');
      }
      section.style.display = '';
    } catch (e) {
      console.error('Erro ao carregar ofertas:', e);
    }
  })();

  // Barra de navegação inferior (somente mobile)
  const tabbar = document.getElementById('mobileTabbar');
  if (tabbar) {
    const tabButtons = [...tabbar.querySelectorAll('button')];
    function setActiveTab(id) {
      tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    }
    tabbar.querySelector('[data-tab="inicio"]')?.addEventListener('click', () => { show('inicio'); setActiveTab('inicio'); });
    tabbar.querySelector('[data-tab="categorias"]')?.addEventListener('click', () => {
      show('inicio');
      setActiveTab('categorias');
      setTimeout(() => document.querySelector('.cat-grid-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    });
    tabbar.querySelector('[data-tab="buscar"]')?.addEventListener('click', () => {
      show('inicio');
      setActiveTab('buscar');
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('headerSearchInputMobile')?.focus();
      }, 80);
    });
    tabbar.querySelector('[data-tab="perfil"]')?.addEventListener('click', () => { show('perfil'); setActiveTab('perfil'); });
    tabbar.querySelector('[data-tab="carrinho"]')?.addEventListener('click', () => { show('carrinho'); setActiveTab('carrinho'); });

    // Mantém a aba ativa sincronizada quando a tela muda por outro caminho (voltar do navegador, links internos etc.)
    if (typeof screens !== 'undefined') {
      const tabbarObserver = new MutationObserver(() => {
        const activeScreen = document.querySelector('.screen.active')?.id;
        if (activeScreen && tabButtons.some((b) => b.dataset.tab === activeScreen)) setActiveTab(activeScreen);
      });
      screens.forEach((s) => tabbarObserver.observe(s, { attributes: true, attributeFilter: ['class'] }));
    }

    // Espelha o número do carrinho na barra inferior
    const badgeSrc = document.getElementById('cartBadge');
    const badgeDst = document.getElementById('mtbCartBadge');
    if (badgeSrc && badgeDst) {
      const syncBadge = () => { badgeDst.textContent = badgeSrc.textContent; };
      syncBadge();
      new MutationObserver(syncBadge).observe(badgeSrc, { childList: true, characterData: true, subtree: true });
    }
  }
})();

// ---------- Carrossel de Banner Panorâmico em Alta Definição no Hero ----------
(function initHeroBannerSlider() {
  const HERO_SLIDES = [
    'images/banner-slide-1.jpg',
    'images/banner-slide-2.jpg',
    'images/banner-slide-3.jpg',
    'images/banner-slide-4.jpg'
  ];

  let currentSlide = 0;
  let timer = null;

  function goToSlide(idx) {
    const bannerImg = document.getElementById('heroBannerImg');
    const dots = document.querySelectorAll('#heroDots span');

    if (!bannerImg) return;
    currentSlide = (idx + HERO_SLIDES.length) % HERO_SLIDES.length;
    const nextSrc = HERO_SLIDES[currentSlide];

    // Efeito suave de transição: fade out, troca a imagem widescreen, fade in
    bannerImg.classList.add('fading');

    setTimeout(() => {
      bannerImg.src = nextSrc;
      bannerImg.classList.remove('fading');
    }, 240);

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentSlide);
    });
  }

  function startRotation() {
    stopRotation();
    timer = setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 3600);
  }

  function stopRotation() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function init() {
    const container = document.getElementById('heroBannerContainer');
    const dots = document.querySelectorAll('#heroDots span');

    dots.forEach((dot, idx) => {
      dot.style.cursor = 'pointer';
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        goToSlide(idx);
        startRotation();
      });
    });

    if (container) {
      container.addEventListener('click', () => {
        goToSlide(currentSlide + 1);
        startRotation();
      });
      container.addEventListener('mouseenter', stopRotation);
      container.addEventListener('mouseleave', startRotation);

      // Suporte a toque / swipe no celular
      let touchStartX = 0;
      container.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) touchStartX = e.touches[0].clientX;
        stopRotation();
      }, { passive: true });
      container.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const touchEndX = e.changedTouches[0].clientX;
          if (touchStartX - touchEndX > 35) {
            goToSlide(currentSlide + 1);
          } else if (touchEndX - touchStartX > 35) {
            goToSlide(currentSlide - 1);
          }
        }
        startRotation();
      }, { passive: true });
    }

    startRotation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


// Remove badge ou drawer do Netlify caso injetados dinamicamente
(function cleanNetlifyBadges() {
  function purge() {
    const selectors = [
      'iframe[src*="netlify" i]',
      'iframe[title*="netlify" i]',
      'iframe[id*="netlify" i]',
      'iframe[class*="netlify" i]',
      '[data-netlify-badge]',
      '[data-netlify-feedback]',
      '#netlify-badge',
      '.netlify-badge',
      'netlify-drawer',
      '#netlify-drawer-container',
      '.netlify-drawer',
      '[class*="netlify" i]',
      '[id*="netlify" i]',
      'a[href*="netlify.com" i]'
    ];
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (el && el.tagName !== 'SCRIPT' && el.id !== 'netlify-badge-blocker') {
            el.remove();
          }
        });
      } catch (e) {}
    });
    try {
      document.querySelectorAll('div, a, span, button').forEach(el => {
        if (!el || !el.textContent) return;
        const txt = el.textContent.trim();
        if (txt === 'Powered by Netlify' || txt.includes('Powered by Netlify')) {
          const container = el.closest('a') || el.closest('[style*="fixed"]') || el.closest('div') || el;
          if (container && container !== document.body && container !== document.documentElement) {
            container.remove();
          }
        }
      });
    } catch (e) {}
  }
  purge();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', purge);
  }
  window.addEventListener('load', purge);
  try {
    const obs = new MutationObserver(purge);
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();


/* ==========================================================================
   CARDS DE PEÇAS AO LADO DO BANNER (somente desktop)
   Usa exclusivamente peças reais do catálogo (mesma API das ofertas) e vai
   trocando o trio exibido, sem inventar marca, preço ou disponibilidade.
   ========================================================================== */
(function heroSideCards() {
  function start() {
    const box = document.getElementById('heroSideCards');
    if (!box) return;

    const SLOTS = 3;
    let items = [];
    let offset = 0;
    let timer = null;

    function cardHtml(p) {
      const photo = p.photoUrl || (typeof CATEGORY_IMAGES !== 'undefined' && CATEGORY_IMAGES[p.category]) || 'images/categorias/filtros.jpg';
      const priceVal = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
      const pixVal = priceVal * (1 - (typeof PIX_DISCOUNT_RATE !== 'undefined' ? PIX_DISCOUNT_RATE : 0.04));
      return `
        <button type="button" class="hero-side-card" data-product-id="${p.id}" title="${p.name}">
          <span class="hsc-img"><img src="${photo}" alt="${p.name}" loading="lazy"></span>
          <span class="hsc-text">
            <span class="hsc-cat">${p.category || 'Peça'}</span>
            <span class="hsc-name">${p.name}</span>
            <span class="hsc-price"><small>À vista no Pix</small><b>${money(pixVal)}</b></span>
          </span>
        </button>`;
    }

    function render() {
      const slice = [];
      for (let i = 0; i < SLOTS; i++) slice.push(items[(offset + i) % items.length]);
      box.innerHTML = slice.map(cardHtml).join('');
      box.querySelectorAll('.hero-side-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.productId;
          const prod = items.find((p) => String(p.id) === String(id));
          if (typeof openProductDetails === 'function') openProductDetails(id, prod);
        });
      });
    }

    function rotate() {
      if (window.innerWidth < 761 || items.length <= SLOTS) return;
      box.classList.add('swapping');
      setTimeout(() => {
        offset = (offset + SLOTS) % items.length;
        render();
        box.classList.remove('swapping');
      }, 250);
    }

    fetch('/api/products/categories/featured')
      .then((r) => r.json())
      .then((data) => {
        const eligible = (data.products || data.categories || []).filter((p) => {
          const v = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
          return v > 0 && p.inStock !== false;
        });
        // Intercala as categorias para que os três cards visíveis nunca
        // fiquem todos da mesma categoria.
        const buckets = new Map();
        eligible.forEach((p) => {
          const cat = p.category || 'Geral';
          if (!buckets.has(cat)) buckets.set(cat, []);
          buckets.get(cat).push(p);
        });
        const lists = Array.from(buckets.values());
        items = [];
        for (let i = 0; items.length < eligible.length; i++) {
          lists.forEach((l) => { if (l[i]) items.push(l[i]); });
        }
        if (items.length < SLOTS) return;
        render();
        timer = setInterval(rotate, 4500);
        box.addEventListener('mouseenter', () => { if (timer) { clearInterval(timer); timer = null; } });
        box.addEventListener('mouseleave', () => { if (!timer) timer = setInterval(rotate, 4500); });
      })
      .catch((e) => console.error('Erro ao carregar peças do banner:', e));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
