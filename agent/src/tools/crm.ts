// As ferramentas que os agentes de fato chamam. Tudo que eles sabem do mundo
// passa por aqui — não há acesso solto ao banco a partir do prompt.
//
// Convenção: nomes e descrições em português, porque é a língua em que você
// conversa com eles. Descrição boa = menos chamada errada.

import type { AgentTool, ToolContext } from "./registry.ts";
import { obj, str, num, bool, enumOf } from "./registry.ts";
import type { SupabaseClient } from "./supabase.ts";
import { logEvent } from "./supabase.ts";
import type { BlocklistMatcher } from "../lib/blocklist.ts";
import type { LushaClient } from "../lusha/client.ts";
import {
  formatCmoReport,
  getProgress,
  runCmoBatch,
  todayInSaoPaulo,
  type CmoDeps,
} from "../jobs/daily-cmo.ts";

export interface CrmToolDeps {
  db: SupabaseClient;
  blocklist: BlocklistMatcher;
  lusha?: LushaClient;
  cotaDiaria: number;
  limiteCreditos: number;
  revelarTelefone: boolean;
}

const ESTAGIOS = [
  "enriquecido", "email_d0", "whatsapp_d1", "followup_email_d4",
  "followup_whatsapp_d7", "sem_resposta_d14", "respondeu",
  "reuniao_marcada", "bloqueado",
];

/** PostgREST: escapa vírgula/parêntese que quebrariam o filtro. */
function safe(v: string): string {
  return String(v).replace(/[(),*]/g, " ").trim();
}

