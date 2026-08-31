// Rotina diária pelo Vercel Cron. A lógica mora em jobs/daily-routine.ts,
// compartilhada com o worker do Mac — quem rodar primeiro no dia executa, o
// outro vê a marca em `settings` e não repete.
//
// Protegido por CRON_SECRET: a URL é pública, o gatilho não pode ser.

import { loadEnv } from "../../agent/src/config.ts";
import { createRuntime } from "../../agent/src/agents/orchestrator.ts";
import { getHeader, reply, type NodeLikeResponse } from "../../agent/src/channels/http.ts";
import { runDailyRoutine } from "../../agent/src/jobs/daily-routine.ts";

export const config = { maxDuration: 300 };

function autorizado(req: any, segredo: string | undefined): boolean {
  if (!segredo) return false; // sem segredo configurado, ninguém dispara
  return (
    getHeader(req, "authorization") === `Bearer ${segredo}` ||
    getHeader(req, "x-cron-secret") === segredo
  );
}

export default async function handler(req: any, res?: NodeLikeResponse) {
  const env = loadEnv();
  if (!autorizado(req, env.cronSecret)) return reply(res, 403, "forbidden");

  const rt = await createRuntime();
  const r = await runDailyRoutine(rt, env);

  return reply(res, 200, JSON.stringify({ ok: true, ...r }), "application/json; charset=utf-8");
}
