-- Fase 2: score de oportunidade, sincronização Gmail (History API) e aprendizado
-- comercial. Aditiva: nenhum DROP/DELETE. Dados existentes preservados.

-- 1) Score explicável por lead (0-100) e solução mais aderente.
ALTER TABLE crm_sdr_estado ADD COLUMN IF NOT EXISTS score int;
ALTER TABLE crm_sdr_estado ADD COLUMN IF NOT EXISTS score_detalhe jsonb;
ALTER TABLE crm_sdr_estado ADD COLUMN IF NOT EXISTS solucao text;

-- 2) Fila: versão original do agente, mensagem enviada e datas real x estimada.
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS assunto_original text;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS corpo_original text;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS gmail_message_id text;       -- id da mensagem ENVIADA (confirmada pela API)
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS enviado_real_em timestamptz;  -- só a API do Gmail preenche
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS enviado_estimado_em timestamptz; -- informado à mão, sem confirmação
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS enviado_obs text;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS editado_no_gmail_em timestamptz;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS solucao text;
UPDATE crm_fila SET assunto_original = assunto WHERE assunto_original IS NULL AND origem = 'sdr';
UPDATE crm_fila SET corpo_original = corpo WHERE corpo_original IS NULL AND origem = 'sdr';
UPDATE crm_fila SET enviado_estimado_em = enviado_em, enviado_obs = coalesce(enviado_obs, 'informado pelo Pedro (data aproximada)')
 WHERE enviado_estimado AND enviado_em IS NOT NULL AND enviado_estimado_em IS NULL;
UPDATE crm_fila SET enviado_estimado_em = enviado_em, enviado_obs = coalesce(enviado_obs, 'registrado antes da sincronização Gmail (sem confirmação da API)')
 WHERE origem = 'sdr' AND NOT enviado_estimado AND enviado_em IS NOT NULL AND enviado_real_em IS NULL AND enviado_estimado_em IS NULL;

