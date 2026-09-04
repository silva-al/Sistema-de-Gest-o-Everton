// Funções auxiliares de autenticação: geração/verificação de token (JWT em cookie httpOnly)
// e middlewares que protegem rotas de cliente e de admin.
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'fp_token';
const ADMIN_COOKIE_NAME = 'fp_admin_token';
const SECRET = process.env.JWT_SECRET;

// Sem segredo (ou com um segredo curto e adivinhável) qualquer pessoa consegue
// forjar um cookie de login e entrar como admin. Por isso o servidor se recusa
// a subir em produção nessa condição, em vez de rodar inseguro sem ninguém ver.
if (!SECRET || SECRET.trim().length < 32) {
  const aviso =
    'JWT_SECRET ausente ou curto demais (mínimo 32 caracteres aleatórios). ' +
    'Gere um valor longo e coloque no .env / nas variáveis de ambiente da hospedagem.';
  if (process.env.NODE_ENV === 'production') {
    console.error(`ERRO FATAL: ${aviso}`);
    process.exit(1);
  }
  console.warn(`AVISO: ${aviso}`);
}

// Mesmas opções usadas para criar o cookie — o navegador só apaga um cookie
// quando os atributos batem, então logout e login precisam combinar.
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function signToken(payload) {
  // payload: { sub: id, role: 'customer' | 'admin', name, email }
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, payload) {
  const token = signToken(payload);
  const cookieName = payload.role === 'admin' ? ADMIN_COOKIE_NAME : COOKIE_NAME;
  res.cookie(cookieName, token, {
    ...COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  if (payload.role === 'admin') {
    res.cookie(COOKIE_NAME, token, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  res.clearCookie(ADMIN_COOKIE_NAME, COOKIE_OPTIONS);
}

function readToken(req) {
  const token = req.cookies && (req.cookies[ADMIN_COOKIE_NAME] || req.cookies[COOKIE_NAME]);
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function requireRole(role) {
  return (req, res, next) => {
    let token = null;
    if (role === 'admin') {
      token = req.cookies && (req.cookies[ADMIN_COOKIE_NAME] || req.cookies[COOKIE_NAME]);
    } else {
      token = req.cookies && (req.cookies[COOKIE_NAME] || req.cookies[ADMIN_COOKIE_NAME]);
    }
    if (!token) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    try {
      const decoded = jwt.verify(token, SECRET);
      if (!decoded || (decoded.role !== role && decoded.role !== 'admin')) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
  };
}

function attachUser(req, _res, next) {
  req.user = readToken(req);
  next();
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, readToken, requireRole, attachUser, ADMIN_COOKIE_NAME, COOKIE_NAME };
