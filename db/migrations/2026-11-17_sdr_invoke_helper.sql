-- Ponte pg_cron -> pg_net -> /api/cron do SDR. Lê o Bearer do Vault
-- (secret 'sdr_cron_secret', criado via vault.create_secret, nunca em arquivo).
-- As janelas (pg_cron.schedule) são agendadas por bloco, conforme cada job passa
-- a existir em api/cron.js. Aplicada em produção 2026-11-17.
CREATE OR REPLACE FUNCTION sdr_invoke(job text, lote integer DEFAULT 1)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net AS $$
DECLARE segredo text; req_id bigint;
BEGIN
  SELECT decrypted_secret INTO segredo FROM vault.decrypted_secrets WHERE name='sdr_cron_secret' LIMIT 1;
  IF segredo IS NULL THEN RAISE EXCEPTION 'sdr_cron_secret ausente no Vault'; END IF;
  SELECT net.http_post(
    url := 'https://galeria-holding-sage.vercel.app/api/cron?job='||job||'&lote='||lote,
    headers := jsonb_build_object('Authorization','Bearer '||segredo,'Content-Type','application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 55000) INTO req_id;
  RETURN req_id;
END $$;
REVOKE ALL ON FUNCTION sdr_invoke(text, integer) FROM public, anon, authenticated;
