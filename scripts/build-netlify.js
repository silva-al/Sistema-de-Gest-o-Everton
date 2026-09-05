// Monta a pasta "dist" que o Netlify publica no CDN.
//
// O Netlify publica UMA pasta só. Como a loja fica em public/loja e o painel em
// public/admin, este script junta as duas na estrutura final:
//
//   dist/            <- conteúdo de public/loja  (a loja, na raiz do site)
//   dist/admin/      <- conteúdo de public/admin (o painel, em /admin)
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const dist = path.join(raiz, 'dist');

function copiarPasta(origem, destino) {
  if (!fs.existsSync(origem)) {
    console.warn(`Aviso: pasta de origem não encontrada, ignorando: ${origem}`);
    return 0;
  }
  fs.mkdirSync(destino, { recursive: true });
  let total = 0;
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const de = path.join(origem, item.name);
    const para = path.join(destino, item.name);
    if (item.isDirectory()) {
      total += copiarPasta(de, para);
    } else {
      fs.copyFileSync(de, para);
      total += 1;
    }
  }
  return total;
}

fs.rmSync(dist, { recursive: true, force: true });

const daLoja = copiarPasta(path.join(raiz, 'public', 'loja'), dist);
const doAdmin = copiarPasta(path.join(raiz, 'public', 'admin'), path.join(dist, 'admin'));
const deUploads = copiarPasta(path.join(raiz, 'public', 'uploads'), path.join(dist, 'uploads'));

console.log(`Build pronto: ${daLoja} arquivos da loja + ${doAdmin} do painel + ${deUploads} uploads em dist/`);

if (daLoja === 0) {
  console.error('ERRO: nenhum arquivo da loja foi copiado. O site sairia vazio.');
  process.exit(1);
}
