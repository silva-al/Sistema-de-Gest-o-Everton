// Limitador de tentativas simples, em memória — sem dependência nova.
// Serve para travar ataque de força bruta nas telas de login: alguém rodando
// um script com milhares de senhas contra a conta de um cliente ou do admin.
//
// Como é em memória, o contador zera quando o servidor reinicia e não é
// compartilhado entre instâncias. Para uma loja deste tamanho isso basta;
// se um dia rodar em várias instâncias, trocar por Redis.

const buckets = new Map();

// Limpeza periódica para a memória não crescer sem parar.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
// Não segura o processo aberto por causa do timer.
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

function clientKey(req) {
  // Atrás do proxy do Render o IP real vem no X-Forwarded-For.
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'desconhecido';
}

/**
 * @param {object} options
 * @param {number} options.windowMs  janela de tempo
 * @param {number} options.max       tentativas permitidas na janela
 * @param {string} options.message   mensagem devolvida ao estourar
 * @param {boolean} options.countOnlyFailures  se true, só conta respostas 4xx/5xx
 *        (um login que deu certo não gasta tentativa)
 */
function rateLimit({ windowMs, max, message, countOnlyFailures = false }) {
  return (req, res, next) => {
    const key = `${req.baseUrl}${req.path}|${clientKey(req)}`;
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    if (entry.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message });
    }

    if (countOnlyFailures) {
      res.on('finish', () => {
        if (res.statusCode >= 400) entry.count += 1;
      });
    } else {
      entry.count += 1;
    }

    next();
  };
}

module.exports = { rateLimit };
