// lib/sdr-aprendizado.js — aprendizado comercial contínuo. Puro e testável.
//  - analisarEdicao: compara a versão do agente com a final do Pedro e classifica a mudança.
//  - perfilDeComunicacao: estatísticas das mensagens aprovadas/enviadas (só com amostra mínima).
//  - propostasDeAprendizado: transforma eventos em PROPOSTAS (status 'proposto');
//    nada vira regra sem o Pedro ativar.
//  - montarMemoriaPrompt: memória ATIVA, filtrada por escopo, para o estrategista e a redação.

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const palavras = (t) => (String(t || '').match(/[\p{L}\p{N}]+/gu) || []);
const frases = (t) => String(t || '').replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
// Assinatura e saudação final não contam como "conteúdo".
const semAssinatura = (t) => String(t || '').replace(/\n+\s*(abra[çc]o|abs|att|atenciosamente)[,.]?\s*\n+\s*pedro ica[\s\S]*$/i, '').replace(/\n+\s*pedro ica\s*$/i, '').trim();

const ADJETIVOS = ['incrivel', 'inovador', 'inovadora', 'robusto', 'robusta', 'completo', 'completa', 'exclusivo', 'exclusiva', 'unico', 'unica', 'poderoso', 'poderosa', 'excelente', 'otimo', 'otima', 'fantastico', 'revolucionario', 'disruptivo', 'disruptiva', 'extraordinario', 'impressionante', 'estrategico', 'estrategica', 'transformador', 'transformadora', 'sensacional', 'enorme', 'gigante'];
const ARTIFICIAL = /(espero que (esteja|esta)|gostaria de apresentar|venho por meio|no cenario atual|em um mundo|mais do que nunca|nao e apenas|alavancar|potencializar|sinergia|jornada|agregar valor|solucao completa|fico a disposicao)/;
const SOLUCOES_TXT = /(cr\.?ia|brandsync|catalyst|gaia|geo\b|generative engine|nos\b|natura operating|hiper presence|galeria|blitz)/g;

