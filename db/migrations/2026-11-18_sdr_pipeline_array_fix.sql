-- Corrige sdr_pipeline_tick(): `disparos || 'texto'` era lido como literal de
-- array e a função inteira falhava (malformed array literal), desfazendo também as
-- chamadas a sdr_invoke. Nenhuma etapa era disparada. Aplicada em produção 2026-11-18.
CREATE OR REPLACE FUNCTION public.sdr_pipeline_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'net'
AS $$
DECLARE
  relogio boolean; demanda timestamptz; janela boolean; estrategista boolean;
  n_sel int; n_dos int; n_est int; n_red int; n_fila int; outlook boolean;
  disparos text[] := '{}';
BEGIN
  SELECT (valor #>> '{}')::boolean INTO relogio FROM crm_configuracoes WHERE chave = 'sdr_relogio_ativo';
  SELECT nullif(valor #>> '{}', '')::timestamptz INTO demanda FROM crm_configuracoes WHERE chave = 'sdr_demanda_ate';
  SELECT coalesce((valor #>> '{}')::boolean, false) INTO estrategista FROM crm_configuracoes WHERE chave = 'sdr_estrategista';
  janela := (now() AT TIME ZONE 'UTC')::time BETWEEN time '02:35' AND time '10:00';
  IF NOT ((relogio IS TRUE AND janela) OR (demanda IS NOT NULL AND demanda > now())) THEN
    RETURN jsonb_build_object('ativo', false);
  END IF;

  SELECT count(*) FILTER (WHERE etapa = 'selecionado'), count(*) FILTER (WHERE etapa = 'dossie'),
         count(*) FILTER (WHERE etapa = 'estrategia'), count(*) FILTER (WHERE etapa = 'redigido')
    INTO n_sel, n_dos, n_est, n_red
    FROM crm_sdr_estado WHERE status = 'ativo';
  SELECT count(*) INTO n_fila FROM crm_fila
   WHERE status = 'aprovado' AND canal = 'email' AND origem = 'sdr' AND outlook_message_id IS NULL
     AND apagado_em IS NULL AND coalesce(rascunho_tentativas, 0) < 3;
  SELECT exists(SELECT 1 FROM crm_oauth_tokens WHERE refresh_token IS NOT NULL) INTO outlook;

  IF n_sel > 0 THEN PERFORM sdr_invoke('sdr-dossie', 10); disparos := array_append(disparos, 'sdr-dossie'); END IF;
  IF n_dos > 0 THEN
    IF estrategista THEN PERFORM sdr_invoke('sdr-estrategia', 6); disparos := array_append(disparos, 'sdr-estrategia');
    ELSE PERFORM sdr_invoke('sdr-redacao', 6); disparos := array_append(disparos, 'sdr-redacao'); END IF;
  END IF;
  IF estrategista AND n_est > 0 THEN PERFORM sdr_invoke('sdr-redacao', 6); disparos := array_append(disparos, 'sdr-redacao'); END IF;
  IF n_red > 0 THEN PERFORM sdr_invoke('sdr-qualidade', 8); disparos := array_append(disparos, 'sdr-qualidade'); END IF;
  IF n_fila > 0 AND outlook THEN PERFORM sdr_invoke('rascunhos-matinais', 1); disparos := array_append(disparos, 'rascunhos-matinais'); END IF;

  -- Pedido sob demanda termina sozinho quando não sobra trabalho.
  IF demanda IS NOT NULL AND n_sel + n_dos + n_est + n_red = 0 AND (n_fila = 0 OR NOT outlook) THEN
    UPDATE crm_configuracoes SET valor = 'null'::jsonb WHERE chave = 'sdr_demanda_ate';
  END IF;
  RETURN jsonb_build_object('ativo', true, 'disparos', disparos, 'selecionado', n_sel, 'dossie', n_dos, 'estrategia', n_est, 'redigido', n_red, 'fila_sem_rascunho', n_fila);
END $$;
REVOKE ALL ON FUNCTION public.sdr_pipeline_tick() FROM PUBLIC, anon, authenticated;
