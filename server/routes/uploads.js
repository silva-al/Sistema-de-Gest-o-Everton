// Upload de imagens para produtos (restrito a admin).
//
// Existem dois destinos possíveis, escolhidos automaticamente:
//
// 1. Supabase Storage — usado quando SUPABASE_URL e SUPABASE_SERVICE_KEY estão
//    definidos. É o modo obrigatório no Netlify e o recomendado em qualquer
//    lugar, porque a foto fica guardada de verdade.
//
// 2. Disco local (public/uploads/products) — só quando o Supabase não está
//    configurado. Serve para testar na sua máquina. NÃO use em produção:
//    tanto no Render quanto no Netlify o disco é temporário e as fotos somem
//    no próximo deploy.
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'produtos';
const usarSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5 MB

function nomeDeArquivo(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.jpg';
  const base = path
    .basename(originalname || '', ext)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 20);
  const sufixo = Date.now() + '-' + Math.round(Math.random() * 1e6);
  return `peca-${base ? base + '-' : ''}${sufixo}${ext}`;
}

const fileFilter = (_req, file, cb) => {
  if (TIPOS_PERMITIDOS.includes((file.mimetype || '').toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Formato de imagem inválido. Use JPG, PNG ou WEBP.'));
  }
};

// No Supabase o arquivo passa pela memória; no disco, vai direto para a pasta.
let upload;
if (usarSupabase) {
  upload = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: TAMANHO_MAXIMO } });
} else {
  const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'products');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, nomeDeArquivo(file.originalname)),
  });
  upload = multer({ storage, fileFilter, limits: { fileSize: TAMANHO_MAXIMO } });
}

async function enviarParaSupabase(file) {
  const nome = nomeDeArquivo(file.originalname);
  const destino = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${nome}`;

  const resposta = await fetch(destino, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': file.mimetype,
      'x-upsert': 'true',
    },
    body: file.buffer,
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(
      `Falha ao enviar a imagem para o Supabase Storage (${resposta.status}). ` +
        `Confira se o bucket "${SUPABASE_BUCKET}" existe e está público. ${detalhe}`.trim()
    );
  }

  return {
    url: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${nome}`,
    filename: nome,
  };
}

router.post('/', requireRole('admin'), (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'A imagem deve ter no máximo 5MB.' });
      }
      return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    try {
      if (usarSupabase) {
        const { url, filename } = await enviarParaSupabase(req.file);
        return res.json({ url, filename, size: req.file.size, storage: 'supabase' });
      }
      return res.json({
        url: `/uploads/products/${req.file.filename}`,
        filename: req.file.filename,
        size: req.file.size,
        storage: 'disco-local',
      });
    } catch (erro) {
      console.error('[Uploads]', erro.message);
      return res.status(502).json({ error: erro.message });
    }
  });
});

module.exports = router;
