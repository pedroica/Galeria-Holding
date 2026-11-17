-- Fase 2, item 2: Modo Sombra explícito. Com sdr_modo_sombra=true tudo roda e é
-- marcado sombra=true, mas nada vai para crm_fila nem para agendamento/envio.
-- Aditiva. Reverter: update crm_configuracoes set valor='false' where chave='sdr_modo_sombra'.
alter table public.crm_sdr_estado add column if not exists sombra boolean not null default false;
alter table public.crm_sdr_mensagens add column if not exists sombra boolean not null default false;
insert into public.crm_configuracoes (chave, valor) values ('sdr_modo_sombra', 'true'::jsonb)
on conflict (chave) do nothing;

-- Custo do avaliador por mensagem (para o custo por mensagem aprovada) e câmbio.
alter table public.crm_sdr_mensagens add column if not exists custo_qc_usd numeric default 0;
insert into public.crm_configuracoes (chave, valor) values ('sdr_usd_brl', '5.4'::jsonb) on conflict (chave) do nothing;
