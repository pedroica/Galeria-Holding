// Worker 24h — o processo que fica ligado no Mac.
//
// Só faz conexões de SAÍDA (Supabase, Lusha, Anthropic/Qwen, Graph API da
// Meta). Não abre porta, não precisa de túnel, não precisa de IP fixo. O
// webhook do WhatsApp continua na Vercel, que tem URL estável e não dorme.
//
// O que ele faz que a Vercel não consegue:
//   • roda sem o teto de 60s por execução — lote grande não é problema
//   • trabalha o dia inteiro em lotes pequenos em vez de um pico às 7h30
//   • sobrevive a erro e retoma sozinho (launchd reinicia, estado no Supabase)
//
// Rodar: node --experimental-strip-types src/worker/daemon.ts
// Parar: SIGTERM (launchctl unload) — termina o lote em andamento e sai limpo.

import { resolve } from "node:path";
import { loadEnvFile } from "./env-file.ts";

// .env ANTES de qualquer import que leia process.env na carga.
const ENV_PATH = process.env.AGENT_ENV_FILE || resolve(process.cwd(), ".env");
const carga = loadEnvFile(ENV_PATH);

const { loadEnv } = await import("../config.ts");
const { createRuntime } = await import("../agents/orchestrator.ts");
const { logEvent } = await import("../tools/supabase.ts");
const { runCmoBatch, formatCmoReport, todayInSaoPaulo, getProgress } = await import("../jobs/daily-cmo.ts");
const { runDailyRoutine, lerSetting, gravarSetting, CHAVE_ULTIMA_RODADA, CHAVE_HEARTBEAT } =
  await import("../jobs/daily-routine.ts");
const { decidirAcao, relogioSaoPaulo, AGENDA_PADRAO } = await import("./schedule.ts");
const { criarServidor, CAMINHO_WEBHOOK } = await import("../server/http-server.ts");
const { iniciarTunel } = await import("../server/tunnel.ts");
const { registrarWebhook } = await import("../server/meta-webhook.ts");

const PORTA = Number(process.env.PORT || 8787);
// "worker" desliga o webhook (útil se ele estiver hospedado em outro lugar).
const MODO = (process.env.WORKER_MODE || "all").toLowerCase();
const TICK_MS = Math.max(60, Number(process.env.WORKER_TICK_MIN || 10) * 60) * 1000;
const LOTE_CONTINUO = Math.max(1, Number(process.env.WORKER_BATCH || 5));
const AGENDA = {
  ...AGENDA_PADRAO,
  janelaInicio: Number(process.env.WORKER_WINDOW_START ?? AGENDA_PADRAO.janelaInicio),
  janelaFim: Number(process.env.WORKER_WINDOW_END ?? AGENDA_PADRAO.janelaFim),
  fimDeSemana: /^(1|true|yes)$/i.test(process.env.WORKER_WEEKEND || ""),
};

let parando = false;
let ticksSemNada = 0;
let urlPublica: string | null = null;
let ultimoRegistro: string | null = null;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

async function tick(): Promise<void> {
  const env = loadEnv();
  const rt = await createRuntime();
  const relogio = relogioSaoPaulo();
  const hoje = todayInSaoPaulo();

  // Sinal de vida — a secretária consegue responder "o worker está de pé?".
  await gravarSetting(rt.db, CHAVE_HEARTBEAT, {
    em: new Date().toISOString(),
    host: process.env.HOSTNAME || "mac",
    dry_run: env.dryRun,
  });

  const pausadoRaw = await lerSetting<unknown>(rt.db, "agent_paused");
  const pausado = pausadoRaw === true || pausadoRaw === "true" || env.agentPaused;

  const processadasHoje = await rt.db
    .count("companies", `select=id&cmo_last_attempt_at=gte.${hoje}T00:00:00`)
    .catch(() => 0);

  const acao = decidirAcao(
    relogio,
    {
      ultimaRodada: await lerSetting<string>(rt.db, CHAVE_ULTIMA_RODADA),
      processadasHoje,
      cotaDiaria: env.cmoDailyQuota,
      pausado,
    },
    AGENDA,
  );

  if (acao.tipo === "dormir") {
    ticksSemNada++;
    // Log a cada 6 ticks parados para não encher o arquivo de log à toa.
    if (ticksSemNada % 6 === 1) log(`· dormindo — ${acao.motivo}`);
    return;
  }
  ticksSemNada = 0;

  if (acao.tipo === "rotina_diaria") {
    log(`▶ rotina diária — ${acao.motivo}`);
    const r = await runDailyRoutine(rt, env);
    log(r.executou ? `✓ relatório enviado (${r.entrega ?? "não entregue"})` : `· pulada: ${r.motivo}`);
    return;
  }

  // Lote contínuo: pequeno, espaçado, dentro da cota do dia.
  if (!rt.lusha) {
    log("· sem LUSHA_API_KEY — buscador parado");
    return;
  }
  log(`▶ lote de ${LOTE_CONTINUO} — ${acao.motivo}`);
  const resumo = await runCmoBatch(
    {
      db: rt.db,
      lusha: rt.lusha,
      blocklist: rt.blocklist,
      dryRun: env.dryRun,
      revelarTelefone: env.cmoRevealPhone,
      cotaDiaria: env.cmoDailyQuota,
      limiteCreditos: env.lushaDailyLimit,
      hoje,
    },
    LOTE_CONTINUO,
  );
  log(
    `✓ ${resumo.processadas} processadas · ${resumo.novosContatos} contatos · ` +
      `${resumo.creditosGastos} créditos · ${resumo.progresso.pct}% da lista`,
  );
  await logEvent(rt.db, {
    kind: "cmo_lote_worker",
    channel: "lusha",
    message: `worker: ${resumo.processadas} processadas, ${resumo.novosContatos} contatos`,
    payload: resumo,
    dry_run: env.dryRun,
  });
}

