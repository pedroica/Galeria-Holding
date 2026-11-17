-- Bloco C (SDR): versões redigidas + notas do controle de qualidade.
-- Aplicada em produção em 2026-11-17. Aditiva e reversível:
--   reverter: select cron.unschedule('sdr-redacao'); select cron.unschedule('sdr-qualidade');
--             (a tabela pode ficar; não há dados de cliente nela além de rascunhos)
create table if not exists public.crm_sdr_mensagens (
  id uuid primary key default gen_random_uuid(),
  estado_id uuid references public.crm_sdr_estado(id),
  decisor_id uuid, empresa_id uuid, agencia_id uuid, dossie_id uuid,
  sinal_tipo text, sinal_url text,
  canal text, etapa text, dia_cadencia integer default 0,
  angulo text, versao integer,
  assunto text, corpo text, case_titulo text,
  modelo text, tokens_prompt integer, tokens_resposta integer, custo_usd numeric,
  nota_aderencia integer, nota_especificidade integer, nota_naturalidade integer,
  nota_clareza integer, nota_risco integer, nota_media numeric,
  aprovado_autonomo boolean default false, motivo_qc text,
  escolhida boolean default false,
  criado_em timestamptz not null default now()
);
create index if not exists crm_sdr_mensagens_estado_idx on public.crm_sdr_mensagens(estado_id);
create index if not exists crm_sdr_mensagens_criado_idx on public.crm_sdr_mensagens(criado_em desc);
alter table public.crm_sdr_mensagens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='crm_sdr_mensagens' and policyname='autenticado_tudo') then
    create policy autenticado_tudo on public.crm_sdr_mensagens for all to authenticated using (true) with check (true);
  end if;
end $$;

insert into public.crm_configuracoes (chave, valor) values
  ('sdr_redacao_lote', '4'::jsonb), ('sdr_qualidade_lote', '5'::jsonb)
on conflict (chave) do nothing;

-- Relógio (dormente enquanto sdr_relogio_ativo=false): redação 04-06h UTC, QC 07h UTC.
select cron.schedule('sdr-redacao',   '*/8 4-6 * * *', $$select public.sdr_tick('sdr-redacao', 4)$$);
select cron.schedule('sdr-qualidade', '*/8 7 * * *',   $$select public.sdr_tick('sdr-qualidade', 5)$$);
