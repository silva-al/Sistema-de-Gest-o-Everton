// Ponto de entrada da API no Netlify.
//
// O Netlify não mantém servidor ligado: ele chama esta função a cada
// requisição que casa com /api/* (a regra está no netlify.toml). O
// serverless-http traduz o evento do Netlify para o formato que o Express
// entende, e a resposta do Express de volta para o Netlify.
//
// Quem entrega a loja e o painel é o CDN do Netlify, não o Express — por isso
// SERVE_STATIC=false, definido no netlify.toml.
const serverless = require('serverless-http');
const app = require('../../server/app');

// binary: aceita upload de imagem (multipart) e resposta de arquivo.
const handler = serverless(app, {
  binary: ['image/*', 'application/octet-stream', 'multipart/form-data'],
});

module.exports.handler = handler;
