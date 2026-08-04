-- ============================================================================
-- Agente Outbound Galeria — Schema base (Supabase / Postgres)
-- Fonte única da verdade. Aplicado via Supabase SQL Editor ou `supabase db push`.
--
-- FASE 0 usa: blocklist, blocklist_log, settings.
-- Demais tabelas (companies, contacts, outreach, events, daily_counters,
-- lusha_credits) são a fundação das Fases 1-4 — criadas já aqui para manter
-- "tudo conectado", mas só passam a ser escritas nas fases seguintes.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ── Helper: normalização de nome (apoio a índices/dedupe) ───────────────────
-- lower + "&"→" e " + remove pontuação + colapsa espaços. 100% IMMUTABLE e
-- portável (sem depender da extensão unaccent). A VERDADE do matching — que
-- inclui remoção de acentos e variações — vive no código TS testado
-- (src/lib/normalize.ts + blocklist.ts); aqui é só apoio de banco.
create or replace function gh_norm(txt text)
returns text language sql immutable as $$
  select trim(regexp_replace(
           regexp_replace(lower(coalesce(txt,'')), '&', ' e ', 'g'),
           '[^a-z0-9]+', ' ', 'g'));
$$;

-- ── SETTINGS (chave/valor global do agente) ─────────────────────────────────
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ── BLOCKLIST (Módulo 0 — clientes atuais da Holding) ───────────────────────
create table if not exists blocklist (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null,                 -- nome de exibição, ex: "Itaú"
  aliases         text[] not null default '{}',  -- variações: "Itaú Unibanco", "Banco Itaú"
  domains         text[] not null default '{}',  -- itau.com.br, itau-unibanco.com.br
  economic_group  text,                          -- grupo econômico, ex: "Itaú Unibanco"
  note            text,                           -- por que está bloqueada / qual empresa da Holding
  active          boolean not null default true,
  source          text not null default 'manual', -- 'seed' | 'manual' | 'restrictions_import'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists blocklist_norm_idx on blocklist (gh_norm(canonical_name));
create index if not exists blocklist_domains_idx on blocklist using gin (domains);
create index if not exists blocklist_aliases_idx on blocklist using gin (aliases);

-- Log de tudo que foi bloqueado (checagem dupla: pré-Lusha e pré-disparo)
create table if not exists blocklist_log (
  id            uuid primary key default gen_random_uuid(),
  stage         text not null,   -- 'pre_enrich' | 'pre_send'
  channel       text,            -- 'email' | 'whatsapp' | null (enriquecimento)
  input_name    text,
  input_domain  text,
  input_email   text,
  reason        text not null,   -- 'domain' | 'name' | 'economic_group'
  matched       text,            -- token/domínio que casou
  blocklist_id  uuid references blocklist(id) on delete set null,
  company_id    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists blocklist_log_created_idx on blocklist_log (created_at desc);

-- ── COMPANIES (Fase 1 — migração do CRM) ────────────────────────────────────
create table if not exists companies (
  id            uuid primary key default gen_random_uuid(),
  crm_key       text unique,                 -- chave original do CRM (ex: galeria_5000)
  rank          integer,
  name          text not null,
  segmento      text,                        -- setor original do CRM
  area          text,                        -- {ÁREA} inferida (Fase 2)
  domain        text,                        -- domínio corporativo (para blocklist/email)
  linkedin_url  text,
  blocked       boolean not null default false,
  blocked_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists companies_norm_uidx on companies (gh_norm(name));

-- ── CONTACTS (Fase 1 — decisores enriquecidos) ──────────────────────────────
create table if not exists contacts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  full_name     text,
  title         text,                        -- cargo (CMO, VP Mkt, Diretor...)
  email         text,
  phone_e164    text,                        -- celular BR normalizado (+55...)
  linkedin_url  text,
  segmento      text,
  source        text default 'lusha',        -- 'lusha' | 'crm' | 'manual'
  data_quality  text not null default 'ok',  -- 'ok' | 'incomplete' | 'invalid'
  needs_review  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Dedupe absoluto por email E telefone (parciais: ignoram nulos)
create unique index if not exists contacts_email_uidx on contacts (lower(email)) where email is not null;
create unique index if not exists contacts_phone_uidx on contacts (phone_e164) where phone_e164 is not null;

-- ── OUTREACH (Fase 4 — cadence engine / máquina de estados) ─────────────────
create table if not exists outreach (
  id                 uuid primary key default gen_random_uuid(),
  contact_id         uuid not null references contacts(id) on delete cascade,
  state              text not null default 'enriquecido'
    check (state in (
      'enriquecido','email_d0','whatsapp_d1','followup_email_d4',
      'followup_whatsapp_d7','sem_resposta_d14','respondeu',
      'reuniao_marcada','bloqueado'
    )),
  entered_state_at   timestamptz not null default now(),
  -- timestamps de cada transição (auditoria da esteira)
  ts_enriquecido        timestamptz,
  ts_email_d0           timestamptz,
  ts_whatsapp_d1        timestamptz,
  ts_followup_email_d4  timestamptz,
  ts_followup_whatsapp_d7 timestamptz,
  ts_sem_resposta_d14   timestamptz,
  ts_respondeu          timestamptz,
  ts_reuniao_marcada    timestamptz,
  ts_bloqueado          timestamptz,
  responded_channel  text,           -- 'email' | 'whatsapp'
  paused             boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (contact_id)
);
create index if not exists outreach_state_idx on outreach (state);

-- ── EVENTS (log unificado de tudo que o agente faz) ─────────────────────────
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,   -- 'enrich','draft_created','wa_sent','reply','error','blocked','limit_hit'...
  channel     text,            -- 'email' | 'whatsapp' | 'lusha' | 'telegram' | 'system'
  company_id  uuid,
  contact_id  uuid,
  level       text not null default 'info',  -- 'info' | 'warn' | 'error'
  message     text,
  payload     jsonb,
  dry_run     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists events_created_idx on events (created_at desc);
create index if not exists events_kind_idx on events (kind);

-- ── DAILY_COUNTERS (rate limits por canal/dia, America/Sao_Paulo) ───────────
create table if not exists daily_counters (
  day        date not null,
  channel    text not null,   -- 'email' | 'whatsapp' | 'lusha'
  count      integer not null default 0,
  primary key (day, channel)
);

-- ── LUSHA_CREDITS (consumo/limite de créditos) ──────────────────────────────
create table if not exists lusha_credits (
  day             date primary key,
  credits_used    integer not null default 0,
  daily_limit     integer not null default 60,
  credits_left_api integer,        -- saldo reportado pela API, quando disponível
  updated_at      timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- MVP: o worker usa a service_role key (bypassa RLS). O CRM (anon key) recebe
-- políticas permissivas abaixo para ler/escrever a blocklist e companies.
-- ⚠️ Endurecer com Supabase Auth antes de expor publicamente.
alter table blocklist       enable row level security;
alter table blocklist_log   enable row level security;
alter table companies       enable row level security;
alter table contacts        enable row level security;
alter table outreach        enable row level security;
alter table events          enable row level security;
alter table settings        enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='blocklist' and policyname='anon_all_blocklist') then
    create policy anon_all_blocklist on blocklist for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='companies' and policyname='anon_all_companies') then
    create policy anon_all_companies on companies for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='settings' and policyname='anon_read_settings') then
    create policy anon_read_settings on settings for select to anon using (true);
  end if;
end $$;

-- Valores default de settings (guardrails). O worker lê daqui e/ou do .env.
insert into settings (key, value) values
  ('dry_run',            'true'::jsonb),
  ('agent_paused',       'false'::jsonb),
  ('email_daily_max',    '50'::jsonb),
  ('whatsapp_daily_max', '25'::jsonb),
  ('whatsapp_ramp',      '[5,10,15,25]'::jsonb),
  ('lusha_daily_limit',  '60'::jsonb),
  ('timezone',           '"America/Sao_Paulo"'::jsonb)
on conflict (key) do nothing;
