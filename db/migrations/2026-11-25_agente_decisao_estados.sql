-- Decisão comercial separada da produção e do envio (2026-11-25). Aditiva.
-- Três eixos que não se misturam:
--   produção : identificado → em pesquisa → em produção → em revisão → rascunho no Gmail (ou erro)
--   decisão  : aguardando → aprovado | rejeitado            (do Pedro; aprovar NÃO envia)
--   envio    : não enviado → enviado (confirmado | estimado) → follow-up agendado → concluído

ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS decisao text;                  -- null = aguardando; 'aprovado' | 'rejeitado'
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS decisao_em timestamptz;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS decisao_por text;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS decisao_motivo text;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS enviado_estimado boolean NOT NULL DEFAULT false;  -- data informada à mão / aproximada
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS rascunho_atualizado_em timestamptz;              -- última edição refletida no Gmail
DO $$ BEGIN
  ALTER TABLE crm_fila ADD CONSTRAINT crm_fila_decisao_check CHECK (decisao IS NULL OR decisao IN ('aprovado', 'rejeitado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Os 3 envios de 18/11 confirmados pelo Pedro como "enviei por fora" têm data aproximada.
UPDATE crm_fila SET enviado_estimado = true
 WHERE id IN ('0d9a4b0d-67f8-473d-a370-8ed0a3bf0829', '5f80386c-d057-4c34-ba60-f03a8247e0b3', '61181571-9075-43ac-a513-f69a00a8a3d7');

-- Decisão do Pedro (aprovar/rejeitar), atômica e só para usuário ativo do CRM.
-- Rejeitar: registra o motivo, encerra a cadência daquela pessoa (nenhum
-- follow-up automático) e NÃO apaga nada (nem o rascunho no Gmail).
CREATE OR REPLACE FUNCTION public.sdr_decidir(p_fila_id uuid, p_decisao text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); v_dec uuid; n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_usuarios u WHERE lower(u.email) = v_email AND coalesce(u.ativo, true)) THEN
    RAISE EXCEPTION 'usuário sem acesso ao CRM';
  END IF;
  IF p_decisao NOT IN ('aprovado', 'rejeitado', 'pendente') THEN RAISE EXCEPTION 'decisão inválida'; END IF;
  IF p_decisao = 'rejeitado' AND coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'informe o motivo da rejeição'; END IF;
  UPDATE crm_fila SET decisao = nullif(p_decisao, 'pendente'), decisao_em = now(), decisao_por = v_email,
         decisao_motivo = CASE WHEN p_decisao = 'rejeitado' THEN left(p_motivo, 500) ELSE NULL END
   WHERE id = p_fila_id AND apagado_em IS NULL
   RETURNING decisor_id INTO v_dec;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'item não encontrado'; END IF;
  IF p_decisao = 'rejeitado' AND v_dec IS NOT NULL THEN
    UPDATE crm_sdr_estado SET status = 'rejeitado', motivo = 'rejeitado pelo Pedro: ' || left(p_motivo, 300), atualizado_em = now()
     WHERE decisor_id = v_dec AND status = 'ativo' AND (fila_id = p_fila_id OR etapa = 'aguardando');
  END IF;
  INSERT INTO crm_logs (origem, nivel, mensagem, contexto)
  VALUES ('agente-decisao', 'info', 'decisão: ' || p_decisao, jsonb_build_object('fila_id', p_fila_id, 'por', v_email, 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true, 'decisao', p_decisao);
END $$;
REVOKE ALL ON FUNCTION public.sdr_decidir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_decidir(uuid, text, text) TO authenticated;

-- Fila de oportunidades do agente: uma linha por e-mail/WhatsApp produzido, com os
-- três eixos calculados no banco (fonte única para a tela e para o dashboard).
CREATE OR REPLACE VIEW public.crm_agente_oportunidades_v WITH (security_invoker = true) AS
SELECT f.id, f.canal, f.status, f.assunto, f.corpo, f.gerado_em, f.aprovado_em,
       f.outlook_message_id AS draft_id, f.outlook_draft_link AS draft_link, f.rascunho_criado_em, f.rascunho_atualizado_em,
       f.rascunho_erro, f.rascunho_tentativas, f.enviado_em, f.enviado_estimado, f.motivo_pulo,
       f.decisao, f.decisao_em, f.decisao_motivo, f.contexto_para_aprovacao AS motivo_abordagem,
       f.decisor_id, d.nome AS contato, d.cargo, d.email, d.wa,
       f.empresa_id, e.nome AS empresa, a.nome AS agencia,
       s.nota_encaixe, s.id AS estado_id,
       (SELECT min(x.data_lote) FROM crm_sdr_estado x WHERE x.decisor_id = f.decisor_id AND x.etapa = 'aguardando' AND x.status = 'ativo') AS followup_em,
       CASE
         WHEN f.canal <> 'email' THEN 'pronto_whatsapp'
         WHEN f.outlook_message_id IS NOT NULL THEN 'rascunho_gmail'
         WHEN f.rascunho_erro IS NOT NULL THEN 'erro_gmail'
         ELSE 'criando_rascunho'
       END AS estado_producao,
       coalesce(f.decisao, 'aguardando') AS estado_decisao,
       CASE
         WHEN f.status = 'respondido' THEN 'concluido'
         WHEN f.status = 'pulado' THEN 'descartado'
         WHEN f.status = 'enviado' AND EXISTS (SELECT 1 FROM crm_sdr_estado x WHERE x.decisor_id = f.decisor_id AND x.etapa = 'aguardando' AND x.status = 'ativo') THEN 'followup_agendado'
         WHEN f.status = 'enviado' THEN 'enviado'
         ELSE 'nao_enviado'
       END AS estado_envio,
       CASE WHEN coalesce(s.nota_encaixe, 0) >= 9 THEN 'alta' WHEN coalesce(s.nota_encaixe, 0) >= 7 THEN 'media' ELSE 'normal' END AS prioridade
  FROM crm_fila f
  LEFT JOIN crm_decisores d ON d.id = f.decisor_id
  LEFT JOIN crm_empresas e ON e.id = f.empresa_id
  LEFT JOIN crm_agencias a ON a.id = f.agencia_id
  LEFT JOIN LATERAL (SELECT y.id, y.nota_encaixe FROM crm_sdr_estado y WHERE y.fila_id = f.id ORDER BY y.atualizado_em DESC LIMIT 1) s ON true
 WHERE f.origem = 'sdr' AND f.apagado_em IS NULL;
GRANT SELECT ON public.crm_agente_oportunidades_v TO authenticated;
