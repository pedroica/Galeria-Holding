// lib/wa-templates.js — modelos de mensagem do SDR para aprovação na Meta (Bloco D).
// Primeiro contato no WhatsApp Business só pode sair por modelo aprovado.
// {{1}} = primeiro nome; {{2}} = o miolo redigido e aprovado no QC (uma linha).
// Regras da Meta respeitadas: variável não abre nem fecha o corpo; texto fixo
// suficiente em volta; saída explícita (SAIR) em todos.
export const MODELOS_WA = [
  { name: 'sdr_primeiro_contato', category: 'MARKETING', language: 'pt_BR',
    texto: 'Oi {{1}}, aqui é o Pedro Ica, da Galeria Holding. {{2}} Se não quiser mais mensagens, responda SAIR.',
    exemplo: ['Ana', 'Vi o lançamento da linha X da Acme e tive uma ideia pequena para o lançamento no varejo. Faz sentido eu te mandar por aqui?'] },
  { name: 'sdr_seguimento', category: 'MARKETING', language: 'pt_BR',
    texto: 'Oi {{1}}, Pedro Ica de novo, da Galeria Holding. {{2}} Se preferir que eu pare por aqui, é só responder SAIR.',
    exemplo: ['Ana', 'Pensei em um ângulo novo para a linha X, ligado ao que fizemos com uma marca de varejo. Posso te mandar em duas linhas?'] },
  { name: 'sdr_ideia_case', category: 'MARKETING', language: 'pt_BR',
    texto: 'Oi {{1}}, uma ideia rápida da Galeria Holding para vocês: {{2}} Se não quiser mais mensagens, responda SAIR.',
    exemplo: ['Ana', 'fizemos algo parecido para outra marca e o resultado foi bom. Quer que eu te mande o case completo?'] },
  { name: 'sdr_convite_conversa', category: 'MARKETING', language: 'pt_BR',
    texto: 'Oi {{1}}, aqui é o Pedro Ica, da Galeria Holding. {{2}} Topa conversar 15 minutos nesta semana? Se não quiser mais mensagens, responda SAIR.',
    exemplo: ['Ana', 'Acompanhei a expansão da Acme e tenho uma ideia concreta para a próxima fase.'] }
];

export function payloadMeta(m) {
  return { name: m.name, category: m.category, language: m.language,
    components: [{ type: 'BODY', text: m.texto, example: { body_text: [m.exemplo] } }] };
}
