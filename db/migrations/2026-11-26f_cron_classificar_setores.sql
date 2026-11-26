-- Relógio da classificação de setores (2026-11-26): a cada 5 min, só se houver
-- empresa sem setor_canonico (cadastro novo entra classificado em minutos).
SELECT cron.schedule('classificar-setores', '*/5 * * * *', $$ SELECT public.sdr_invoke('classificar-setores', 1) WHERE EXISTS (SELECT 1 FROM crm_empresas WHERE setor_canonico IS NULL AND apagado_em IS NULL) $$);
