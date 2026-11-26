// Testes das regras de filtro da Base (base.js).
import '../base.js';
const B = globalThis.BaseFiltros;
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };

ok(B.nivelCargo('CMO') === 'C-level' && B.nivelCargo('Sócio-fundador') === 'C-level' && B.nivelCargo('VP de Vendas') === 'C-level', 'C-level');
ok(B.nivelCargo('Gerente de Marketing') === 'Marketing' && B.nivelCargo('Head of Brand') === 'Marketing', 'marketing');
ok(B.nivelCargo('Diretor Comercial') === 'Diretoria' && B.nivelCargo('Head de Operações') === 'Diretoria', 'diretoria');
ok(B.nivelCargo('Analista') === 'Outros' && B.nivelCargo('') === 'sem cargo', 'outros e sem cargo');

const agora = Date.parse('2026-11-26T12:00:00Z');
const L = [
  { empresa_id: 'e1', empresa: 'Colégio A', setor: 'Educação', nome: 'Ana', cargo: 'Diretora de Marketing', email: 'a@x', wa: '11', estrelas: 4 },
  { empresa_id: 'e1', empresa: 'Colégio A', setor: 'Educação', nome: 'Beto', cargo: 'CEO', email: 'b@x', wa: null, estrelas: 4 },
  { empresa_id: 'e2', empresa: 'Faculdade B', setor: 'Educação', nome: 'Caio', cargo: 'Analista', email: null, wa: '12', estrelas: 2, empresa_ultimo_toque_em: '2026-11-20T10:00:00Z' },
  { empresa_id: 'e3', empresa: 'Banco C', setor: 'Financeiro', nome: 'Dani', cargo: 'CMO', email: 'd@x', wa: '13', estrelas: 5, cliente_ativo: true },
  { empresa_id: 'e4', empresa: 'Escola D', setor: 'educacao', nome: 'Edu', cargo: 'CMO', email: 'e@x', wa: '14', opt_out: true }
];
ok(B.filtrar(L, { setores: ['Educação'] }, agora).length === 3, 'filtro por setor (sem acento confere; opt-out fica fora)');
ok(B.filtrar(L, { setores: ['Educação'], umPorEmpresa: true }, agora).map(r => r.nome).sort().join() === 'Beto,Caio', 'um por empresa: cargo mais alto (CEO antes de Diretora de Marketing)');
ok(B.filtrar(L, { comEmail: true }, agora).length === 3, 'só com e-mail');
ok(B.filtrar(L, { comCelular: true, setores: ['Educação'] }, agora).map(r => r.nome).join() === 'Ana,Caio', 'só com celular');
ok(B.filtrar(L, { excluirClientes: true }, agora).every(r => !r.cliente_ativo), 'tira clientes ativos');
ok(B.filtrar(L, { semToqueDias: 30, setores: ['Educação'] }, agora).every(r => r.empresa_id !== 'e2'), 'tira quem foi tocado nos últimos 30 dias');
ok(B.filtrar(L, { estrelasMin: 4 }, agora).length === 3, 'estrelas mínimas');
ok(B.filtrar(L, { niveis: ['C-level'] }, agora).map(r => r.nome).join() === 'Beto,Dani', 'nível do cargo');
ok(B.filtrar(L, { busca: 'faculdade' }, agora).length === 1, 'busca por nome da empresa');
const rs = B.resumo(B.filtrar(L, { setores: ['Educação'] }, agora));
ok(rs.empresas === 2 && rs.contatos === 3 && rs.comEmail === 2 && rs.comCelular === 2 && rs.comAmbos === 1, 'resumo: empresas, contatos, e-mail, celular');
const cs = B.contarSetores(L);
ok(cs[0].setor === 'Educação' && cs[0].empresas === 2, 'contagem por setor conta empresas, não contatos');
const pl = B.notaPlacar({ empresas: 100, empresas_com_setor: 50, empresas_com_site: 10, empresas_com_contato: 80, contatos: 200, contatos_com_email: 180, contatos_com_celular: 100, contatos_com_cargo: 120, contatos_com_linkedin: 60 });
ok(pl.itens.find(i => i.k === 'email').pct === 90 && pl.nota > 0 && pl.nota < 100, 'placar: percentuais e nota geral');

console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
