// tests/sdr-selecao.test.mjs — Bloco B: seleção do lote (lib/sdr-selecao.js).
// Rodar: node tests/sdr-selecao.test.mjs
import { escolherAgencia, selecionarLote } from '../lib/sdr-selecao.js';
import { makeBlocklist } from '../lib/blocklist.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALHOU: ') + m); };

const AG = [
  { id: 'ag-404', slug: '404', nome: '404' },
  { id: 'ag-cat', slug: 'catalyst', nome: 'Catalyst' },
  { id: 'ag-mila', slug: 'mila', nome: 'Milà' },
  { id: 'ag-gal', slug: 'galeria', nome: 'Galeria' },
  { id: 'ag-hold', slug: 'holding', nome: 'Holding' },
];

console.log('Seleção — atribuição de agência');
ok(escolherAgencia({ setor: 'Tecnologia e software' }, null, AG).slug === '404', 'setor tech → 404');
ok(escolherAgencia({ setor: 'app de delivery mobile' }, null, AG).slug === 'catalyst', 'mobile/app → catalyst');
ok(escolherAgencia({ setor: 'indústria de celulose B2B' }, null, AG).slug === 'mila', 'B2B/indústria → mila');
ok(escolherAgencia({ setor: 'bebidas' }, 'lancamento', AG).slug === 'galeria', 'sem match + sinal de lançamento → galeria');
ok(escolherAgencia({ setor: 'bebidas' }, null, AG).slug === 'holding', 'sem match e sem sinal → holding (padrão)');

console.log('\nSeleção — exclusões, caps e prioridade');
const blocklist = makeBlocklist([{ nome_canonico: 'Natura', aliases: [], dominios: ['natura.com.br'], grupo_economico: null, ativo: true }]);
const hoje = Date.now();
const d = (o) => Object.assign({ status: null, etapa_cadencia: 'etapa1', email: 'x@y.com', wa: '5511999', email_valido: true }, o);
const candidatos = [
  d({ id: 'd1', nome: 'Ana', empresa_id: 'e1', empresa: { id: 'e1', nome: 'Alfa', setor: 'tech' }, ultimo_toque_em: null }),
  d({ id: 'd2', nome: 'Bruno', empresa_id: 'e1', empresa: { id: 'e1', nome: 'Alfa', setor: 'tech' }, ultimo_toque_em: null }),
  d({ id: 'd3', nome: 'Caio', empresa_id: 'e1', empresa: { id: 'e1', nome: 'Alfa', setor: 'tech' }, ultimo_toque_em: null }), // 3º da mesma empresa → cap
  d({ id: 'd4', nome: 'Dora', empresa_id: 'e2', empresa: { id: 'e2', nome: 'Natura', dominio: 'natura.com.br', setor: 'beleza' } }), // blocklist
  d({ id: 'd5', nome: 'Edu', empresa_id: 'e3', empresa: { id: 'e3', nome: 'Gama', cliente_ativo: true, setor: 'varejo' } }), // upsell
  d({ id: 'd6', nome: 'Fay', empresa_id: 'e4', empresa: { id: 'e4', nome: 'Delta', setor: 'tech' }, etapa_cadencia: 'off' }), // off
  d({ id: 'd7', nome: 'Gil', empresa_id: 'e5', empresa: { id: 'e5', nome: 'Echo', setor: 'tech' }, email_valido: false, wa: null }), // sem canal
  d({ id: 'd8', nome: 'Hel', empresa_id: 'e6', empresa: { id: 'e6', nome: 'Foxtrot', setor: 'tech' } }), // tocada 30d
];
const r = selecionarLote({
  candidatos, estrelas: { e1: 5 }, blocklist,
  toquesEmpresa30d: { e6: [{ agencia_id: 'ag-x' }] },
  dossies: {}, agencias: AG, primeirosContatoSemana: [], config: { lote_max: 30 }, agora: hoje
});
const ids = r.lote.map(x => x.decisor_id);
ok(ids.includes('d1') && !ids.includes('d2') && !ids.includes('d3'),
   '4.2: no máx. 1 primeiro contato por empresa na semana — só d1 (de Alfa) entra');
