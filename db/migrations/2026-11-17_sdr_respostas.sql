-- Bloco E (SDR): leitura de respostas, bounce e opt-out. Aditiva e reversível:
--   reverter: select cron.unschedule('sdr-respostas');
--             (colunas/tabela novas podem ficar; nada existente foi alterado)
alter table public.crm_decisores add column if not exists opt_out boolean not null default false;
alter table public.crm_decisores add column if not exists opt_out_em timestamptz;

create table if not exists public.crm_sdr_respostas (
  id uuid primary key default gen_random_uuid(),
  graph_message_id text not null unique,
  conversation_id text,
  decisor_id uuid references public.crm_decisores(id),
  empresa_id uuid,
  fila_id uuid,
  remetente text,
  assunto text,
  preview text,
  recebido_em timestamptz,
  tipo text not null,
  confianca text,
  evidencia text,
  acao text,
  oportunidade_id uuid,
  lida_pelo_pedro boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists crm_sdr_respostas_recebido_idx on public.crm_sdr_respostas(recebido_em desc);
create index if not exists crm_sdr_respostas_decisor_idx on public.crm_sdr_respostas(decisor_id);
alter table public.crm_sdr_respostas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='crm_sdr_respostas' and policyname='autenticado_tudo') then
    create policy autenticado_tudo on public.crm_sdr_respostas for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Caixa de entrada lida a cada 15 min, dias úteis, 08h-20h BRT (11h-23h UTC).
-- Dormente enquanto sdr_relogio_ativo=false (sdr_tick não chama nada).
select cron.schedule('sdr-respostas', '*/15 11-23 * * 1-5', $$select public.sdr_tick('sdr-respostas', 50)$$);
