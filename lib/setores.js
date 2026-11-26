// lib/setores.js — setor de cada empresa numa lista única (para filtrar a base e
// montar blitz por setor). Parte pura e testável; a rede fica no cron.
// Contexto (26/11): 72% da base estava como "Outros" e os nomes variavam
// ("Educacao", "Educação", "FMCG"...), então o filtro por setor não funcionava.

export const SETORES = [
  'Educação', 'Saúde', 'Farma', 'Financeiro', 'Fintech', 'Seguros', 'Varejo', 'Moda', 'E-commerce',
  'Bens de consumo', 'Alimentos e bebidas', 'Beleza e cuidados', 'Automotivo', 'Construção e imobiliário',
  'Tecnologia', 'Telecom', 'Mídia e entretenimento', 'Turismo e viagens', 'Energia', 'Indústria',
  'Agronegócio', 'Logística e mobilidade', 'Serviços', 'Esporte', 'Apostas', 'Governo e terceiro setor', 'Outros'
];

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Setores antigos da base que já dizem algo (o resto vai para a IA).
const MAPA_ANTIGO = {
  'educacao': 'Educação', 'saude': 'Saúde', 'farma': 'Farma', 'financeiro': 'Financeiro', 'fintech': 'Fintech',
  'seguros': 'Seguros', 'varejo': 'Varejo', 'varejo moda': 'Moda', 'moda': 'Moda', 'e-commerce': 'E-commerce', 'ecommerce': 'E-commerce',
  'fmcg': 'Bens de consumo', 'food': 'Alimentos e bebidas', 'nutricao': 'Alimentos e bebidas', 'bebidas': 'Alimentos e bebidas',
  'beleza': 'Beleza e cuidados', 'automotivo': 'Automotivo', 'construcao': 'Construção e imobiliário', 'imobiliario': 'Construção e imobiliário',
  'b2b tech': 'Tecnologia', 'tecnologia': 'Tecnologia', 'telecom': 'Telecom', 'media': 'Mídia e entretenimento', 'midia': 'Mídia e entretenimento',
  'streaming': 'Mídia e entretenimento', 'travel': 'Turismo e viagens', 'turismo': 'Turismo e viagens', 'energia': 'Energia',
  'industria': 'Indústria', 'agro': 'Agronegócio', 'varejo esporte': 'Esporte', 'esporte': 'Esporte'
};
export function setorDoAntigo(setor) { return MAPA_ANTIGO[sem(setor)] || null; }

// Aceita a resposta da IA só se for um setor da lista (com tolerância a acento/caixa).
export function setorValido(s) {
  const alvo = sem(s);
  return SETORES.find(x => sem(x) === alvo) || null;
}

export const SCHEMA_SETORES = {
  type: 'object',
  properties: {
    itens: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, setor: { type: 'string', enum: SETORES }, confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] }
    }, required: ['id', 'setor', 'confianca'], additionalProperties: false } }
  },
  required: ['itens'], additionalProperties: false
};

// empresas: [{id, nome, setor, segmento_detalhe, site}]
export function promptSetores(empresas) {
  const system = [
    'Você classifica empresas brasileiras (anunciantes, possíveis clientes de agências de comunicação) em UM setor da lista.',
    'Setores: ' + SETORES.join(' | ') + '.',
    'Use o que você sabe da marca, o site e as dicas dadas. Escolas, faculdades, cursos, edtechs = Educação.',
    'Bancos e financeiras = Financeiro; apps de pagamento e bancos digitais = Fintech. Supermercados, farmácias e lojas = Varejo.',
    'Indústria de alimentos e bebidas = Alimentos e bebidas; higiene, limpeza e outros bens de consumo = Bens de consumo.',
    'Se não reconhecer a empresa e as dicas não bastarem: "Outros" com confiança baixa. Não invente.',
    'Responda um item por empresa, com o mesmo id.'
  ].join('\n');
  const user = (empresas || []).map(e => [e.id, e.nome, e.site ? 'site: ' + e.site : '', e.setor && sem(e.setor) !== 'outros' ? 'setor antigo: ' + e.setor : '', e.segmento_detalhe ? 'detalhe: ' + e.segmento_detalhe : '']
    .filter(Boolean).join(' · ')).join('\n');
  return { system, user };
}
