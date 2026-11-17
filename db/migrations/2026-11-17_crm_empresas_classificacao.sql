-- Fase 2, item 3: limpeza da carteira SEM nada irreversível. Só colunas de
-- sugestão: nada é apagado, mesclado ou sobrescrito (setor original intacto).
-- Mesclagem em massa é decisão do Pedro. Reverter: as colunas podem ficar.
alter table public.crm_empresas add column if not exists classificacao_sugerida text; -- cliente_real | campanha | duplicata | indefinido
alter table public.crm_empresas add column if not exists classificacao_motivo text;
alter table public.crm_empresas add column if not exists duplicata_de uuid references public.crm_empresas(id);
alter table public.crm_empresas add column if not exists setor_sugerido text;
alter table public.crm_empresas add column if not exists setor_fonte text;           -- dominio | nome_da_marca | setor_existente
alter table public.crm_empresas add column if not exists classificado_em timestamptz;
