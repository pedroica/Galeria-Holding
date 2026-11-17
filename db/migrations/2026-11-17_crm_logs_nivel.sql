-- Correção: crm_logs só aceitava nivel info/warn/erro, mas o cron e a tela
-- Atividade usam 'aviso' e 'error'. Resultado: todo log de aviso/erro dos crons
-- era rejeitado em silêncio (logCron engole a falha) e só 'info' chegava.
-- Amplia a lista (nada que era aceito deixa de ser). Reverter: recriar com a lista antiga.
alter table public.crm_logs drop constraint if exists crm_logs_nivel_check;
alter table public.crm_logs add constraint crm_logs_nivel_check check (nivel = any (array['info','warn','erro','aviso','error']));