-- 3) Eventos do Gmail (auditoria + deduplicação: o mesmo evento nunca é aplicado 2x).
CREATE TABLE IF NOT EXISTS crm_gmail_eventos (
  id bigserial PRIMARY KEY,
  gmail_id text NOT NULL,              -- id da mensagem/rascunho no Gmail
  tipo text NOT NULL,                  -- enviado | rascunho_editado | rascunho_apagado | duplicado | sem_associacao
  fila_id uuid,
  thread_id text,
  detalhe jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gmail_id, tipo)
);
ALTER TABLE crm_gmail_eventos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_le ON crm_gmail_eventos FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Aprendizado: cada decisão/edição/envio do Pedro vira um evento estruturado.
CREATE TABLE IF NOT EXISTS crm_aprendizado_eventos (
  id bigserial PRIMARY KEY,
  fila_id uuid,
  decisor_id uuid,
  empresa_id uuid,
  tipo text NOT NULL,                  -- aprovado | rejeitado | editado | enviado_sem_alteracao | enviado_com_alteracao
  motivo text,
  original jsonb,                      -- {assunto, corpo} gerado pelo agente
  final jsonb,                         -- {assunto, corpo} depois do Pedro
  diff jsonb,                          -- métricas e categorias da mudança
  contexto jsonb,                      -- setor, solução, cargo, alavanca (para agrupar)
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_aprendizado_eventos_tipo ON crm_aprendizado_eventos (tipo, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS crm_aprendizado_eventos_envio_unico ON crm_aprendizado_eventos (fila_id, tipo) WHERE tipo IN ('enviado_sem_alteracao', 'enviado_com_alteracao');
ALTER TABLE crm_aprendizado_eventos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_tudo ON crm_aprendizado_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Memória comercial. Só 'ativo' entra nos prompts. O que o agente deduz nasce
-- 'proposto' e só vale depois que o Pedro ativa: nada muda em silêncio.
CREATE TABLE IF NOT EXISTS crm_memoria_comercial (
  id bigserial PRIMARY KEY,
  tipo text NOT NULL,                  -- preferencia | argumento_funciona | argumento_nao_funciona | case_por_segmento | restricao | aprendizado | perfil
  texto text NOT NULL,
  escopo jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {setor, solucao, cargo} (vazio = vale para tudo)
  evidencias int NOT NULL DEFAULT 0,
  evidencia_detalhe jsonb,
  fonte text NOT NULL DEFAULT 'manual',        -- manual | aprendizado
  status text NOT NULL DEFAULT 'proposto',     -- proposto | ativo | desativado | descartado
  chave text UNIQUE,                           -- para o job não propor a mesma coisa 2x
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por text,
  CONSTRAINT crm_memoria_status_check CHECK (status IN ('proposto', 'ativo', 'desativado', 'descartado'))
);
ALTER TABLE crm_memoria_comercial ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_tudo ON crm_memoria_comercial FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- As preferências que o Pedro já deu (fonte manual, ativas desde já).
INSERT INTO crm_memoria_comercial (tipo, texto, fonte, status, chave, evidencias) VALUES
 ('preferencia', 'Abordar só com oportunidade real (notícia com fonte ou histórico no CRM); 20 oportunidades valem mais que 20 mensagens.', 'manual', 'ativo', 'manual:oportunidade-real', 0),
 ('preferencia', 'Tom executivo, conversa direta e natural; nada com cara de automação ou de IA, sem exageros nem excesso de adjetivos.', 'manual', 'ativo', 'manual:tom', 0),
 ('restricao', 'Nunca inventar fato, número, case ou detalhe de conversa; inferência não é apresentada como fato.', 'manual', 'ativo', 'manual:nao-inventar', 0)
ON CONFLICT (chave) DO NOTHING;

-- 6) Decisão do Pedro também vira evento de aprendizado.
CREATE OR REPLACE FUNCTION public.sdr_decidir(p_fila_id uuid, p_decisao text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); v_dec uuid; v_emp uuid; v_sol text; n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_usuarios u WHERE lower(u.email) = v_email AND coalesce(u.ativo, true)) THEN
    RAISE EXCEPTION 'usuário sem acesso ao CRM';
  END IF;
  IF p_decisao NOT IN ('aprovado', 'rejeitado', 'pendente') THEN RAISE EXCEPTION 'decisão inválida'; END IF;
  IF p_decisao = 'rejeitado' AND coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'informe o motivo da rejeição'; END IF;
  UPDATE crm_fila SET decisao = nullif(p_decisao, 'pendente'), decisao_em = now(), decisao_por = v_email,
         decisao_motivo = CASE WHEN p_decisao = 'rejeitado' THEN left(p_motivo, 500) ELSE NULL END
   WHERE id = p_fila_id AND apagado_em IS NULL
   RETURNING decisor_id, empresa_id, solucao INTO v_dec, v_emp, v_sol;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'item não encontrado'; END IF;
  IF p_decisao = 'rejeitado' AND v_dec IS NOT NULL THEN
    UPDATE crm_sdr_estado SET status = 'rejeitado', motivo = 'rejeitado pelo Pedro: ' || left(p_motivo, 300), atualizado_em = now()
     WHERE decisor_id = v_dec AND status = 'ativo' AND (fila_id = p_fila_id OR etapa = 'aguardando');
  END IF;
  IF p_decisao IN ('aprovado', 'rejeitado') THEN
    INSERT INTO crm_aprendizado_eventos (fila_id, decisor_id, empresa_id, tipo, motivo, contexto)
    SELECT p_fila_id, v_dec, v_emp, p_decisao, p_motivo,
           jsonb_build_object('solucao', v_sol, 'setor', coalesce(e.setor, e.setor_sugerido), 'cargo', d.cargo)
      FROM crm_decisores d LEFT JOIN crm_empresas e ON e.id = v_emp WHERE d.id = v_dec;
  END IF;
  INSERT INTO crm_logs (origem, nivel, mensagem, contexto)
  VALUES ('agente-decisao', 'info', 'decisão: ' || p_decisao, jsonb_build_object('fila_id', p_fila_id, 'por', v_email, 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true, 'decisao', p_decisao);
END $$;
REVOKE ALL ON FUNCTION public.sdr_decidir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_decidir(uuid, text, text) TO authenticated;

-- 7) View da fila com score, solução e as duas datas de envio.
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
       CASE WHEN coalesce(s.score, 0) >= 75 OR coalesce(s.nota_encaixe, 0) >= 9 THEN 'alta'
            WHEN coalesce(s.score, 0) >= 55 OR coalesce(s.nota_encaixe, 0) >= 7 THEN 'media' ELSE 'normal' END AS prioridade,
       s.score, s.score_detalhe, coalesce(f.solucao, s.solucao) AS solucao,
       f.enviado_real_em, f.enviado_estimado_em, f.enviado_obs, f.gmail_message_id, f.editado_no_gmail_em,
       f.assunto_original, f.corpo_original
  FROM crm_fila f
  LEFT JOIN crm_decisores d ON d.id = f.decisor_id
  LEFT JOIN crm_empresas e ON e.id = f.empresa_id
  LEFT JOIN crm_agencias a ON a.id = f.agencia_id
  LEFT JOIN LATERAL (SELECT y.id, y.nota_encaixe, y.score, y.score_detalhe, y.solucao FROM crm_sdr_estado y WHERE y.fila_id = f.id ORDER BY y.atualizado_em DESC LIMIT 1) s ON true
 WHERE f.origem = 'sdr' AND f.apagado_em IS NULL;
