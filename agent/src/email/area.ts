// Inferência da {ÁREA} a partir do segmento da empresa (para personalizar o email).
// Ex: Gerdau (Siderurgia/Construção) → "Construção"; banco → "Varejo PF".
// Mapa por palavra-chave normalizada; fallback conservador.

import { normalizeName } from "../lib/normalize.ts";

interface AreaRule {
  keywords: string[]; // normalizados (sem acento, minúsculo)
  area: string;
}

// Ordem importa: primeira regra que casar vence.
const RULES: AreaRule[] = [
  { keywords: ["banco", "financeiro", "bancos", "credito", "seguros", "seguradora", "fintech", "pagamentos"], area: "Varejo PF" },
  { keywords: ["siderurgia", "metalurgia", "aco", "construcao", "cimento", "materiais de construcao"], area: "Construção" },
  { keywords: ["agro", "agronegocio", "agricola", "fertilizantes", "graos", "insumos"], area: "Agro" },
  { keywords: ["varejo", "e commerce", "ecommerce", "comercio", "moda", "vestuario", "calcados", "magazine"], area: "Varejo" },
  { keywords: ["alimentos", "bebidas", "alimenticio", "laticinios", "cafe", "biscoitos", "frigorifico", "consumo"], area: "Grande Consumo" },
  { keywords: ["saude", "farmaceutico", "farma", "hospital", "laboratorio", "medico"], area: "Saúde" },
  { keywords: ["tecnologia", "software", "ti", "telecom", "telecomunicacoes", "internet", "saas"], area: "Tecnologia" },
  { keywords: ["automotivo", "veiculos", "montadora", "autopecas", "mobilidade"], area: "Automotivo" },
  { keywords: ["energia", "petroleo", "gas", "eletrica", "utilities", "saneamento"], area: "Energia" },
  { keywords: ["educacao", "ensino", "edtech", "universidade"], area: "Educação" },
  { keywords: ["logistica", "transporte", "frete", "mobilidade urbana"], area: "Logística" },
  { keywords: ["beleza", "cosmeticos", "higiene", "perfumaria"], area: "Beleza & Consumo" },
  { keywords: ["papel", "celulose", "embalagens"], area: "Indústria" },
  { keywords: ["turismo", "aereo", "aviacao", "hotelaria", "viagens"], area: "Turismo" },
  { keywords: ["imobiliario", "incorporadora", "construtora", "real estate"], area: "Mercado Imobiliário" },
];

/**
 * Retorna a {ÁREA} inferida do segmento. Se nada casar, devolve o próprio
 * segmento (capitalizado) ou "seu segmento" — nunca vaza vazio.
 */
function keywordMatches(keyword: string, norm: string, tokens: string[]): boolean {
  const k = normalizeName(keyword);
  if (!k) return false;
  // keyword com espaço → frase (baixo risco de falso-positivo)
  if (k.includes(" ")) return norm.includes(k);
  // keyword de 1 palavra → precisa ser um TOKEN inteiro (evita "ti" ⊂ "quantico")
  return tokens.includes(k);
}

export function inferArea(segmento?: string | null): string {
  const norm = normalizeName(segmento || "");
  if (norm) {
    const tokens = norm.split(" ").filter(Boolean);
    for (const rule of RULES) {
      if (rule.keywords.some((k) => keywordMatches(k, norm, tokens))) return rule.area;
    }
  }
  // fallback: usa o próprio segmento com inicial maiúscula, ou genérico
  const s = (segmento || "").trim();
  if (s) return s.charAt(0).toUpperCase() + s.slice(1);
  return "seu segmento";
}
