// lib/sdr-qualidade.js — controle de qualidade do SDR (seção 4.6). Puro/testável.
// Dois componentes: checagens determinísticas por código e a decisão final
// (combina a avaliação do modelo com as checagens).

import { validarForma, numerosRelevantes } from './sdr-redacao.js';
import { alegaFato } from './sdr-meta.js';

export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

// Checagens por código. mensagem: { assunto, corpo, sinal_url, canal }
// dossie: { sinais:[{url}] }  caso: { resultado } | null  decisor: { nome }
// empresa: { nome }
export function checagensCodigo({ mensagem, dossie, caso, decisor, empresa, canal, expressoesProibidas, semFato }) {
  const falhas = [];

  // 1. Forma (tamanho, travessão, expressões proibidas, 1 pergunta).
  const forma = validarForma(mensagem, canal || mensagem.canal || 'email', expressoesProibidas);
  for (const p of forma.problemas) falhas.push('forma: ' + p);

  // 2. Toda afirmação sobre o cliente aponta para um sinal do dossiê COM URL.
  const urls = new Set((dossie && dossie.sinais || []).map(s => s.url).filter(Boolean));
  const temSinalComUrl = urls.size > 0;
  if (semFato) {
    // Trilha sem fato: não há fonte, então a mensagem não pode alegar fato.
    if (alegaFato((mensagem.assunto || '') + ' ' + (mensagem.corpo || ''))) {
      falhas.push('lastro: trilha sem fato, mas a mensagem alega fato sobre a empresa');
    }
  } else if (!temSinalComUrl) {
    falhas.push('lastro: dossiê sem sinal com URL (sem fato comprovável)');
  } else if (!mensagem.sinal_url || !urls.has(mensagem.sinal_url)) {
    falhas.push('lastro: mensagem não aponta para um sinal do dossiê (sinal_url ausente/estranho)');
  }

  // 3. Números/cases batem com o material: todo número "de estatística" no corpo
  //    precisa existir no resultado do case citado; sem case, nada de números.
  const nums = numerosRelevantes(mensagem.corpo);
  const comStat = nums.filter(n => /%|mil|milh|x|pontos|bilh/.test(n));
  if (comStat.length) {
    // Número vale se estiver no resultado do case OU no fato/trecho do dossiê
    // (ex.: "12 milhões de panetones" vem da notícia, não do case).
    const fatos = ((dossie && dossie.sinais) || []).map(s => `${s.fato || ''} ${s.trecho || ''}`).join(' ').toLowerCase();
    const base = ((caso && caso.resultado) ? String(caso.resultado).toLowerCase() : '') + ' ' + fatos;
    const inventados = comStat.filter(n => !base.includes(n.replace(/\s+/g, ' ').trim()));
    if (inventados.length) falhas.push('numeros: número sem fonte no case nem no dossiê (' + inventados.join(', ') + ')');
  }

  // 4. Nome do decisor ou da empresa presente (personalização mínima correta).
  const low = ((mensagem.assunto || '') + ' ' + (mensagem.corpo || '')).toLowerCase();
  const pn = primeiroNome(decisor && decisor.nome).toLowerCase();
  const emp = String(empresa && empresa.nome || '').toLowerCase();
  const empTok = emp.split(/\s+/)[0] || '';
  if (!(pn && low.includes(pn)) && !(empTok && low.includes(empTok))) {
    falhas.push('personalizacao: não cita nome do decisor nem da empresa');
  }

  return { ok: falhas.length === 0, falhas };
}

// Decisão final. aval: { aderencia, especificidade, naturalidade, clareza, risco, motivo }
// (0-10; risco 0 = sem risco). notaMinima padrão 8; risco baixo = <= 3.
export function decisao(aval, checagens, notaMinima = 8) {
  const criterios = ['aderencia', 'especificidade', 'naturalidade', 'clareza'];
  const notas = criterios.map(c => Number(aval && aval[c]) || 0);
  const notaMedia = Math.round((notas.reduce((a, b) => a + b, 0) / criterios.length) * 10) / 10;
  // Risco 0 é "sem risco" (o melhor valor): não pode cair no padrão 10. Só
  // ausente/inválido conta como risco máximo.
  const rv = Number(aval && aval.risco);
  const risco = (aval && aval.risco !== null && aval.risco !== undefined && aval.risco !== '' && Number.isFinite(rv)) ? rv : 10;

  const motivos = [];
  for (const c of criterios) if ((Number(aval && aval[c]) || 0) < notaMinima) motivos.push(`${c} ${Number(aval && aval[c]) || 0} < ${notaMinima}`);
  if (risco > 3) motivos.push(`risco ${risco} > 3`);
  if (!checagens || !checagens.ok) for (const f of (checagens && checagens.falhas || [])) motivos.push(f);

  const aprovadoAutonomo = motivos.length === 0;
  return {
    aprovado_autonomo: aprovadoAutonomo,
    nota_media: notaMedia,
    risco,
    motivo: aprovadoAutonomo ? 'aprovado: nota >= ' + notaMinima + ' em tudo, risco baixo, checagens ok' : motivos.join(' | ')
  };
}
