// Depósito do Mac (WhatsApp + Contatos): regras puras (lib/mac-sync.js) e a rota mac-sync.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-fake';
import { createHash } from 'node:crypto';
import { chaveTelefone, telefoneDoJid, tipoConversa, midiaDoTipo, categoriaContato, empresaDoContato, indicePessoas, acharPessoa, celularPrincipal, nomeCompleto } from '../lib/mac-sync.js';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

ok(chaveTelefone('+55 (11) 98765-4321') === chaveTelefone('11 8765-4321') && chaveTelefone('5511987654321') === '1187654321' && chaveTelefone('123') === null, 'telefone casa com ou sem 9º dígito e +55');
ok(telefoneDoJid('5511987654321@s.whatsapp.net') === '5511987654321' && telefoneDoJid('123@lid') === null, 'número a partir do identificador do WhatsApp');
ok(tipoConversa('x@g.us') === 'grupo' && tipoConversa('1@lid') === 'pessoa' && tipoConversa('status@broadcast') === 'lista' && tipoConversa('1@lid.status') === 'status', 'tipo de conversa');
ok(midiaDoTipo(3, null) === '[áudio]' && midiaDoTipo(0, 'oi') === null, 'rótulo de mídia');
ok(categoriaContato({ empresa: 'Galeria' }) === 'interno' && categoriaContato({ empresa: '404' }) === 'interno' && categoriaContato({ emails: ['ana@galeriaholding.com.br'] }) === 'interno', 'gente das agências do grupo é interno');
ok(categoriaContato({ empresa: 'Natura' }) === 'trabalho' && categoriaContato({ emails: ['ana@natura.net'] }) === 'trabalho' && categoriaContato({ emails: ['mae@gmail.com'] }) === 'pessoal' && categoriaContato({}) === 'pessoal', 'trabalho x pessoal');
const emps = [{ id: 'eNat', nome: 'NATURA COSMETICOS S A', website: 'https://www.natura.net' }];
ok(empresaDoContato({ empresa: 'Natura Cosméticos' }, emps).id === 'eNat' && empresaDoContato({ emails: ['ana@natura.net'] }, emps).id === 'eNat' && empresaDoContato({ empresa: 'Padaria' }, emps) === null, 'acha a empresa pelo nome ou pelo domínio');
const idx = indicePessoas([{ id: 'd1', wa: '11 98765-4321' }, { id: 'd2', email: 'Bia@X.com' }]);
ok(acharPessoa({ telefones: ['+55 11 98765-4321'] }, idx).id === 'd1' && acharPessoa({ emails: ['bia@x.com'] }, idx).id === 'd2' && acharPessoa({ telefones: ['1133334444'] }, idx) === null, 'acha quem já está no CRM por telefone ou e-mail');
ok(celularPrincipal(['(11) 3333-4444', '+55 11 98765-4321']) === '5511987654321' && celularPrincipal(['1133334444']) === null, 'celular principal (ignora fixo)');
ok(nomeCompleto({ nome: 'Ana', sobrenome: 'Souza' }) === 'Ana Souza' && nomeCompleto({ apelido: 'Bia' }) === 'Bia', 'nome completo');

