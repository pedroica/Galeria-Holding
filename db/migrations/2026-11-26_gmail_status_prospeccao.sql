-- O CRM se completa pelo Gmail (2026-11-26). Aditiva.

-- Status de cada empresa lido das conversas do Gmail (uma linha por empresa).
CREATE TABLE IF NOT EXISTS crm_gmail_status (
  empresa_id uuid PRIMARY KEY,
  sinal text,                       -- conversa_inicial | interesse | reuniao_marcada | ... | sem_sinal
  confianca text,
  resumo text,
  proximo_passo text,
  proximo_passo_em date,
  evidencia text,
  thread_id text,
  ultima_mensagem_em timestamptz,
  ultima_direcao text,              -- enviado | recebido
  mensagens_30d int NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_gmail_status ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_le ON crm_gmail_status FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mudanças de pipeline vindas do Gmail: aplicadas (com desfazer) ou sugeridas.
CREATE TABLE IF NOT EXISTS crm_gmail_sugestoes (
  id bigserial PRIMARY KEY,
  empresa_id uuid NOT NULL,
  oportunidade_id uuid,
  thread_id text,
  sinal text NOT NULL,
  confianca text,
  estagio_de text,
  estagio_para text,
  resumo text,
  evidencia text,
  status text NOT NULL DEFAULT 'pendente',   -- pendente | aplicada | aceita | rejeitada | desfeita
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  decidido_em timestamptz,
  decidido_por text,
  CONSTRAINT crm_gmail_sugestoes_status_check CHECK (status IN ('pendente', 'aplicada', 'aceita', 'rejeitada', 'desfeita'))
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_gmail_sugestoes_unica ON crm_gmail_sugestoes (empresa_id, thread_id, sinal);
ALTER TABLE crm_gmail_sugestoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_le ON crm_gmail_sugestoes FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Aceitar/rejeitar sugestão e desfazer atualização automática (só usuário do CRM).
-- Toda mudança de estágio grava evento em crm_oportunidade_eventos (auditoria).
CREATE OR REPLACE FUNCTION public.gmail_decidir_sugestao(p_id bigint, p_acao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); s crm_gmail_sugestoes; v_op uuid; v_atual text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_usuarios u WHERE lower(u.email) = v_email AND coalesce(u.ativo, true)) THEN RAISE EXCEPTION 'usuário sem acesso ao CRM'; END IF;
  SELECT * INTO s FROM crm_gmail_sugestoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestão não encontrada'; END IF;

  IF p_acao = 'rejeitar' AND s.status = 'pendente' THEN
    UPDATE crm_gmail_sugestoes SET status = 'rejeitada', decidido_em = now(), decidido_por = v_email WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'status', 'rejeitada');

  ELSIF p_acao = 'aceitar' AND s.status = 'pendente' THEN
    v_op := s.oportunidade_id;
    IF v_op IS NULL THEN
      INSERT INTO crm_oportunidades (empresa_id, titulo, estagio, origem, proximo_passo)
      SELECT s.empresa_id, coalesce(e.nome, 'Empresa') || ': conversa no Gmail', s.estagio_para, 'abordagem_direta', left(s.resumo, 300)
        FROM crm_empresas e WHERE e.id = s.empresa_id RETURNING id INTO v_op;
      INSERT INTO crm_oportunidade_eventos (oportunidade_id, tipo, para, texto, autor_email)
      VALUES (v_op, 'criada', s.estagio_para, 'Gmail (aceito pelo Pedro): ' || left(s.resumo, 300), v_email);
    ELSE
      SELECT estagio INTO v_atual FROM crm_oportunidades WHERE id = v_op;
      UPDATE crm_oportunidades SET estagio = s.estagio_para, atualizado_em = now(),
             fechada_em = CASE WHEN s.estagio_para IN ('Cliente ativo', 'Perdido') THEN now() ELSE fechada_em END
       WHERE id = v_op;
      INSERT INTO crm_oportunidade_eventos (oportunidade_id, tipo, de, para, texto, autor_email)
      VALUES (v_op, 'estagio', v_atual, s.estagio_para, 'Gmail (aceito pelo Pedro): ' || left(s.resumo, 300), v_email);
    END IF;
    UPDATE crm_gmail_sugestoes SET status = 'aceita', oportunidade_id = v_op, decidido_em = now(), decidido_por = v_email WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'status', 'aceita', 'oportunidade_id', v_op);

  ELSIF p_acao = 'desfazer' AND s.status = 'aplicada' AND s.oportunidade_id IS NOT NULL THEN
    SELECT estagio INTO v_atual FROM crm_oportunidades WHERE id = s.oportunidade_id;
    IF s.estagio_de IS NULL THEN
      UPDATE crm_oportunidades SET apagado_em = now() WHERE id = s.oportunidade_id;   -- foi criada pelo agente: vai para a lixeira
      INSERT INTO crm_oportunidade_eventos (oportunidade_id, tipo, de, texto, autor_email)
      VALUES (s.oportunidade_id, 'nota', v_atual, 'Desfeito pelo Pedro: oportunidade aberta pelo Gmail foi para a lixeira', v_email);
    ELSE
      UPDATE crm_oportunidades SET estagio = s.estagio_de, atualizado_em = now() WHERE id = s.oportunidade_id;
      INSERT INTO crm_oportunidade_eventos (oportunidade_id, tipo, de, para, texto, autor_email)
      VALUES (s.oportunidade_id, 'estagio', v_atual, s.estagio_de, 'Desfeito pelo Pedro (atualização automática do Gmail)', v_email);
    END IF;
    UPDATE crm_gmail_sugestoes SET status = 'desfeita', decidido_em = now(), decidido_por = v_email WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'status', 'desfeita');
  END IF;
  RAISE EXCEPTION 'ação % não vale para sugestão em %', p_acao, s.status;
END $$;
REVOKE ALL ON FUNCTION public.gmail_decidir_sugestao(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gmail_decidir_sugestao(bigint, text) TO authenticated;

-- Relógio: a cada 15 min, das 07h às 22h BRT, todos os dias (só leitura do Gmail).
SELECT cron.schedule('gmail-crm', '*/15 10-23,0-1 * * *', $$ SELECT public.sdr_invoke('gmail-crm', 1) $$);
