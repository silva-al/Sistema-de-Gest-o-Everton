// Funções auxiliares de autenticação: geração/verificação de token (JWT em cookie httpOnly)
// e middlewares que protegem rotas de cliente e de admin.
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'fp_token';
const SECRET = process.env.JWT_SECRET;

function signToken(payload) {
  // payload: { sub: id, role: 'customer' | 'admin', name, email }
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, payload) {
  const token = signToken(payload);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function readToken(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const decoded = readToken(req);
    if (!decoded || decoded.role !== role) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    req.user = decoded;
    next();
  };
}

function attachUser(req, _res, next) {
  req.user = readToken(req);
  next();
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, readToken, requireRole, attachUser };
