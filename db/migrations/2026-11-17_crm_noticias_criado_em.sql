-- Correção: o job noticias-semanal grava e filtra crm_noticias.criado_em, mas a
-- coluna não existia. O filtro de rotação falhava (as mesmas empresas voltavam
-- todo dia: "faltam 57" constante). Aditiva. Linhas antigas recebem a data de
-- publicação como aproximação.
alter table public.crm_noticias add column if not exists criado_em timestamptz default now();
create index if not exists crm_noticias_criado_idx on public.crm_noticias(criado_em desc);
update public.crm_noticias set criado_em = data::timestamptz where data is not null and criado_em >= current_date;
