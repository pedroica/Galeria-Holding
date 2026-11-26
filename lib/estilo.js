// lib/estilo.js — o jeito do Pedro escrever, usado em TODO texto que o agente produz
// (SDR, blitz, parabéns por novo cargo). Pedido do Pedro (26/11): começar pela
// pessoa, passar pela trajetória e pelos feitos dela, e terminar convidando para um
// café para ver como a Galeria Holding pode ajudar no desafio dela.
// Sempre com a regra-mãe: só fatos que estão nas fontes dadas; nada inventado.

export const ESTILO_PEDRO = [
  'ESTILO DO PEDRO (vale para toda mensagem):',
  '- Comece pela PESSOA, não pela empresa nem pelo que vendemos: reconheça o momento dela (cargo novo, desafio, conquista) com naturalidade, como quem acompanha a carreira de alguém do mercado. Sem bajulação.',
  '- Quando houver fonte, passe pela trajetória e por um feito concreto dela (empresa anterior, cargo, campanha, resultado) para mostrar que você conhece o trabalho dela. Só use o que está nas fontes; sem fonte, não cite trajetória.',
  '- Ligue o momento dela ao desafio que ela tem agora e ao que o grupo pode somar, em uma ou duas frases, sem pitch e sem lista de serviços.',
  '- Termine com o convite para um café (presencial ou por vídeo) para conhecer o desafio dela e ver como a Galeria Holding pode ajudar. Uma pergunta só, leve, sem pressão.',
  '- Tom de executivo para executivo: caloroso, direto, sem exagero de adjetivo e sem clichê de prospecção.'
];

export function linhasEstilo() { return ESTILO_PEDRO.slice(); }