async function main() {
  log("── worker dos agentes Galeria ──");
  log(carga.erro ? `.env não lido (${carga.erro}) — usando só o ambiente` : `.env: ${carga.carregadas} variáveis de ${ENV_PATH}`);

  const env = loadEnv();
  log(`modo=${MODO} · DRY_RUN=${env.dryRun} · cota=${env.cmoDailyQuota}/dia · tick=${TICK_MS / 60000}min · janela ${AGENDA.janelaInicio}h-${AGENDA.janelaFim}h`);

  // Falha cedo e alto: sem Supabase não há o que fazer, e é melhor o launchd
  // reiniciar mostrando o erro do que o processo ficar de pé sem trabalhar.
  const rt = await createRuntime();
  const p = await getProgress(rt.db, env.cmoDailyQuota);
  log(`conectado · ${p.concluidas}/${p.totalElegiveis} empresas com decisor (${p.pct}%)`);

  // ── Webhook: servidor local + túnel + registro na Meta ───────────────────
  let pararTunel = () => {};
  if (MODO === "all") {
    const servidor = criarServidor({
      porta: PORTA,
      env,
      runtime: rt,
      log,
      estado: () => ({ urlPublica, ultimoRegistro, dryRun: env.dryRun }),
    });
    // Porta ocupada quase sempre significa "o serviço já está rodando" — vale
    // uma frase explicando, não um stack trace. Sai com 0 para o launchd não
    // entender como falha e entrar em ciclo de reinício.
    const subiu = await new Promise<boolean>((resolve, reject) => {
      const aoFalhar = (e: NodeJS.ErrnoException) => {
        if (e.code === "EADDRINUSE") {
          log(`✗ a porta ${PORTA} já está ocupada — o serviço do launchd provavelmente já está de pé.`);
          log(`  Acompanhar:  tail -f ~/Library/Logs/galeria-agentes.log`);
          log(`  Parar o serviço:  launchctl unload ~/Library/LaunchAgents/co.galeriaholding.agentes.plist`);
          resolve(false);
          return;
        }
        reject(e);
      };
      servidor.once("error", aoFalhar);
      servidor.listen(PORTA, "127.0.0.1", () => {
        servidor.off("error", aoFalhar);
        resolve(true);
      });
    });
    if (!subiu) process.exit(0);
    log(`servidor ouvindo em 127.0.0.1:${PORTA} (só o túnel alcança)`);

    const appId = process.env.WHATSAPP_APP_ID;
    const tunel = iniciarTunel({
      porta: PORTA,
      urlFixa: process.env.PUBLIC_URL,
      log,
      // Chamado na primeira URL e a cada troca — o túnel gratuito muda de
      // endereço a cada reinício, e a Meta precisa saber do novo.
      aoMudarUrl: async (base) => {
        urlPublica = base + CAMINHO_WEBHOOK;
        if (!appId || !env.waAppSecret || !env.waVerifyToken) {
          log(`webhook público em ${urlPublica} — registre na Meta (falta WHATSAPP_APP_ID?)`);
          return;
        }
        const r = await registrarWebhook({
          appId,
          appSecret: env.waAppSecret,
          verifyToken: env.waVerifyToken,
          callbackUrl: urlPublica,
          wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
          token: env.waToken,
        });
        ultimoRegistro = new Date().toISOString();
        if (r.ok) {
          log(`✓ webhook registrado na Meta: ${urlPublica}`);
        } else {
          for (const e of r.etapas.filter((x) => !x.ok)) {
            log(`✗ registro na Meta (${e.etapa}): ${e.detalhe}`);
          }
        }
      },
    });
    pararTunel = () => tunel.parar();
  } else {
    log("modo worker: webhook desligado (WORKER_MODE=worker)");
  }

  while (!parando) {
    try {
      await tick();
    } catch (e) {
      log("✗ erro no tick:", e instanceof Error ? e.message : String(e));
    }
    // Espera interrompível: SIGTERM não fica preso até o fim do intervalo.
    await new Promise<void>((r) => {
      const t = setTimeout(r, TICK_MS);
      const parar = () => { clearTimeout(t); r(); };
      process.once("SIGTERM", parar);
      process.once("SIGINT", parar);
    });
  }
  pararTunel();
  log("── encerrado ──");
}

for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    if (parando) process.exit(0);
    parando = true;
    log(`${sinal} recebido — encerrando depois do lote atual`);
  });
}

main().catch((e) => {
  log("✗ fatal:", e instanceof Error ? e.stack || e.message : String(e));
  process.exit(1);
});