function similaridade(a, b) {
  const A = new Set(palavras(norm(a))), B = new Set(palavras(norm(b)));
  if (!A.size && !B.size) return 1;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
function ultimaPergunta(t) { const fs = frases(t).filter(f => /\?\s*$/.test(f)); return fs.length ? fs[fs.length - 1] : (frases(t).slice(-1)[0] || ''); }

export function analisarEdicao(original, final) {
  const o = { assunto: String(original && original.assunto || ''), corpo: semAssinatura(original && original.corpo) };
  const f = { assunto: String(final && final.assunto || ''), corpo: semAssinatura(final && final.corpo) };
  const mudouAssunto = norm(o.assunto) !== norm(f.assunto);
  const mudouCorpo = norm(o.corpo) !== norm(f.corpo);
  const pa = palavras(o.corpo).length, pd = palavras(f.corpo).length;
  const sim = similaridade(o.corpo, f.corpo);
  const cats = [];
  if (!mudouAssunto && !mudouCorpo) return { sem_alteracao: true, mudou_assunto: false, mudou_corpo: false, palavras_antes: pa, palavras_depois: pd, similaridade: 1, categorias: [] };
  if (mudouAssunto) cats.push('assunto');
  if (mudouCorpo) {
    if (pa && pd < pa * 0.8) cats.push('encurtou');
    if (pa && pd > pa * 1.2) cats.push('alongou');
    if (norm(frases(o.corpo)[0]) !== norm(frases(f.corpo)[0])) cats.push('introducao');
    if (norm(ultimaPergunta(o.corpo)) !== norm(ultimaPergunta(f.corpo))) cats.push('cta');
    const adjO = palavras(norm(o.corpo)).filter(w => ADJETIVOS.includes(w)).length, adjF = palavras(norm(f.corpo)).filter(w => ADJETIVOS.includes(w)).length;
    if (adjF < adjO) cats.push('adjetivos');
    if (ARTIFICIAL.test(norm(o.corpo)) && !ARTIFICIAL.test(norm(f.corpo))) cats.push('linguagem_artificial');
    const solO = [...new Set(norm(o.corpo).match(SOLUCOES_TXT) || [])].sort().join(','), solF = [...new Set(norm(f.corpo).match(SOLUCOES_TXT) || [])].sort().join(',');
    if (solO !== solF) cats.push('solucao');
    if (sim < 0.5) cats.push('reescrita');
  }
  return { sem_alteracao: false, mudou_assunto: mudouAssunto, mudou_corpo: mudouCorpo, palavras_antes: pa, palavras_depois: pd,
    variacao_pct: pa ? Math.round((pd - pa) / pa * 100) : null, similaridade: Math.round(sim * 100) / 100, categorias: cats };
}

// O que cada padrão de edição ensina (texto da proposta).
export const LICAO_POR_CATEGORIA = {
  encurtou: 'O Pedro costuma encurtar os e-mails: escreva mais curto e direto.',
  alongou: 'O Pedro costuma acrescentar contexto: os e-mails estão curtos demais para o argumento.',
  introducao: 'A abertura costuma ser reescrita: a primeira frase precisa ser mais específica sobre a pessoa e o momento dela.',
  cta: 'O pedido final costuma ser trocado: rever o tipo de CTA (conversa curta, pergunta direta).',
  adjetivos: 'O Pedro corta adjetivos: menos qualificação, mais fato.',
  linguagem_artificial: 'O Pedro remove frases com cara de texto automático: evitar fórmulas prontas.',
  solucao: 'A solução apresentada costuma ser trocada: rever a escolha de solução para esse perfil.',
  reescrita: 'Mensagens são reescritas quase por inteiro: o argumento comercial não está convencendo.',
  assunto: 'O assunto costuma ser trocado: assuntos mais curtos e concretos.'
};

// eventos: [{tipo, motivo, diff:{categorias}, contexto:{setor, solucao, cargo}}]
// desempenho: linhas de crm_agente_desempenho_v.
// Devolve propostas { chave, tipo, texto, escopo, evidencias, evidencia_detalhe }.
export function propostasDeAprendizado(eventos, { minEvidencias = 5, minFracao = 0.4, desempenho = [], minEnviados = 10 } = {}) {
  const out = [];
  const lista = Array.isArray(eventos) ? eventos : [];
  const edicoes = lista.filter(e => e.tipo === 'editado' || e.tipo === 'enviado_com_alteracao');
  const semAlt = lista.filter(e => e.tipo === 'enviado_sem_alteracao');
  const totalRevisados = edicoes.length + semAlt.length;
  // 1. Padrões de edição (só com amostra e frequência relevantes).
  const cont = {};
  for (const e of edicoes) for (const c of ((e.diff && e.diff.categorias) || [])) cont[c] = (cont[c] || 0) + 1;
  for (const [c, n] of Object.entries(cont)) {
    if (n >= minEvidencias && totalRevisados && n / totalRevisados >= minFracao && LICAO_POR_CATEGORIA[c]) {
      out.push({ chave: 'edicao:' + c, tipo: 'aprendizado', texto: LICAO_POR_CATEGORIA[c], escopo: {}, evidencias: n,
        evidencia_detalhe: { padrao: c, ocorrencias: n, revisados: totalRevisados, fracao: Math.round(n / totalRevisados * 100) / 100 } });
    }
  }
  // 2. Rejeições recorrentes por motivo + setor.
  const rej = {};
  for (const e of lista.filter(x => x.tipo === 'rejeitado')) {
    const m = String(e.motivo || '').split(':')[0].trim() || 'sem motivo';
    const setor = (e.contexto && e.contexto.setor) || 'qualquer setor';
    const k = m + '|' + setor; (rej[k] ||= { m, setor, n: 0 }).n++;
  }
  for (const r of Object.values(rej)) if (r.n >= 3) {
    out.push({ chave: 'rejeicao:' + norm(r.m) + ':' + norm(r.setor), tipo: 'argumento_nao_funciona',
      texto: `Rejeitado ${r.n} vezes por "${r.m}" em ${r.setor}: rever a seleção ou a abordagem nesse caso.`,
      escopo: r.setor === 'qualquer setor' ? {} : { setor: r.setor }, evidencias: r.n, evidencia_detalhe: { motivo: r.m, setor: r.setor } });
  }
  // 3. Abordagens aprovadas/enviadas sem alteração por solução + setor.
  const ok = {};
  for (const e of lista.filter(x => x.tipo === 'enviado_sem_alteracao' || x.tipo === 'aprovado')) {
    const sol = e.contexto && e.contexto.solucao; const setor = e.contexto && e.contexto.setor;
    if (!sol) continue; const k = sol + '|' + (setor || ''); (ok[k] ||= { sol, setor, n: 0 }).n++;
  }
  for (const r of Object.values(ok)) if (r.n >= minEvidencias) {
    out.push({ chave: 'aprovacao:' + r.sol + ':' + norm(r.setor || ''), tipo: 'argumento_funciona',
      texto: `Abordagens com ${r.sol}${r.setor ? ' em ' + r.setor : ''} costumam ser aprovadas pelo Pedro (${r.n} casos).`,
      escopo: Object.assign({ solucao: r.sol }, r.setor ? { setor: r.setor } : {}), evidencias: r.n, evidencia_detalhe: { solucao: r.sol, setor: r.setor || null } });
  }
  // 4. Desempenho real (correlação, não causa): só combinações com amostra.
  for (const d of (Array.isArray(desempenho) ? desempenho : [])) {
    const env = Number(d.enviados) || 0; if (env < minEnviados) continue;
    const pos = Number(d.respostas_positivas) || 0, reu = Number(d.reunioes) || 0;
    if (pos / env >= 0.1 || reu > 0) {
      out.push({ chave: 'desempenho:' + [d.setor, d.solucao, d.nivel_cargo, d.alavanca].map(norm).join(':'), tipo: 'argumento_funciona',
        texto: `${d.solucao} em ${d.setor}, para ${d.nivel_cargo}, com a alavanca "${d.alavanca}": ${pos} respostas positivas e ${reu} reuniões em ${env} envios (correlação, não prova de causa).`,
        escopo: { setor: d.setor, solucao: d.solucao }, evidencias: env, evidencia_detalhe: d });
    }
  }
  return out;
}

const mediana = (xs) => { const a = [...xs].sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };

// finais: [{assunto, corpo}] das mensagens aprovadas/enviadas. Sem amostra, não conclui nada.
export function perfilDeComunicacao(finais, { minAmostra = 10 } = {}) {
  const l = (Array.isArray(finais) ? finais : []).filter(x => x && x.corpo);
  if (l.length < minAmostra) return { amostra_suficiente: false, n: l.length, min: minAmostra };
  const corpos = l.map(x => semAssinatura(x.corpo));
  const pal = corpos.map(c => palavras(c).length);
  const fr = corpos.map(c => frases(c).length);
  const comPergunta = corpos.filter(c => /\?\s*$/.test(frases(c).slice(-1)[0] || '')).length;
  const assuntos = l.map(x => palavras(x.assunto).length).filter(n => n > 0);
  const tratamentoVoce = corpos.filter(c => /(^|[^\p{L}])voc[eê]s?([^\p{L}]|$)/iu.test(c)).length;   // \b não funciona depois de 'ê'
  const tratamentoFormal = corpos.filter(c => /\b(sr\.|sra\.|senhor|senhora|prezad)/i.test(c)).length;
  const adj = corpos.reduce((a, c) => a + palavras(norm(c)).filter(w => ADJETIVOS.includes(w)).length, 0);
  return {
    amostra_suficiente: true, n: l.length,
    palavras_mediana: mediana(pal), frases_mediana: mediana(fr), assunto_palavras_mediana: mediana(assuntos),
    termina_com_pergunta_pct: Math.round(comPergunta / l.length * 100),
    formalidade: tratamentoFormal > l.length * 0.3 ? 'formal' : tratamentoVoce >= l.length * 0.5 ? 'direta (você)' : 'neutra',
    adjetivos_por_email: Math.round(adj / l.length * 10) / 10
  };
}

// Memória ativa → bloco de texto para o prompt (filtrada por escopo).
export function montarMemoriaPrompt(rows, { setor, solucao } = {}, maxLinhas = 12) {
  const s = norm(setor);
  const vale = (r) => {
    const e = r.escopo || {};
    if (e.solucao && solucao && norm(e.solucao) !== norm(solucao)) return false;
    if (e.solucao && !solucao) return false;
    if (e.setor && (!s || !(s.includes(norm(e.setor)) || norm(e.setor).includes(s)))) return false;
    return true;
  };
  const ordem = { restricao: 0, preferencia: 1, perfil: 2, argumento_funciona: 3, argumento_nao_funciona: 4, case_por_segmento: 5, aprendizado: 6 };
  const rot = { restricao: 'Restrição', preferencia: 'Preferência', perfil: 'Perfil de comunicação', argumento_funciona: 'Funciona', argumento_nao_funciona: 'Não funciona', case_por_segmento: 'Case indicado', aprendizado: 'Aprendizado' };
  const linhas = (Array.isArray(rows) ? rows : []).filter(vale)
    .sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9) || (b.evidencias || 0) - (a.evidencias || 0))
    .slice(0, maxLinhas).map(r => `- ${rot[r.tipo] || r.tipo}: ${String(r.texto).slice(0, 260)}`);
  if (!linhas.length) return '';
  return 'MEMÓRIA COMERCIAL DO PEDRO (orientação aprovada por ele; use o espírito, nunca copie mensagens antigas):\n' + linhas.join('\n');
}
