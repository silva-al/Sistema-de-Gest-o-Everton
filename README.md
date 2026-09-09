# Fahren Parts — loja + painel de gestão

Sistema com duas telas:
- **Loja do cliente** (`/`): cadastro/login, catálogo com busca avançada, carrinho, endereço
  de entrega (CEP automático via ViaCEP), pedidos e o botão flutuante do WhatsApp.
- **Painel de gestão** (`/admin`): login separado da equipe, cadastro/edição de peças
  (estoque) e acompanhamento dos pedidos dos clientes com mudança de status.

Todos os dados (clientes, senhas com hash, peças, pedidos) ficam num banco de dados
PostgreSQL — nada fica só no navegador.

## 1. Passo a passo local (para testar no seu computador)

Pré-requisitos: [Node.js](https://nodejs.org) 18 ou mais novo instalado.

```bash
cd fahren-parts
npm install
cp .env.example .env
```

Abra o `.env` e preencha `DATABASE_URL` com a connection string do seu banco (veja o passo 2
abaixo para criar um banco grátis no Supabase). Depois rode:

```bash
# cria as tabelas e o primeiro usuário admin
ADMIN_EMAIL=voce@fahrenparts.com ADMIN_PASSWORD=escolha-uma-senha-forte node server/init-db.js

# sobe o servidor
npm start
```

Acesse `http://localhost:3000` (loja) e `http://localhost:3000/admin` (painel), usando o
e-mail/senha que você definiu em `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## 2. Criar o banco de dados grátis (Supabase)

1. Crie uma conta em https://supabase.com e um novo projeto (escolha uma senha de banco e
   guarde ela).
2. No painel do projeto: **Project Settings → Database → Connection string**, escolha o modo
   **URI** e copie o link. Substitua `[YOUR-PASSWORD]` pela senha que você definiu.
3. Cole esse link em `DATABASE_URL` no seu `.env` (localmente) e depois nas variáveis de
   ambiente da hospedagem (passo 3).

O plano grátis do Supabase já é suficiente para começar.


## Estrutura do projeto

```
server/            Backend (Node + Express + PostgreSQL)
  server.js         ponto de entrada
  db.js             conexão com o banco
  schema.sql         estrutura das tabelas
  init-db.js         cria tabelas + primeiro usuário admin
  middleware/auth.js login/sessão (JWT em cookie)
  routes/            auth, admin-auth, products, orders, addresses,
                     payments, vehicles, uploads
  services/          payment-service.js (Pix/cartão), vehicle-service.js (placa)
  migrations/        histórico das mudanças de banco (o schema.sql já aplica tudo)
public/loja/        Tela do cliente (index.html, styles.css, app.js)
public/admin/       Painel de gestão (index.html, admin.css, admin.js)
public/uploads/     Fotos de peças enviadas pelo painel (não vai para o Git)
```

## Pagamento online (Pix e cartão)

Já está funcionando dentro do site:

- **Pix**: gera QR Code e "copia e cola" no padrão do Banco Central, com 4% de desconto.
- **Cartão de crédito**: formulário do Mercado Pago (Checkout Bricks) dentro da própria
  página — o número do cartão nunca passa pelo nosso servidor, só um token. Parcelamento
  em até 12x.

Sem as chaves configuradas o sistema roda em **modo teste**: o Pix sai com a chave do
`PIX_KEY` (ou simulado) e o cartão aprova automaticamente, para você conseguir testar a loja
inteira antes de contratar a maquininha. Para valer de verdade, preencha no `.env`:

- `MERCADOPAGO_ACCESS_TOKEN` — fica só no servidor, nunca aparece no site.
- `MERCADOPAGO_PUBLIC_KEY` — é o que o navegador usa para montar o formulário do cartão.
  Sem ela, a opção "Cartão" não aparece para o cliente.
- `PIX_KEY` — alternativa ao Mercado Pago, se preferir receber Pix direto na conta.

No painel do Mercado Pago, aponte o **webhook** para `https://SEU-SITE/api/payments/webhook`
para os pagamentos aprovados fora do site caírem sozinhos no pedido.

## Consulta por placa

A rota `/api/vehicles/plate/:placa` já existe e aceita placa Mercosul e antiga. Sem
`VEHICLE_API_TOKEN` configurado ela responde com dados de **demonstração** (marca, modelo,
ano — sempre os mesmos para a mesma placa), o que serve para apresentar a tela ao Everton.
Com o token de um provedor (WDAPI2, APIBrasil ou compatível) ela passa a trazer dados reais.

## O que ainda falta decidir (pendências combinadas com o Everton)

- **Fonte dos dados de placa**: definir com o dono da oficina qual provedor contratar (a
  consulta real é paga por consulta) — e se a tela "Placa" deve mostrar os veículos que
  estão na oficina em vez de consulta aberta. A tela da loja ainda não chama a rota acima.
- **Fotos das peças**: o upload de imagens pode ser feito via Supabase Storage ou disco local. O painel WMS permite envio e gestão de fotos diretamente pelo cadastro da peça.

## Segurança

- Senhas de clientes e de admins são salvas com hash (bcrypt) — nunca em texto puro.
- Sessão de login usa cookie `httpOnly` (não pode ser lido/roubado por JavaScript malicioso).
- Rotas de cadastro/edição de peças e de gestão de pedidos exigem login de admin; rotas do
  cliente exigem login de cliente. Um tipo de usuário não acessa as rotas do outro.
- **Limite de tentativas de login**: 8 erros por IP a cada 15 min na loja, 5 no painel —
  trava ataque de força bruta contra a conta de um cliente ou da equipe. Login certo não
  gasta tentativa.
- **CORS fechado**: só os endereços listados em `CORS_ORIGINS` podem chamar a API de outro
  domínio. Vazio (o padrão) = só a própria loja.
- **`JWT_SECRET` obrigatório**: em produção o servidor não sobe com segredo vazio ou com
  menos de 32 caracteres.
- **Criação do admin exige senha forte**: `server/init-db.js` recusa rodar sem
  `ADMIN_PASSWORD` (mínimo 10 caracteres) e não imprime a senha no log.
- Erros inesperados devolvem só uma mensagem curta — nunca o rastro do código.

### O que ainda dá para melhorar (não está feito)

- **CPF/CNPJ é gravado em texto puro** no banco. É dado pessoal (LGPD): se um dia o banco
  vazar, vaza junto. Só colete se realmente precisar emitir nota.
- **`rejectUnauthorized: false` na conexão do banco** (`server/db.js`) desliga a
  conferência do certificado do banco. Funciona, mas é menos seguro que validar a cadeia.
- **Não há troca de senha nem "esqueci minha senha"** para o cliente.
- **Webhook do Mercado Pago sem conferência de assinatura** — hoje é seguro porque o código
  reconsulta o pagamento na API do MP antes de aprovar, mas vale assinar quando for para
  produção com volume.

## Como rodar o servidor

Para rodar localmente ou em servidor de produção:
1. Instale as dependências: `npm install`
2. Configure o arquivo `.env` com suas credenciais.
3. Inicie o sistema: `npm start` (ou `npm run dev`)
   - O servidor iniciará em `http://localhost:3000`
   - O painel de gestão WMS estará em `http://localhost:3000/admin`