GRANT SELECT ON public.crm_agente_oportunidades_v TO authenticated;

-- 8) Desempenho por combinação (setor x solução x nível do cargo x alavanca).
-- Só contagens: a tela decide se há amostra suficiente e avisa que é correlação.
CREATE OR REPLACE VIEW public.crm_agente_desempenho_v WITH (security_invoker = true) AS
SELECT coalesce(e.setor, e.setor_sugerido, 'sem setor') AS setor,
       coalesce(f.solucao, s.solucao, 'não definida') AS solucao,
       CASE WHEN d.cargo ~* '(ceo|cmo|cco|cfo|coo|presiden|founder|fundador|s[óo]ci|chief|c-level)' THEN 'c-level'
            WHEN d.cargo ~* '(diretor|director|vp|vice)' THEN 'diretoria'
            WHEN d.cargo ~* '(head|gerente|manager|coordenador|lead)' THEN 'gestão' ELSE 'outros' END AS nivel_cargo,
       coalesce(s.tese ->> 'alavanca', 'sem tese') AS alavanca,
       count(*) AS enviados,
       count(*) FILTER (WHERE f.status = 'respondido' OR r.n > 0) AS respostas,
       count(*) FILTER (WHERE r.positivas > 0) AS respostas_positivas,
       count(*) FILTER (WHERE r.negativas > 0) AS respostas_negativas,
       count(*) FILTER (WHERE op.n > 0) AS oportunidades,
       count(*) FILTER (WHERE op.reunioes > 0) AS reunioes,
       avg(EXTRACT(epoch FROM (r.primeira - f.enviado_em)) / 3600.0) FILTER (WHERE r.primeira IS NOT NULL) AS horas_ate_resposta
  FROM crm_fila f
  LEFT JOIN crm_decisores d ON d.id = f.decisor_id
  LEFT JOIN crm_empresas e ON e.id = f.empresa_id
  LEFT JOIN LATERAL (SELECT y.solucao, y.tese FROM crm_sdr_estado y WHERE y.fila_id = f.id ORDER BY y.atualizado_em DESC LIMIT 1) s ON true
  LEFT JOIN LATERAL (SELECT count(*) n, count(*) FILTER (WHERE x.tipo IN ('interesse', 'indicacao')) positivas,
                            count(*) FILTER (WHERE x.tipo IN ('opt_out', 'nao_agora')) negativas, min(x.recebido_em) primeira
                       FROM crm_sdr_respostas x WHERE x.decisor_id = f.decisor_id AND x.recebido_em >= f.enviado_em AND x.tipo NOT IN ('auto_resposta', 'bounce')) r ON true
  LEFT JOIN LATERAL (SELECT count(*) n, count(*) FILTER (WHERE o.estagio NOT IN ('Wishlist', 'Contato direto', 'Perdido')) reunioes
                       FROM crm_oportunidades o WHERE o.empresa_id = f.empresa_id AND o.apagado_em IS NULL AND o.criado_em >= f.enviado_em) op ON true
 WHERE f.origem = 'sdr' AND f.canal = 'email' AND f.status IN ('enviado', 'respondido') AND f.apagado_em IS NULL
 GROUP BY 1, 2, 3, 4;
GRANT SELECT ON public.crm_agente_desempenho_v TO authenticated;

-- 9) "Recalcular aprendizados" na tela (mesmo job do relógio diário) e o relógio.
CREATE OR REPLACE FUNCTION public.sdr_recalcular_aprendizado()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault', 'net' AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_usuarios u WHERE lower(u.email) = v_email AND coalesce(u.ativo, true)) THEN
    RAISE EXCEPTION 'usuário sem acesso ao CRM';
  END IF;
  PERFORM sdr_invoke('sdr-aprendizado', 1);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.sdr_recalcular_aprendizado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sdr_recalcular_aprendizado() TO authenticated;
SELECT cron.schedule('sdr-aprendizado', '0 9 * * *', $$ SELECT public.sdr_invoke('sdr-aprendizado', 1) $$);
