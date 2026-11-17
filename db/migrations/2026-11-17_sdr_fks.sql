-- Correção: crm_sdr_estado, crm_sdr_mensagens e crm_dossies não tinham chave
-- estrangeira, e o PostgREST só faz embed (crm_empresas:empresa_id(...)) com FK.
-- Toda leitura com embed dos jobs SDR falhava em produção (os testes simulavam o
-- banco). Aditiva; NOT VALID para não depender de linhas antigas.
-- Reverter: alter table ... drop constraint <nome>.
alter table public.crm_sdr_estado    add constraint crm_sdr_estado_empresa_fk  foreign key (empresa_id) references public.crm_empresas(id)  not valid;
alter table public.crm_sdr_estado    add constraint crm_sdr_estado_decisor_fk  foreign key (decisor_id) references public.crm_decisores(id) not valid;
alter table public.crm_sdr_estado    add constraint crm_sdr_estado_agencia_fk  foreign key (agencia_id) references public.crm_agencias(id)  not valid;
alter table public.crm_sdr_estado    add constraint crm_sdr_estado_dossie_fk   foreign key (dossie_id)  references public.crm_dossies(id)   not valid;
alter table public.crm_sdr_estado    add constraint crm_sdr_estado_fila_fk     foreign key (fila_id)    references public.crm_fila(id)      not valid;
alter table public.crm_sdr_mensagens add constraint crm_sdr_mensagens_estado_fk  foreign key (estado_id)  references public.crm_sdr_estado(id) not valid;
alter table public.crm_sdr_mensagens add constraint crm_sdr_mensagens_empresa_fk foreign key (empresa_id) references public.crm_empresas(id)   not valid;
alter table public.crm_sdr_mensagens add constraint crm_sdr_mensagens_decisor_fk foreign key (decisor_id) references public.crm_decisores(id)  not valid;
alter table public.crm_sdr_mensagens add constraint crm_sdr_mensagens_agencia_fk foreign key (agencia_id) references public.crm_agencias(id)   not valid;
alter table public.crm_sdr_mensagens add constraint crm_sdr_mensagens_dossie_fk  foreign key (dossie_id)  references public.crm_dossies(id)    not valid;
alter table public.crm_dossies       add constraint crm_dossies_empresa_fk       foreign key (empresa_id) references public.crm_empresas(id)   not valid;
alter table public.crm_sdr_respostas add constraint crm_sdr_respostas_empresa_fk foreign key (empresa_id) references public.crm_empresas(id)   not valid;
notify pgrst, 'reload schema';

-- Chave da Anthropic no Vault (nome 'anthropic_api_key'), lida só pelo service_role
-- quando a env da Vercel estiver ausente ou inválida.
create or replace function public.sdr_anthropic_key()
returns text language sql security definer set search_path = public, vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'anthropic_api_key' limit 1 $$;
revoke all on function public.sdr_anthropic_key() from public, anon, authenticated;
grant execute on function public.sdr_anthropic_key() to service_role;
