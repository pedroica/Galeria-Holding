// Decisões de agenda do worker, como funções puras — o daemon só executa o que
// isto manda. Separar assim é o que permite testar "o que acontece às 7h29 de
// um domingo" sem esperar o domingo.

export interface RelogioLocal {
  dia: string; // YYYY-MM-DD em America/Sao_Paulo
  hora: number; // 0-23
  minuto: number;
  diaSemana: number; // 0 = domingo
}

/** Hora local de São Paulo, independente do fuso do Mac. */
export function relogioSaoPaulo(agora: Date = new Date()): RelogioLocal {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const parte of fmt.formatToParts(agora)) p[parte.type] = parte.value;
  const semana = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return {
    dia: `${p.year}-${p.month}-${p.day}`,
    // "24" aparece à meia-noite em alguns ambientes; normalizamos para 0.
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: Math.max(0, semana.indexOf((p.weekday || "").toLowerCase().slice(0, 3))),
  };
}

export interface ConfigAgenda {
  /** Hora do relatório diário (padrão 7h30). */
  horaRelatorio: number;
  minutoRelatorio: number;
  /** Janela em que o buscador trabalha durante o dia. */
  janelaInicio: number;
  janelaFim: number;
  /** Roda nos fins de semana? */
  fimDeSemana: boolean;
}

export const AGENDA_PADRAO: ConfigAgenda = {
  horaRelatorio: 7,
  minutoRelatorio: 30,
  janelaInicio: 8,
  janelaFim: 20,
  fimDeSemana: false,
};

export type Acao =
  | { tipo: "rotina_diaria"; motivo: string }
  | { tipo: "lote_continuo"; motivo: string }
  | { tipo: "dormir"; motivo: string };

export interface EstadoAgenda {
  /** Último dia em que a rotina diária rodou (YYYY-MM-DD), do banco. */
  ultimaRodada?: string;
  /** Empresas já processadas hoje pelo worker. */
  processadasHoje: number;
  cotaDiaria: number;
  pausado: boolean;
}

/**
 * O que fazer neste tick. Ordem de prioridade:
 *   1. pausado → dorme (o kill switch tem que valer na hora)
 *   2. rotina diária ainda não rodou hoje e já passou da hora → roda
 *   3. dentro da janela e ainda há cota → lote pequeno
 *   4. caso contrário → dorme
 */
export function decidirAcao(relogio: RelogioLocal, estado: EstadoAgenda, cfg: ConfigAgenda = AGENDA_PADRAO): Acao {
  if (estado.pausado) return { tipo: "dormir", motivo: "agente pausado" };

  const fimDeSemana = relogio.diaSemana === 0 || relogio.diaSemana === 6;
  if (fimDeSemana && !cfg.fimDeSemana) {
    return { tipo: "dormir", motivo: "fim de semana" };
  }

  const minutosAgora = relogio.hora * 60 + relogio.minuto;
  const minutosRelatorio = cfg.horaRelatorio * 60 + cfg.minutoRelatorio;

  if (estado.ultimaRodada !== relogio.dia && minutosAgora >= minutosRelatorio) {
    return { tipo: "rotina_diaria", motivo: `relatório do dia ${relogio.dia}` };
  }

  const naJanela = relogio.hora >= cfg.janelaInicio && relogio.hora < cfg.janelaFim;
  if (!naJanela) return { tipo: "dormir", motivo: "fora da janela de trabalho" };

  const restante = estado.cotaDiaria - estado.processadasHoje;
  if (restante <= 0) return { tipo: "dormir", motivo: "cota do dia cumprida" };

  return { tipo: "lote_continuo", motivo: `${restante} empresas restantes na cota de hoje` };
}
