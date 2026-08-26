// Leitura e validação de env. Nada aqui explode na importação: o worker e as
// funções da Vercel precisam poder subir com config parcial e responder
// "faltou X" em vez de dar 500 sem explicação.

export interface AgentEnv {
  timezone: string;
  dryRun: boolean;
  agentPaused: boolean;

  supabaseUrl?: string;
  supabaseServiceKey?: string;

  anthropicApiKey?: string;
  claudeModel: string;

  qwenApiKey?: string;
  qwenBaseUrl?: string;
  qwenModel: string;

  waToken?: string;
  waPhoneNumberId?: string;
  waVerifyToken?: string;
  waAppSecret?: string;
  /** Só estes números podem comandar os agentes (E.164 sem "+"). */
  waAllowedNumbers: string[];
  /** Para onde vai o relatório diário. */
  waOwnerNumber?: string;

  lushaApiKey?: string;
  lushaDailyLimit: number;
  /** Quantas empresas o buscador processa por dia ("um pouquinho todo dia"). */
  cmoDailyQuota: number;
  /** Revelar telefone custa 5 créditos contra 1 do email. */
  cmoRevealPhone: boolean;

  cronSecret?: string;
}

function bool(v: string | undefined, dflt: boolean): boolean {
  if (v == null || v === "") return dflt;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function int(v: string | undefined, dflt: number): number {
  const n = parseInt((v || "").trim(), 10);
  return Number.isFinite(n) ? n : dflt;
}

/** Lista de números E.164 normalizada (só dígitos), aceitando vírgula/espaço. */
export function parseNumberList(v: string | undefined): string[] {
  return (v || "")
    .split(/[,;\s]+/)
    .map((s) => s.replace(/\D/g, ""))
    .filter(Boolean);
}

export function loadEnv(src: Record<string, string | undefined> = process.env): AgentEnv {
  return {
    timezone: src.TIMEZONE || "America/Sao_Paulo",
    dryRun: bool(src.DRY_RUN, true),
    agentPaused: bool(src.AGENT_PAUSED, false),

    supabaseUrl: src.SUPABASE_URL,
    supabaseServiceKey: src.SUPABASE_SERVICE_ROLE_KEY,

    anthropicApiKey: src.ANTHROPIC_API_KEY,
    claudeModel: src.CLAUDE_MODEL || "claude-opus-5",

    qwenApiKey: src.QWEN_API_KEY,
    qwenBaseUrl: src.QWEN_BASE_URL,
    qwenModel: src.QWEN_MODEL || "qwen-plus",

    waToken: src.WHATSAPP_CLOUD_TOKEN,
    waPhoneNumberId: src.WHATSAPP_PHONE_NUMBER_ID,
    waVerifyToken: src.WHATSAPP_VERIFY_TOKEN,
    waAppSecret: src.WHATSAPP_APP_SECRET,
    waAllowedNumbers: parseNumberList(src.WHATSAPP_ALLOWED_NUMBERS),
    waOwnerNumber: (src.WHATSAPP_OWNER_NUMBER || "").replace(/\D/g, "") || undefined,

    // O CRM na Vercel já usa LUSHA_KEY; aceitamos os dois nomes.
    lushaApiKey: src.LUSHA_API_KEY || src.LUSHA_KEY,
    lushaDailyLimit: int(src.LUSHA_DAILY_LIMIT, 60),
    cmoDailyQuota: int(src.CMO_DAILY_QUOTA, 40),
    cmoRevealPhone: bool(src.CMO_REVEAL_PHONE, false),

    cronSecret: src.CRON_SECRET,
  };
}

/** Falta alguma coisa para o canal de WhatsApp funcionar? */
export function missingWhatsApp(env: AgentEnv): string[] {
  const miss: string[] = [];
  if (!env.waToken) miss.push("WHATSAPP_CLOUD_TOKEN");
  if (!env.waPhoneNumberId) miss.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!env.waVerifyToken) miss.push("WHATSAPP_VERIFY_TOKEN");
  if (!env.waAppSecret) miss.push("WHATSAPP_APP_SECRET");
  if (!env.waAllowedNumbers.length) miss.push("WHATSAPP_ALLOWED_NUMBERS");
  return miss;
}

export function missingSupabase(env: AgentEnv): string[] {
  const miss: string[] = [];
  if (!env.supabaseUrl) miss.push("SUPABASE_URL");
  if (!env.supabaseServiceKey) miss.push("SUPABASE_SERVICE_ROLE_KEY");
  return miss;
}