ok(!ids.includes('d4'), 'd4 barrado pela blocklist (Natura)');
ok(r.upsell.some(u => u.decisor_id === 'd5'), 'd5 (cliente ativo) vai para upsell, não para o lote frio');
ok(!ids.includes('d6'), 'd6 barrado por cadência off');
ok(!ids.includes('d7'), 'd7 barrado por bounce sem WhatsApp');
ok(!ids.includes('d8'), 'd8 barrado por empresa tocada em 30d');
ok(r.lote[0] && r.lote[0].agencia_slug === '404', 'agência atribuída (tech → 404) no item selecionado');

// cap de 1 primeiro contato por empresa na semana
const r2 = selecionarLote({ candidatos, estrelas: {}, blocklist, toquesEmpresa30d: {}, dossies: {}, agencias: AG, primeirosContatoSemana: ['e1'], config: { lote_max: 30 }, agora: hoje });
ok(!r2.lote.some(x => x.empresa_id === 'e1'), 'empresa que já teve 1º contato na semana é barrada');

// lote_max respeitado
const muitos = Array.from({ length: 50 }, (_, i) => d({ id: 'm' + i, nome: 'M' + i, empresa_id: 'emp' + i, empresa: { id: 'emp' + i, nome: 'E' + i, setor: 'tech' } }));
const r3 = selecionarLote({ candidatos: muitos, estrelas: {}, blocklist, toquesEmpresa30d: {}, dossies: {}, agencias: AG, primeirosContatoSemana: [], config: { lote_max: 10 }, agora: hoje });
ok(r3.lote.length === 10, 'lote_max=10 respeitado (' + r3.lote.length + ')');

console.log('\nFila própria por empresa (intercalação)');
{
  const mk = (id, setor) => ({ id: 'd' + id, nome: 'N' + id, empresa_id: 'e' + id, email: id + '@x.com', crm_empresas: { nome: 'Emp' + id, setor }, ultimo_toque_em: null });
  const cands = [mk(1, 'alimentos'), mk(2, 'alimentos'), mk(3, 'alimentos'), mk(4, 'alimentos'), mk(5, 'varejo'), mk(6, 'tecnologia')];
  const ags = [{ slug: 'holding', id: 'h' }, { slug: 'vitrine', id: 'v' }, { slug: '404', id: 'q' }];
  const r = selecionarLote({ candidatos: cands, agencias: ags, config: { lote_max: 3 }, agora: Date.now() });
  const slugs = r.lote.map(x => x.agencia_slug).sort().join(',');
  ok(slugs === '404,holding,vitrine', 'lote de 3 com 3 agências, não 3 da Holding (' + slugs + ')');
  const r2 = selecionarLote({ candidatos: cands, agencias: ags, config: { lote_max: 3, intercalar_agencias: false }, agora: Date.now() });
  ok(r2.lote.length === 3, 'intercalação pode ser desligada');
}

console.log('\nNão reseleciona quem já está no fluxo');
{
  const mk = (id) => ({ id: 'd' + id, nome: 'N' + id, empresa_id: 'e' + id, email: id + '@x.com', crm_empresas: { nome: 'Emp' + id }, ultimo_toque_em: null });
  const r = selecionarLote({ candidatos: [mk(1), mk(2)], agencias: [{ slug: 'holding', id: 'h' }], emCurso: new Set(['d1']), config: { lote_max: 5 }, agora: Date.now() });
  ok(r.lote.length === 1 && r.lote[0].decisor_id === 'd2' && r.excluidos.some(x => x.motivo === 'ja_em_curso'), 'quem tem estado recente fica de fora (ja_em_curso)');
}

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