// Rota
const TOKEN = 'token-do-mac';
const T = { emp: [{ id: 'eNat', nome: 'NATURA COSMETICOS S A', website: 'natura.net' }], dec: [{ id: 'dAna', nome: 'Ana Souza', wa: null, email: 'ana@natura.net', empresa_id: 'eNat' }], agenda: [], conv: [], msgs: [], rpc: 0, cfg: { mac_sync_token_hash: createHash('sha256').update(TOKEN).digest('hex') } };
globalThis.fetch = async (url, opts = {}) => {
  const u = decodeURIComponent(String(url)); const mt = (opts.method || 'GET').toUpperCase();
  const body = opts.body && /^[\[{]/.test(opts.body) ? JSON.parse(opts.body) : null;
  const off = Number((u.match(/offset=(\d+)/) || [])[1] || 0);
  if (u.includes('crm_configuracoes') && mt === 'GET') { const k = (u.match(/chave=eq\.(\w+)/) || [])[1]; return json(T.cfg[k] ? [{ valor: T.cfg[k] }] : []); }
  if (u.includes('crm_configuracoes')) { for (const l of [].concat(body)) T.cfg[l.chave] = l.valor; return new Response(null, { status: 201 }); }
  if (u.includes('crm_empresas') && mt === 'GET') return json(off ? [] : T.emp);
  if (u.includes('crm_empresas') && mt === 'POST') { const e = Object.assign({ id: 'eNova' + T.emp.length }, body); T.emp.push(e); return json([e], 201); }
  if (u.includes('crm_decisores') && mt === 'GET') return json(off ? [] : T.dec);
  if (u.includes('crm_decisores') && mt === 'POST') { const d = Object.assign({ id: 'dNovo' + T.dec.length }, body); T.dec.push(d); return json([d], 201); }
  if (u.includes('crm_decisores') && mt === 'PATCH') { const id = (u.match(/id=eq\.(\w+)/) || [])[1]; Object.assign(T.dec.find(d => d.id === id), body); return new Response(null, { status: 204 }); }
  if (u.includes('crm_contatos_agenda') && mt === 'GET') return json(off ? [] : T.agenda);
  if (u.includes('crm_contatos_agenda')) { for (const l of body) { const i = T.agenda.findIndex(a => a.origem_id === l.origem_id); if (i >= 0) T.agenda[i] = l; else T.agenda.push(l); } return new Response(null, { status: 201 }); }
  if (u.includes('crm_wa_conversas')) { for (const l of body) { const i = T.conv.findIndex(a => a.jid === l.jid); if (i >= 0) T.conv[i] = l; else T.conv.push(l); } return new Response(null, { status: 201 }); }
  if (u.includes('crm_wa_mensagens')) { for (const l of body) if (!T.msgs.some(m => m.jid === l.jid && m.stanza === l.stanza)) T.msgs.push(l); return new Response(null, { status: 201 }); }
  if (u.includes('rpc/wa_gerar_toques')) { T.rpc++; return json(7); }
  if (u.includes('crm_logs')) return new Response(null, { status: 201 });
  return json([]);
};
const { default: enrich } = await import(new URL('../api/enrich.js', import.meta.url).href);
const chamar = (body, token = TOKEN) => new Promise((resolve) => {
  const res = { _s: 200, status(s) { this._s = s; return this; }, json(b) { resolve({ status: this._s, body: b }); return this; }, setHeader() {}, end() { resolve({ status: this._s }); }, redirect() {} };
  enrich({ method: 'POST', query: { provider: 'mac-sync' }, headers: token ? { 'x-sync-token': token } : {}, body: JSON.stringify(body) }, res);
});
ok((await chamar({ acao: 'fim' }, 'errado')).status === 401 && (await chamar({ acao: 'fim' }, null)).status === 401, 'sem o token do Mac: 401');
let r = await chamar({ acao: 'contatos', contatos: [
  { id: 'c1', nome: 'Ana', sobrenome: 'Souza', empresa: 'Natura', telefones: ['+55 11 98765-4321'], emails: ['ana@natura.net'] },
  { id: 'c2', nome: 'Carlos', sobrenome: 'Lima', empresa: 'Padaria Pão Bom', cargo: 'Diretor', telefones: ['11 97777-6666'], emails: [] },
  { id: 'c3', nome: 'Mãe', telefones: ['11 95555-4444'], emails: ['mae@gmail.com'] },
  { id: 'c4', nome: 'Rafa', empresa: 'Galeria', telefones: ['11 93333-2222'], emails: [] },
  { id: 'c5', nome: 'Bia', sobrenome: 'Reis', telefones: ['11 92222-1111'], emails: ['bia@natura.net'] }
] });
ok(r.status === 200 && r.body.trabalho === 3 && r.body.pessoal === 1 && r.body.interno === 1, 'classifica trabalho, pessoal e interno — ' + JSON.stringify(r.body));
ok(T.dec.find(d => d.id === 'dAna').wa === '5511987654321' && r.body.pessoas_completadas === 1, 'completa o WhatsApp da Ana que já estava no CRM');
const carlos = T.dec.find(d => d.nome === 'Carlos Lima'), bia = T.dec.find(d => d.nome === 'Bia Reis');
ok(carlos && carlos.status === 'sugerido' && carlos.etapa_cadencia === 'off' && carlos.fonte === 'agenda' && T.emp.some(e => e.nome === 'Padaria Pão Bom' && e.fonte === 'agenda') && carlos.wa === '5511977776666', 'contato de trabalho novo vira pessoa sugerida, com empresa nova');
ok(bia && bia.empresa_id === 'eNat', 'empresa achada pelo domínio do e-mail');
ok(!T.dec.some(d => /Mãe|Rafa/.test(d.nome)) && T.agenda.length === 5 && T.agenda.find(a => a.origem_id === 'c3').categoria === 'pessoal', 'pessoal e interno ficam só na agenda, não viram prospect');
r = await chamar({ acao: 'conversas', conversas: [
  { jid: '5511987654321@s.whatsapp.net', sessao: 0, nome: 'Ana', mensagens: 10 },
  { jid: '999@lid', sessao: 0, nome: 'Carlos', telefone: '5511977776666', mensagens: 3 },
  { jid: '5511955554444@s.whatsapp.net', sessao: 0, nome: 'Mãe', mensagens: 500 },
  { jid: '5511933332222@s.whatsapp.net', sessao: 0, nome: 'Rafa', mensagens: 50 },
  { jid: '123-456@g.us', sessao: 1, nome: 'Família', mensagens: 900 }
] });
const cv = (j) => T.conv.find(c => c.jid === j);
ok(cv('5511987654321@s.whatsapp.net').decisor_id === 'dAna' && cv('5511987654321@s.whatsapp.net').empresa_id === 'eNat' && cv('999@lid').decisor_id === carlos.id, 'conversa ligada à pessoa e à empresa (também pelo identificador novo)');
ok(cv('5511955554444@s.whatsapp.net').categoria === 'pessoal' && !cv('5511955554444@s.whatsapp.net').decisor_id && cv('5511933332222@s.whatsapp.net').categoria === 'interno' && !cv('5511933332222@s.whatsapp.net').decisor_id && cv('123-456@g.us').tipo === 'grupo', 'pessoal, interno e grupo guardados sem virar histórico de prospecção');
r = await chamar({ acao: 'mensagens', mensagens: [{ jid: '5511987654321@s.whatsapp.net', stanza: 's1', de_mim: true, texto: 'Oi Ana', tipo: 0, enviada_em: '2026-11-20T12:00:00Z' }, { jid: '5511987654321@s.whatsapp.net', stanza: 's2', de_mim: false, texto: null, tipo: 3, enviada_em: '2026-11-20T12:01:00Z' }] });
await chamar({ acao: 'mensagens', mensagens: [{ jid: '5511987654321@s.whatsapp.net', stanza: 's1', de_mim: true, texto: 'Oi Ana', tipo: 0, enviada_em: '2026-11-20T12:00:00Z' }] });
ok(T.msgs.length === 2 && T.msgs[1].midia === '[áudio]', 'guarda mensagens sem duplicar, com rótulo de mídia');
r = await chamar({ acao: 'fim', resumo: { mensagens: 2 } });
ok(r.body.toques_novos === 7 && T.rpc === 1 && T.cfg.mac_sync_ultima && T.cfg.mac_sync_ultima.resumo.mensagens === 2, 'no fim gera o histórico e registra a última sincronização');
console.log(`\n${n - fail} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
