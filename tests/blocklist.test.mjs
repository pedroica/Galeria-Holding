// tests/blocklist.test.mjs — matcher da blocklist (lib/blocklist.js)
// Casos reais extraídos de crm_empresas (produção) para garantir que o
// enforcement da fila bloqueia clientes da holding sem falsos-positivos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBlocklist } from '../lib/blocklist.js';

const SEED = [
  { nome_canonico: 'Google', aliases: ['google', 'alphabet', 'youtube'], dominios: ['google.com', 'google.com.br'], ativo: true },
  { nome_canonico: 'Itaú', aliases: ['itau', 'itau unibanco', 'banco itau', 'itaucard'], dominios: ['itau.com.br'], ativo: true },
  { nome_canonico: "McDonald's", aliases: ['mcdonald', 'mcdonalds', 'arcos dorados'], dominios: ['mcdonalds.com'], ativo: true },
  { nome_canonico: 'Havaianas', aliases: ['havaianas', 'alpargatas'], dominios: ['havaianas.com.br'], ativo: true },
  { nome_canonico: 'Bauducco', aliases: ['bauducco', 'pandurata'], dominios: ['bauducco.com.br'], ativo: true },
  { nome_canonico: 'Natura', aliases: ['natura', 'avon'], dominios: ['natura.com.br', 'naturaeco.com'], ativo: true },
];
const bl = makeBlocklist(SEED);

test('bloqueia clientes da holding (nomes reais de crm_empresas)', () => {
  for (const nome of [
    'GOOGLE', "MCDONALD'S", 'IND E COM DE COSMETICOS NATURA LTDA', 'BAUDUCCO',
    'HAVAIANAS (ALPARGATAS)', 'Natura &Co', 'Bauducco Big promo',
    'Google Gemini Rock in Rio', 'Natura Dia dos pais', 'ITAU SEGUROS',
  ]) {
    assert.equal(bl.isBlocked({ name: nome }), true, `deveria bloquear: ${nome}`);
  }
});

test('NÃO bloqueia empresas diferentes (sem falso-positivo por substring)', () => {
  for (const nome of ['GRUPO NATURAL DA TERRA', 'NATURALE', 'SIGNATURA LAZARD', 'ITAUTEC', 'ATLÂNTICA NATURAL', 'Gerdau']) {
    assert.equal(bl.isBlocked({ name: nome }), false, `não deveria bloquear: ${nome}`);
  }
});

test('bloqueia por domínio e subdomínio de e-mail', () => {
  assert.equal(bl.isBlocked({ email: 'cmo@natura.com.br' }), true);
  assert.equal(bl.isBlocked({ email: 'x@mail.itau.com.br' }), true);
  assert.equal(bl.isBlocked({ email: 'x@naturaeco.com' }), true);
  assert.equal(bl.isBlocked({ email: 'contato@gerdau.com.br' }), false);
  assert.equal(bl.isBlocked({ email: 'x@naoitau.com.br' }), false);
});

test('entradas inativas/apagadas não bloqueiam', () => {
  const m = makeBlocklist([{ nome_canonico: 'X', aliases: ['x'], dominios: [], ativo: false }]);
  assert.equal(m.isBlocked({ name: 'X' }), false);
});
