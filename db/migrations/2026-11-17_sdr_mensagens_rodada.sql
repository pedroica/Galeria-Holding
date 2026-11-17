-- Modo Sombra: rodadas de ajuste de prompt. A rodada anterior é arquivada (não
-- apagada) para o placar mostrar só a versão atual. Aditiva.
alter table public.crm_sdr_mensagens add column if not exists arquivada boolean not null default false;
alter table public.crm_sdr_mensagens add column if not exists rodada integer not null default 1;
