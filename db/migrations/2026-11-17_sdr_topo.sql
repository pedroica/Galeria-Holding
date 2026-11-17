-- Bloco G (SDR): topo de funil. Candidatos de três fontes, para o Pedro aceitar
-- ou descartar antes de entrarem na seleção: cross-sell interno, sinais de compra
-- e lookalike dos melhores clientes. Aditiva. Reverter: cron.unschedule('sdr-topo').
create table if not exists public.crm_sdr_topo (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,              -- fonte|empresa ou domínio|agência
  fonte text not null,                     -- cross_sell | sinal_compra | lookalike
  empresa_id uuid references public.crm_empresas(id),
  nome text, dominio text,
  agencia_slug text,
  motivo text,
  score numeric default 0,
  dados jsonb,
  status text not null default 'novo',     -- novo | aceito | descartado
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists crm_sdr_topo_status_idx on public.crm_sdr_topo(status, score desc);
alter table public.crm_sdr_topo enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='crm_sdr_topo' and policyname='autenticado_tudo') then
    create policy autenticado_tudo on public.crm_sdr_topo for all to authenticated using (true) with check (true);
  end if;
end $$;
-- Segunda-feira 05h BRT (08h UTC). Dormente enquanto sdr_relogio_ativo=false.
select cron.schedule('sdr-topo', '0 8 * * 1', $$select public.sdr_tick('sdr-topo', 0)$$);
