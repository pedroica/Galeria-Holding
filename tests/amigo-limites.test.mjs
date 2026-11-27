// Amigo: tarefa grande não termina em "Não consegui formular resposta" (26/11).
process.env.ANTHROPIC_API_KEY = 'sk-falso'; process.env.SUPA_CRM_SERVICE_KEY = 'service-falso';
let fail = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('  ✓ ' + m); else { fail++; console.log('  ✗ ' + m); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
let modo = 'infinito', chamadasIA = 0, ultimoPedido = null;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url);
  if (u.includes('api.anthropic.com')) {
    chamadasIA++; const b = JSON.parse(o.body); ultimoPedido = b;
    const usage = { input_tokens: 10, output_tokens: 10 };
    if (b.tool_choice && b.tool_choice.type === 'none') return json({ id: 'm', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: 'Fiz parte: XP em Perdido. Falta o resto, responda continua.' }], stop_reason: 'end_turn', usage });
    if (modo === 'cortado') return json({ id: 'm', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: 'max_tokens', usage });
    return json({ id: 'm', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'tool_use', id: 'tu' + chamadasIA, name: 'pipeline', input: {} }], stop_reason: 'tool_use', usage });
  }
  if (u.includes('/rest/v1/')) return json([]);
  return json({});
};
const { responderWhatsApp } = await import('../api/copiloto.js');
let r = await responderWhatsApp({ texto: 'monta o pipeline todo', historico: [] });
ok(/Falta o resto/.test(r.texto) && r.ferramentas.length === 30, 'bate o limite de 30 ações e resume o que fez (não fica sem resposta)');
ok(ultimoPedido.tool_choice.type === 'none' && ultimoPedido.messages.at(-1).content.some(c => c.type === 'tool_result') && ultimoPedido.messages.at(-1).content.some(c => c.type === 'text'), 'fecha os tool_use pendentes antes do resumo');
modo = 'cortado'; chamadasIA = 0;
r = await responderWhatsApp({ texto: 'oi', historico: [] });
ok(/Falta o resto/.test(r.texto), 'resposta cortada por tamanho: pede o resumo');
console.log(`\n${n - fail}/${n} ok`); if (fail) process.exit(1);
