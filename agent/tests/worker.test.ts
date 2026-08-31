import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile } from "../src/worker/env-file.ts";
import { decidirAcao, relogioSaoPaulo, AGENDA_PADRAO } from "../src/worker/schedule.ts";

// ── .env ───────────────────────────────────────────────────────────────────
test("parseEnvFile lê pares simples e ignora comentário e linha vazia", () => {
  const r = parseEnvFile(`
# comentário
SUPABASE_URL=https://x.supabase.co

DRY_RUN=true
`);
  assert.deepEqual(r, { SUPABASE_URL: "https://x.supabase.co", DRY_RUN: "true" });
});

test("parseEnvFile preserva '=' no meio do valor", () => {
  // Token da Meta e chave do Supabase têm '=' — cortar no primeiro quebraria.
  const r = parseEnvFile("SUPABASE_SERVICE_ROLE_KEY=eyJhbGci.OiJI=UzI1NiJ9==");
  assert.equal(r.SUPABASE_SERVICE_ROLE_KEY, "eyJhbGci.OiJI=UzI1NiJ9==");
});

test("parseEnvFile tira aspas e aceita export", () => {
  const r = parseEnvFile(`export WHATSAPP_VERIFY_TOKEN="galeria 2026"\nQWEN_MODEL='qwen-plus'`);
  assert.equal(r.WHATSAPP_VERIFY_TOKEN, "galeria 2026");
  assert.equal(r.QWEN_MODEL, "qwen-plus");
});

test("parseEnvFile corta comentário no fim da linha, mas não dentro de aspas", () => {
  const r = parseEnvFile(`CMO_DAILY_QUOTA=40 # empresas por dia\nSENHA="abc # nao-comentario"`);
  assert.equal(r.CMO_DAILY_QUOTA, "40");
  assert.equal(r.SENHA, "abc # nao-comentario");
});

test("parseEnvFile ignora nome de variável inválido", () => {
  const r = parseEnvFile("2FOO=x\n=semnome\nOK=1");
  assert.deepEqual(r, { OK: "1" });
});

// ── Relógio ────────────────────────────────────────────────────────────────
test("relogioSaoPaulo usa o fuso de São Paulo, não o do Mac", () => {
  // 02:00 UTC de 1º de janeiro ainda é 31/12, 23h, em São Paulo (UTC-3).
  const r = relogioSaoPaulo(new Date("2026-01-01T02:00:00Z"));
  assert.equal(r.dia, "2025-12-31");
  assert.equal(r.hora, 23);
  assert.equal(r.diaSemana, 3); // quarta
});

// ── Decisão do tick ────────────────────────────────────────────────────────
const base = { processadasHoje: 0, cotaDiaria: 40, pausado: false };
const terca10h = { dia: "2026-03-03", hora: 10, minuto: 0, diaSemana: 2 };

test("pausado vence tudo — o kill switch vale na hora", () => {
  const a = decidirAcao(terca10h, { ...base, pausado: true });
  assert.equal(a.tipo, "dormir");
  assert.match(a.motivo, /pausado/);
});

test("depois das 7h30, se a rotina do dia não rodou, ela é a prioridade", () => {
  const a = decidirAcao({ ...terca10h, hora: 7, minuto: 31 }, { ...base, ultimaRodada: "2026-03-02" });
  assert.equal(a.tipo, "rotina_diaria");
});

test("às 7h29 ainda não é hora do relatório", () => {
  const a = decidirAcao({ ...terca10h, hora: 7, minuto: 29 }, { ...base, ultimaRodada: "2026-03-02" });
  assert.notEqual(a.tipo, "rotina_diaria");
});

test("rotina já rodada hoje não repete — vira trabalho contínuo", () => {
  const a = decidirAcao(terca10h, { ...base, ultimaRodada: "2026-03-03" });
  assert.equal(a.tipo, "lote_continuo");
});

test("cota cumprida encerra o dia", () => {
  const a = decidirAcao(terca10h, { ...base, ultimaRodada: "2026-03-03", processadasHoje: 40 });
  assert.equal(a.tipo, "dormir");
  assert.match(a.motivo, /cota/);
});

test("fora da janela dorme, mesmo com cota sobrando", () => {
  const a = decidirAcao({ ...terca10h, hora: 22 }, { ...base, ultimaRodada: "2026-03-03" });
  assert.equal(a.tipo, "dormir");
  assert.match(a.motivo, /janela/);
});

test("fim de semana dorme por padrão, e trabalha se configurado", () => {
  const sabado = { dia: "2026-03-07", hora: 10, minuto: 0, diaSemana: 6 };
  const estado = { ...base, ultimaRodada: "2026-03-07" };
  assert.equal(decidirAcao(sabado, estado).tipo, "dormir");
  assert.equal(decidirAcao(sabado, estado, { ...AGENDA_PADRAO, fimDeSemana: true }).tipo, "lote_continuo");
});

test("relatório atrasado ainda sai no mesmo dia, fora da janela", () => {
  // Mac ligado só às 21h: o relatório do dia não pode simplesmente sumir.
  const a = decidirAcao({ ...terca10h, hora: 21 }, { ...base, ultimaRodada: "2026-03-02" });
  assert.equal(a.tipo, "rotina_diaria");
});

// ── Sinal de vida do worker, como o /status mostra ─────────────────────────
import { descreverHeartbeat } from "../src/agents/orchestrator.ts";

const agora = new Date("2026-03-03T12:00:00Z");
const haMinutos = (m: number) => ({ em: new Date(agora.getTime() - m * 60000).toISOString() });

test("heartbeat recente aparece como ativo", () => {
  assert.match(descreverHeartbeat(haMinutos(1), agora), /agora/);
  assert.match(descreverHeartbeat(haMinutos(25), agora), /há 25 min/);
});

test("silêncio longo é destacado, porque é o que importa saber", () => {
  assert.match(descreverHeartbeat(haMinutos(180), agora), /sem sinal há 3h/);
  assert.match(descreverHeartbeat(haMinutos(60 * 50), agora), /2 dia/);
});

test("heartbeat ausente ou inválido não quebra o /status", () => {
  assert.match(descreverHeartbeat(undefined, agora), /nunca rodou/);
  assert.match(descreverHeartbeat({ em: "banana" }, agora), /sem sinal/);
  assert.match(descreverHeartbeat(null, agora), /nunca rodou/);
});
