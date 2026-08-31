-- ============================================================================
-- Agentes de WhatsApp — sessões, fila de CMOs, lembretes e rascunhos.
-- Aplicar no SQL Editor do Supabase DEPOIS de 0000_init.sql.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

-- ── Fila do buscador de CMOs (colunas na própria companies) ─────────────────
-- Por que aqui e não numa tabela à parte: "esta empresa já tem decisor?" é
-- pergunta sobre a empresa, e um join a menos em toda consulta do agente.
alter table companies add column if not exists cmo_status text not null default 'pendente';
alter table companies add column if not exists cmo_attempts integer not null default 0;
alter table companies add column if not exists cmo_last_attempt_at timestamptz;
alter table companies add column if not exists cmo_last_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_cmo_status_chk') then
    alter table companies add constraint companies_cmo_status_chk check (cmo_status in (
      'pendente','ok','revisar','sem_dominio','sem_decisor','bloqueada','duplicado','erro','ignorada'
    ));
  end if;
end $$;

-- Índice da fila: o job diário lê exatamente com estes filtros.
create index if not exists companies_cmo_fila_idx
  on companies (cmo_status, rank)
  where blocked = false;

-- Empresa já marcada como bloqueada na migração entra como 'bloqueada' — não
-- faz sentido gastar crédito com cliente da casa.
update companies set cmo_status = 'bloqueada'
  where blocked = true and cmo_status = 'pendente';

-- Empresa sem domínio não tem como ser enriquecida: já nasce sinalizada.
update companies set cmo_status = 'sem_dominio'
  where blocked = false and cmo_status = 'pendente'
    and (domain is null or btrim(domain) = '');

-- Empresa que JÁ tem contato cadastrado conta como concluída.
update companies c set cmo_status = 'ok'
  where c.cmo_status in ('pendente','sem_dominio')
    and exists (select 1 from contacts ct where ct.company_id = c.id and ct.email is not null);

-- ── Sessões de conversa (uma por número de WhatsApp) ────────────────────────
create table if not exists agent_sessions (
  phone       text primary key,              -- E.164 só dígitos
  agent_id    text not null default 'secretaria',
  messages    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Idempotência do webhook (a Meta reentrega quando demora o 200) ──────────
create table if not exists wa_inbox (
  wamid        text primary key,
  received_at  timestamptz not null default now()
);
create index if not exists wa_inbox_received_idx on wa_inbox (received_at desc);

-- ── Lembretes da secretária ─────────────────────────────────────────────────
create table if not exists reminders (
  id            uuid primary key default gen_random_uuid(),
  texto         text not null,
  due_date      date not null,
  done          boolean not null default false,
  delivered_at  timestamptz,
  created_by    text,                        -- telefone de quem pediu
  agent_id      text,
  created_at    timestamptz not null default now()
);
create index if not exists reminders_due_idx on reminders (due_date) where done = false;

-- ── Rascunhos de abordagem do vendedor ──────────────────────────────────────
create table if not exists drafts (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid references contacts(id) on delete cascade,
  channel     text not null check (channel in ('email','whatsapp')),
  subject     text,
  body        text not null,
  sent        boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists drafts_contact_idx on drafts (contact_id, created_at desc);

-- ── RLS: estas tabelas são SÓ do worker (service_role bypassa RLS) ──────────
-- Sem policy para anon = o CRM no navegador não lê sessão nem inbox. É de
-- propósito: histórico de conversa não deve ficar exposto pela anon key.
alter table agent_sessions enable row level security;
alter table wa_inbox       enable row level security;
alter table reminders      enable row level security;
alter table drafts         enable row level security;

-- Limpeza: inbox velho não serve para nada depois que a Meta para de reentregar.
-- (Opcional — agende no Supabase se quiser.)
--   delete from wa_inbox where received_at < now() - interval '7 days';
