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

## 3. Colocar no ar (Render)

1. Crie uma conta em https://render.com e conecte seu repositório do GitHub (suba esta pasta
   para um repositório do GitHub primeiro — pode ser privado).
2. Clique em **New → Web Service**, aponte para o repositório.
3. Configurações do serviço:
   - **Build command**: `npm install`
   - **Start command**: `npm start`
4. Em **Environment**, adicione as variáveis:
   - `DATABASE_URL` = a connection string do Supabase (passo 2)
   - `JWT_SECRET` = um texto longo e aleatório (pode gerar em https://generate-secret.vercel.app/32)
   - `NODE_ENV` = `production`
5. Depois do primeiro deploy, rode uma vez o script de inicialização do banco. No Render, use
   a aba **Shell** do serviço (ou rode localmente apontando `DATABASE_URL` para o Supabase):
   ```bash
   ADMIN_EMAIL=voce@fahrenparts.com ADMIN_PASSWORD=escolha-uma-senha-forte node server/init-db.js
   ```
6. Pronto — o Render vai te dar uma URL pública (tipo `https://fahren-parts.onrender.com`).
   A loja fica em `/` e o painel em `/admin`.

No plano grátis do Render, o serviço "dorme" depois de um tempo sem uso e demora alguns
segundos para acordar na primeira visita — isso não afeta os dados (que ficam no Supabase),
só a velocidade da primeira carga do dia.

## Estrutura do projeto

```
server/            Backend (Node + Express + PostgreSQL)
  server.js         ponto de entrada
  db.js             conexão com o banco
  schema.sql         estrutura das tabelas
  init-db.js         cria tabelas + primeiro usuário admin
  middleware/auth.js login/sessão (JWT em cookie)
  routes/            auth, admin-auth, products, orders, addresses
public/loja/        Tela do cliente (index.html, styles.css, app.js)
public/admin/       Painel de gestão (index.html, admin.css, admin.js)
```

## O que ainda falta decidir (pendências combinadas com o Everton)

- **Consulta de placa real**: hoje a tela "Placa" continua só visual (não busca dados de
  verdade). Assim que definir com o dono da oficina qual fonte de dados usar para os veículos
  que estão na oficina, essa parte é conectada.
- **Pagamento online**: os pedidos hoje só ficam registrados com status (novo → em preparação
  → pronto → entregue). Se quiser cobrar via Pix/cartão dentro do site, isso entra depois como
  uma etapa nova.

## Segurança

- Senhas de clientes e de admins são salvas com hash (bcrypt) — nunca em texto puro.
- Sessão de login usa cookie `httpOnly` (não pode ser lido/roubado por JavaScript malicioso).
- Rotas de cadastro/edição de peças e de gestão de pedidos exigem login de admin; rotas do
  cliente exigem login de cliente. Um tipo de usuário não acessa as rotas do outro.
