-- Fase 3 do SDR: estrategista, modo rascunho e pipeline único. Aditiva.
-- Aplicada em produção 2026-11-18.
--
-- Reverter: cron.unschedule('sdr-pipeline') e reagendar sdr-dossie/sdr-redacao/
-- sdr-qualidade como estavam (ver 2026-11-17_sdr_relogio_janelas.sql);
-- update crm_configuracoes set valor='false' where chave in ('sdr_estrategista','sdr_modo_rascunho').
-- As colunas novas podem ficar (não são lidas com as chaves desligadas).

-- 1) Colunas
ALTER TABLE crm_sdr_estado ADD COLUMN IF NOT EXISTS tese jsonb;
ALTER TABLE crm_sdr_estado ADD COLUMN IF NOT EXISTS nota_encaixe int;
ALTER TABLE crm_sdr_estado ADD COLUMN IF NOT EXISTS refacoes int NOT NULL DEFAULT 0;
ALTER TABLE crm_fila       ADD COLUMN IF NOT EXISTS origem text;

-- 2) Configuração (não sobrescreve valor já existente)
INSERT INTO crm_configuracoes (chave, valor) VALUES
  ('sdr_estrategista',       'true'::jsonb),
  ('sdr_modelo_estrategia',  '"claude-opus-5-5"'::jsonb),
  ('sdr_modelo_redacao',     '"claude-opus-5-5"'::jsonb),
  ('sdr_modelo_qc',          '"claude-opus-5-5"'::jsonb),
  ('sdr_nota_encaixe_min',   '8'::jsonb),
  ('sdr_refacoes_max',       '1'::jsonb),
  ('sdr_mix_whatsapp',       '0.5'::jsonb),
  ('sdr_modo_rascunho',      'false'::jsonb),
  ('sdr_demanda_ate',        'null'::jsonb),
  ('sdr_oferta_blitz',       to_jsonb('Blitz de planejamento estratégico: 30 minutos para olhar o negócio de fora e sair com 2 ou 3 oportunidades concretas. Planejar comunicação não é só comprar mídia: é achar novas oportunidades, melhorar a fala do time comercial e o material de venda, achar margem em produtos complementares e aproveitar melhor o CRM.'::text))
ON CONFLICT (chave) DO NOTHING;

-- 3) Pipeline: a cada 3 minutos, dispara cada etapa que tem trabalho (etapas
-- diferentes mexem em linhas diferentes, então podem rodar juntas). Roda de
-- madrugada com o relógio ligado (02:30 a 10:00 UTC = 23:30 a 07:00 BRT) ou a
-- qualquer hora quando o Pedro aperta "Preparar rascunhos agora". Nenhuma etapa
-- envia nada: o envio continua com sdr-envio (Piloto) ou com o Pedro.
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

  IF n_sel > 0 THEN PERFORM sdr_invoke('sdr-dossie', 10); disparos := disparos || 'sdr-dossie'; END IF;
  IF n_dos > 0 THEN
    IF estrategista THEN PERFORM sdr_invoke('sdr-estrategia', 6); disparos := disparos || 'sdr-estrategia';
    ELSE PERFORM sdr_invoke('sdr-redacao', 6); disparos := disparos || 'sdr-redacao'; END IF;
  END IF;
  IF estrategista AND n_est > 0 THEN PERFORM sdr_invoke('sdr-redacao', 6); disparos := disparos || 'sdr-redacao'; END IF;
  IF n_red > 0 THEN PERFORM sdr_invoke('sdr-qualidade', 8); disparos := disparos || 'sdr-qualidade'; END IF;
  IF n_fila > 0 AND outlook THEN PERFORM sdr_invoke('rascunhos-matinais', 1); disparos := disparos || 'rascunhos-matinais'; END IF;

  -- Pedido sob demanda termina sozinho quando não sobra trabalho.
  IF demanda IS NOT NULL AND n_sel + n_dos + n_est + n_red = 0 AND (n_fila = 0 OR NOT outlook) THEN
    UPDATE crm_configuracoes SET valor = 'null'::jsonb WHERE chave = 'sdr_demanda_ate';
  END IF;
  RETURN jsonb_build_object('ativo', true, 'disparos', disparos, 'selecionado', n_sel, 'dossie', n_dos, 'estrategia', n_est, 'redigido', n_red, 'fila_sem_rascunho', n_fila);
END $$;
REVOKE ALL ON FUNCTION public.sdr_pipeline_tick() FROM PUBLIC, anon, authenticated;

-- 4) Botão "Preparar rascunhos agora" (tela SDR). Só usuário ativo do CRM.
-- Seleciona o lote de hoje (quem já está no fluxo não entra de novo) e liga o
-- pipeline por 45 minutos. Não envia nada.
CREATE OR REPLACE FUNCTION public.sdr_preparar_agora()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'net'
AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); demanda timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_usuarios u WHERE lower(u.email) = v_email AND coalesce(u.ativo, true)) THEN
    RAISE EXCEPTION 'usuário sem acesso ao CRM';
  END IF;
  SELECT nullif(valor #>> '{}', '')::timestamptz INTO demanda FROM crm_configuracoes WHERE chave = 'sdr_demanda_ate';
  IF demanda IS NOT NULL AND demanda > now() THEN
    RETURN jsonb_build_object('ok', true, 'ja_em_andamento', true, 'ate', demanda);
  END IF;
  UPDATE crm_configuracoes SET valor = to_jsonb((now() + interval '45 minutes')::text) WHERE chave = 'sdr_demanda_ate';
  PERFORM sdr_invoke('sdr-selecao', 1);
  INSERT INTO crm_logs (origem, nivel, mensagem, contexto)
  VALUES ('sdr-preparar-agora', 'info', 'Preparar rascunhos agora', jsonb_build_object('por', v_email));
  RETURN jsonb_build_object('ok', true, 'ate', now() + interval '45 minutes');
END $$;
REVOKE ALL ON FUNCTION public.sdr_preparar_agora() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_preparar_agora() TO authenticated;

-- 5) Agenda: o pipeline substitui os três crons de etapa (que disparavam em
-- horários fixos e paravam no meio quando a etapa anterior atrasava).
SELECT cron.unschedule('sdr-dossie')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sdr-dossie');
SELECT cron.unschedule('sdr-redacao')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sdr-redacao');
SELECT cron.unschedule('sdr-qualidade') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sdr-qualidade');
SELECT cron.schedule('sdr-pipeline', '*/3 * * * *', $$select public.sdr_pipeline_tick()$$);