export function createCrmTools(deps: CrmToolDeps): AgentTool[] {
  const { db } = deps;

  const tools: AgentTool[] = [
    // ── Leitura, comum a todos ──────────────────────────────────────────────
    {
      name: "buscar_empresas",
      description:
        "Busca empresas na base do CRM por parte do nome ou setor. Retorna rank, " +
        "domínio e o status de cadastro do decisor de marketing (cmo_status). " +
        "Use sempre que o usuário citar uma empresa pelo nome.",
      inputSchema: obj(
        {
          termo: str("Parte do nome da empresa ou do setor. Ex: 'ambev', 'varejo'."),
          status: enumOf("Filtrar por status do decisor (opcional).", [
            "pendente", "ok", "revisar", "sem_dominio", "sem_decisor", "bloqueada", "erro",
          ]),
          limite: num("Quantas trazer (padrão 10, máximo 50)."),
        },
        ["termo"],
      ),
      async handler(input) {
        const termo = safe(String(input.termo || ""));
        const limite = Math.min(Number(input.limite) || 10, 50);
        const filtroStatus = input.status ? `&cmo_status=eq.${input.status}` : "";
        const rows = await db.select(
          "companies",
          `select=id,rank,name,segmento,domain,blocked,blocked_reason,cmo_status` +
            `&or=(name.ilike.*${encodeURIComponent(termo)}*,segmento.ilike.*${encodeURIComponent(termo)}*)` +
            filtroStatus +
            `&order=rank.asc.nullslast&limit=${limite}`,
        );
        return { encontradas: rows.length, empresas: rows };
      },
    },

    {
      name: "ficha_empresa",
      description:
        "Ficha completa de UMA empresa: dados, decisores já cadastrados (com " +
        "email/telefone) e em que estágio da esteira de abordagem cada um está. " +
        "Use antes de escrever qualquer abordagem.",
      inputSchema: obj({ empresa_id: str("UUID da empresa, vindo de buscar_empresas.") }, ["empresa_id"]),
      async handler(input) {
        const id = safe(String(input.empresa_id));
        const [empresa] = await db.select("companies", `select=*&id=eq.${id}`);
        if (!empresa) return { erro: "Empresa não encontrada." };
        const contatos = await db.select(
          "contacts",
          `select=id,full_name,title,email,phone_e164,linkedin_url,data_quality,needs_review&company_id=eq.${id}`,
        );
        const ids = contatos.map((c: any) => c.id);
        const esteira = ids.length
          ? await db.select("outreach", `select=contact_id,state,entered_state_at,paused&contact_id=in.(${ids.join(",")})`)
          : [];
        return { empresa, contatos, esteira };
      },
    },

    {
      name: "checar_blocklist",
      description:
        "Diz se uma empresa é cliente atual da Holding (e portanto NÃO pode ser " +
        "prospectada). Rode antes de sugerir qualquer abordagem nova.",
      inputSchema: obj({ nome: str("Nome da empresa."), dominio: str("Domínio, se souber.") }, ["nome"]),
      async handler(input) {
        const r = deps.blocklist.check({
          name: String(input.nome || ""),
          domain: input.dominio ? String(input.dominio) : undefined,
        });
        return r.blocked
          ? { bloqueada: true, motivo: r.reason, cliente: r.entryName, casou_com: r.matched }
          : { bloqueada: false };
      },
    },

    {
      name: "metricas_gerais",
      description:
        "Números do CRM agora: total de empresas, quantas já têm decisor de " +
        "marketing cadastrado, % de cobertura, créditos Lusha restantes hoje e " +
        "estimativa de dias para 100%.",
      inputSchema: obj({}),
      async handler() {
        const progresso = await getProgress(db, deps.cotaDiaria);
        const totalEmpresas = await db.count("companies");
        const totalContatos = await db.count("contacts");
        return { totalEmpresas, totalContatos, progresso };
      },
    },

    // ── Secretária ──────────────────────────────────────────────────────────
    {
      name: "resumo_do_dia",
      description:
        "Briefing operacional do dia: o que o agente fez nas últimas 24h, " +
        "quantos contatos entraram, quem respondeu e o que travou. Use quando " +
        "o usuário pedir 'resumo', 'como estamos', 'bom dia' ou similar.",
      inputSchema: obj({ horas: num("Janela em horas (padrão 24).") }),
      async handler(input) {
        const horas = Math.min(Number(input.horas) || 24, 168);
        const desde = new Date(Date.now() - horas * 3600000).toISOString();
        const eventos = await db.select(
          "events",
          `select=kind,level,message,created_at&created_at=gte.${desde}&order=created_at.desc&limit=100`,
        );
        const responderam = await db.count("outreach", `select=id&state=eq.respondeu`);
        const reunioes = await db.count("outreach", `select=id&state=eq.reuniao_marcada`);
        const erros = eventos.filter((e: any) => e.level === "error");
        const porTipo: Record<string, number> = {};
        for (const e of eventos as any[]) porTipo[e.kind] = (porTipo[e.kind] || 0) + 1;
        return {
          janela_horas: horas,
          eventos_por_tipo: porTipo,
          respostas_acumuladas: responderam,
          reunioes_marcadas: reunioes,
          erros: erros.slice(0, 5),
          progresso_cmo: await getProgress(db, deps.cotaDiaria),
        };
      },
    },

    {
      name: "criar_lembrete",
      description:
        "Guarda um lembrete para o usuário. Ele é entregue no WhatsApp na data " +
        "marcada, junto do briefing da manhã.",
      inputSchema: obj(
        {
          texto: str("O lembrete, na voz do usuário. Ex: 'ligar para o jurídico da Vivo'."),
          data: str("Data de entrega em YYYY-MM-DD. Se omitida, entrega amanhã."),
        },
        ["texto"],
      ),
      async handler(input, ctx) {
        const data = String(input.data || "").match(/^\d{4}-\d{2}-\d{2}$/)
          ? String(input.data)
          : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const [row] = await db.insert("reminders", [
          { texto: String(input.texto), due_date: data, created_by: ctx.from, agent_id: ctx.agentId },
        ]);
        return { criado: true, id: row?.id, entrega: data };
      },
    },

    {
      name: "listar_lembretes",
      description: "Lista lembretes pendentes (ainda não entregues).",
      inputSchema: obj({ ate: str("Só até esta data (YYYY-MM-DD). Opcional.") }),
      async handler(input) {
        const filtro = String(input.ate || "").match(/^\d{4}-\d{2}-\d{2}$/)
          ? `&due_date=lte.${input.ate}`
          : "";
        return db.select(
          "reminders",
          `select=id,texto,due_date&done=is.false${filtro}&order=due_date.asc&limit=50`,
        );
      },
    },

    {
      name: "controlar_agente",
      description:
        "Liga ou desliga o robô de prospecção (kill switch global), ou consulta " +
        "o estado atual. 'pausar' interrompe disparos e enriquecimento na hora.",
      inputSchema: obj(
        { acao: enumOf("O que fazer.", ["pausar", "retomar", "consultar"]) },
        ["acao"],
      ),
      async handler(input, ctx) {
        const acao = String(input.acao);
        if (acao === "consultar") {
          const rows = await db.select("settings", `select=key,value&key=in.(agent_paused,dry_run)`);
          return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
        }
        const pausado = acao === "pausar";
        await db.upsert("settings", [
          { key: "agent_paused", value: pausado, updated_at: new Date().toISOString() },
        ], "key");
        await logEvent(db, {
          kind: pausado ? "agent_paused" : "agent_resumed",
          channel: "system",
          level: "warn",
          message: `${ctx.agentId} via WhatsApp (${ctx.from})`,
        });
        return { agent_paused: pausado };
      },
    },

    // ── Vendedor ────────────────────────────────────────────────────────────
    {
      name: "fila_de_abordagem",
      description:
        "Contatos prontos para serem abordados hoje, com empresa, cargo e o " +
        "estágio atual na esteira. É a lista de trabalho do vendedor.",
      inputSchema: obj({
        estagio: enumOf("Filtrar por estágio da esteira.", ESTAGIOS),
        limite: num("Quantos trazer (padrão 10, máximo 30)."),
      }),
      async handler(input) {
        const limite = Math.min(Number(input.limite) || 10, 30);
        const filtro = input.estagio ? `&state=eq.${input.estagio}` : `&state=eq.enriquecido`;
        const esteira = await db.select(
          "outreach",
          `select=id,contact_id,state,entered_state_at&paused=is.false${filtro}` +
            `&order=entered_state_at.asc&limit=${limite}`,
        );
        if (!esteira.length) return { fila: [] };
        const ids = esteira.map((o: any) => o.contact_id);
        const contatos = await db.select(
          "contacts",
          `select=id,company_id,full_name,title,email,phone_e164,segmento&id=in.(${ids.join(",")})`,
        );
        const empresaIds = [...new Set(contatos.map((c: any) => c.company_id).filter(Boolean))];
        const empresas = empresaIds.length
          ? await db.select("companies", `select=id,name,segmento,domain&id=in.(${empresaIds.join(",")})`)
          : [];
        const mapaEmpresa = new Map(empresas.map((e: any) => [e.id, e]));
        const mapaContato = new Map(contatos.map((c: any) => [c.id, c]));
        return {
          fila: esteira.map((o: any) => {
            const c: any = mapaContato.get(o.contact_id) || {};
            return {
              outreach_id: o.id,
              estagio: o.state,
              desde: o.entered_state_at,
              contato: { id: c.id, nome: c.full_name, cargo: c.title, email: c.email, telefone: c.phone_e164 },
              empresa: mapaEmpresa.get(c.company_id) || null,
            };
          }),
        };
      },
    },

    {
      name: "salvar_rascunho",
      description:
        "Salva o texto de abordagem que VOCÊ escreveu para um contato, para o " +
        "usuário revisar e disparar depois. Não envia nada. Escreva o texto " +
        "antes de chamar — esta ferramenta só guarda.",
      inputSchema: obj(
        {
          contato_id: str("UUID do contato."),
          canal: enumOf("Canal do rascunho.", ["email", "whatsapp"]),
          assunto: str("Assunto (só para email)."),
          texto: str("O corpo da mensagem, pronto para enviar."),
        },
        ["contato_id", "canal", "texto"],
      ),
      async handler(input, ctx) {
        const [row] = await db.insert("drafts", [
          {
            contact_id: safe(String(input.contato_id)),
            channel: String(input.canal),
            subject: input.assunto ? String(input.assunto) : null,
            body: String(input.texto),
            created_by: ctx.agentId,
          },
        ]);
        return { salvo: true, id: row?.id, aviso: "Rascunho salvo. Nada foi enviado." };
      },
    },

    {
      name: "registrar_interacao",
      description:
        "Move um contato de estágio na esteira (ex: marcar que respondeu, que " +
        "virou reunião, ou que deve ser bloqueado). Use quando o usuário contar " +
        "o que aconteceu numa conversa.",
      inputSchema: obj(
        {
          contato_id: str("UUID do contato."),
          estagio: enumOf("Novo estágio.", ESTAGIOS),
          nota: str("O que aconteceu, em uma linha."),
        },
        ["contato_id", "estagio"],
      ),
      async handler(input, ctx) {
        const contactId = safe(String(input.contato_id));
        const estagio = String(input.estagio);
        const agora = new Date().toISOString();
        const patch: Record<string, unknown> = {
          contact_id: contactId,
          state: estagio,
          entered_state_at: agora,
          updated_at: agora,
        };
        patch[`ts_${estagio}`] = agora;
        await db.upsert("outreach", [patch], "contact_id");
        await logEvent(db, {
          kind: "interacao",
          contact_id: contactId,
          message: `${estagio}${input.nota ? " — " + input.nota : ""} (via ${ctx.agentId})`,
        });
        return { atualizado: true, estagio };
      },
    },

    // ── Buscador ────────────────────────────────────────────────────────────
    {
      name: "progresso_cmos",
      description:
        "Quanto falta para 100% da lista ter o decisor de marketing cadastrado: " +
        "% de cobertura, quebra por status e dias estimados no ritmo atual.",
      inputSchema: obj({}),
      async handler() {
        return getProgress(db, deps.cotaDiaria);
      },
    },

    {
      name: "rodar_lote_cmo",
      description:
        "Roda AGORA um lote de busca de decisores, além do lote automático do " +
        "dia. Gasta crédito Lusha. Use só quando o usuário pedir explicitamente.",
      external: true,
      inputSchema: obj({ quantidade: num("Quantas empresas processar neste lote (máx = cota do dia).") }),
      async handler(input, ctx) {
        if (!deps.lusha) return { erro: "LUSHA_API_KEY não configurada." };
        const cmoDeps: CmoDeps = {
          db,
          lusha: deps.lusha,
          blocklist: deps.blocklist,
          dryRun: ctx.dryRun,
          revelarTelefone: deps.revelarTelefone,
          cotaDiaria: deps.cotaDiaria,
          limiteCreditos: deps.limiteCreditos,
          hoje: todayInSaoPaulo(),
        };
        const resumo = await runCmoBatch(cmoDeps, Number(input.quantidade) || undefined);
        return { resumo, relatorio: formatCmoReport(resumo, ctx.dryRun) };
      },
    },

    {
      name: "corrigir_dominio",
      description:
        "Grava o domínio corporativo de uma empresa e a devolve para a fila do " +
        "buscador. Empresa sem domínio não pode ser enriquecida — esta é a " +
        "forma de destravar as que estão em 'sem_dominio'.",
      inputSchema: obj(
        { empresa_id: str("UUID da empresa."), dominio: str("Domínio limpo, ex: 'natura.com.br'.") },
        ["empresa_id", "dominio"],
      ),
      async handler(input, ctx) {
        const dominio = String(input.dominio)
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .replace(/\/.*$/, "")
          .trim();
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) {
          return { erro: `"${dominio}" não parece um domínio válido.` };
        }
        await db.update("companies", `id=eq.${safe(String(input.empresa_id))}`, {
          domain: dominio,
          cmo_status: "pendente",
          cmo_last_error: null,
          updated_at: new Date().toISOString(),
        });
        await logEvent(db, {
          kind: "dominio_corrigido",
          company_id: String(input.empresa_id),
          message: `${dominio} (via ${ctx.agentId})`,
        });
        return { atualizado: true, dominio, status: "pendente" };
      },
    },

    {
      name: "marcar_empresa",
      description:
        "Muda manualmente o status de uma empresa na fila do buscador. Use " +
        "'ignorada' para tirar da meta de 100% (ex: empresa que fechou).",
      inputSchema: obj(
        {
          empresa_id: str("UUID da empresa."),
          status: enumOf("Novo status.", ["pendente", "ignorada", "sem_decisor", "ok"]),
          motivo: str("Por quê, em uma linha."),
        },
        ["empresa_id", "status"],
      ),
      async handler(input, ctx) {
        await db.update("companies", `id=eq.${safe(String(input.empresa_id))}`, {
          cmo_status: String(input.status),
          cmo_last_error: input.motivo ? String(input.motivo) : null,
          updated_at: new Date().toISOString(),
        });
        await logEvent(db, {
          kind: "cmo_status_manual",
          company_id: String(input.empresa_id),
          message: `${input.status} — ${input.motivo || "sem motivo"} (via ${ctx.agentId})`,
        });
        return { atualizado: true, status: input.status };
      },
    },

    {
      name: "listar_travadas",
      description:
        "Lista as empresas travadas por falta de domínio ou por erro, em ordem " +
        "de rank. É o que o buscador usa para pedir ajuda ao usuário.",
      inputSchema: obj({
        motivo: enumOf("Qual travamento.", ["sem_dominio", "erro", "sem_decisor"]),
        limite: num("Quantas listar (padrão 15, máximo 50)."),
      }),
      async handler(input) {
        const motivo = String(input.motivo || "sem_dominio");
        const limite = Math.min(Number(input.limite) || 15, 50);
        return db.select(
          "companies",
          `select=id,rank,name,segmento,domain,cmo_last_error&cmo_status=eq.${motivo}` +
            `&order=rank.asc.nullslast&limit=${limite}`,
        );
      },
    },
  ];

  return tools;
}
