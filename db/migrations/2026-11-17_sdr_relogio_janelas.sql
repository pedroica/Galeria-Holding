-- Relógio noturno do SDR (seleção + dossiê), dormente até ser ligado.
-- sdr_tick só chama sdr_invoke quando crm_configuracoes.sdr_relogio_ativo=true,
-- então o pg_cron fica agendado sem gerar 401 antes de o PR estar na main, o
-- SDR_CRON_SECRET na Vercel e a chave ligada. Aplicada em produção 2026-11-17.
INSERT INTO crm_configuracoes (chave, valor) VALUES ('sdr_relogio_ativo','false'::jsonb)
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION sdr_tick(job text, lote integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, net AS $$
DECLARE ativo boolean;
BEGIN
  SELECT (valor #>> '{}')::boolean INTO ativo FROM crm_configuracoes WHERE chave='sdr_relogio_ativo';
  IF ativo IS TRUE THEN PERFORM sdr_invoke(job, lote); END IF;
END $$;
REVOKE ALL ON FUNCTION sdr_tick(text, integer) FROM public, anon, authenticated;

-- Janelas (SP = UTC-3): seleção 23:30 SP (02:30 UTC); dossiê em lotes de 5 a cada
-- 10 min das 00h SP (03:00-03:59 UTC).
SELECT cron.schedule('sdr-selecao', '30 2 * * *',  $$ SELECT sdr_tick('sdr-selecao', 1) $$);
SELECT cron.schedule('sdr-dossie',  '*/10 3 * * *', $$ SELECT sdr_tick('sdr-dossie', 5) $$);
