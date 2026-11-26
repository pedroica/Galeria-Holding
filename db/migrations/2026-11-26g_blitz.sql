-- Blitz (2026-11-26). Aditiva.
-- Uma blitz = uma lista + um tema + quem assina. A IA escreve e-mail e WhatsApp por
-- contato (job blitz-redacao) e põe na crm_fila como rascunho (origem 'blitz').
-- Nada é enviado sem o Pedro: aprovar → rascunho no Gmail → "Enviar e-mails" / WhatsApp em sequência.
CREATE TABLE IF NOT EXISTS crm_blitz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id uuid REFERENCES crm_listas(id),
  nome text NOT NULL,
  tema text NOT NULL,
  agencia_id uuid REFERENCES crm_agencias(id),
  canais text[] NOT NULL DEFAULT ARRAY['email', 'whatsapp'],
  status text NOT NULL DEFAULT 'escrevendo',   -- escrevendo | pronta | erro
  total int NOT NULL DEFAULT 0,
  escritos int NOT NULL DEFAULT 0,
  pulados int NOT NULL DEFAULT 0,
  custo_usd numeric NOT NULL DEFAULT 0,
  erro text,
  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  apagado_em timestamptz,
  CONSTRAINT crm_blitz_status_check CHECK (status IN ('escrevendo', 'pronta', 'erro'))
);
ALTER TABLE crm_blitz ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_tudo ON crm_blitz FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE crm_fila ADD COLUMN IF NOT EXISTS blitz_id uuid REFERENCES crm_blitz(id);
CREATE INDEX IF NOT EXISTS crm_fila_blitz_idx ON crm_fila (blitz_id) WHERE blitz_id IS NOT NULL;
-- Uma mensagem por contato e canal em cada blitz (duas execuções simultâneas não duplicam).
CREATE UNIQUE INDEX IF NOT EXISTS crm_fila_blitz_unica ON crm_fila (blitz_id, decisor_id, canal) WHERE blitz_id IS NOT NULL;
-- Trava de execução: só um job escreve por vez em cada blitz.
ALTER TABLE crm_blitz ADD COLUMN IF NOT EXISTS lease_ate timestamptz;

-- Começar uma blitz (só usuário do CRM). Dispara a escrita na hora; o relógio continua.
CREATE OR REPLACE FUNCTION public.blitz_iniciar(p_lista uuid, p_nome text, p_tema text, p_agencia uuid, p_canais text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault', 'net' AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); v_id uuid; v_total int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_usuarios u WHERE lower(u.email) = v_email AND coalesce(u.ativo, true)) THEN RAISE EXCEPTION 'usuário sem acesso ao CRM'; END IF;
  IF coalesce(trim(p_tema), '') = '' THEN RAISE EXCEPTION 'escreva o tema da blitz'; END IF;
  IF p_canais IS NULL OR NOT (p_canais <@ ARRAY['email', 'whatsapp']) OR cardinality(p_canais) = 0 THEN RAISE EXCEPTION 'canais inválidos'; END IF;
  SELECT count(*) INTO v_total FROM crm_lista_itens WHERE lista_id = p_lista;
  IF v_total = 0 THEN RAISE EXCEPTION 'lista vazia'; END IF;
  INSERT INTO crm_blitz (lista_id, nome, tema, agencia_id, canais, total, criado_por)
  VALUES (p_lista, left(coalesce(nullif(trim(p_nome), ''), 'Blitz'), 120), left(p_tema, 2000), p_agencia, p_canais, v_total, v_email)
  RETURNING id INTO v_id;
  PERFORM sdr_invoke('blitz-redacao', 1);
  INSERT INTO crm_logs (origem, nivel, mensagem, contexto) VALUES ('blitz', 'info', 'blitz iniciada', jsonb_build_object('blitz_id', v_id, 'total', v_total, 'por', v_email));
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'total', v_total);
END $$;
REVOKE ALL ON FUNCTION public.blitz_iniciar(uuid, text, text, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blitz_iniciar(uuid, text, text, uuid, text[]) TO authenticated;

-- Depois de aprovar: cria os rascunhos no Gmail agora (só cria; enviar é outro clique).
CREATE OR REPLACE FUNCTION public.blitz_criar_rascunhos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault', 'net' AS $$
DECLARE v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_usuarios u WHERE lower(u.email) = v_email AND coalesce(u.ativo, true)) THEN RAISE EXCEPTION 'usuário sem acesso ao CRM'; END IF;
  PERFORM sdr_invoke('rascunhos-matinais', 1);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.blitz_criar_rascunhos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blitz_criar_rascunhos() TO authenticated;

-- Relógio: a cada minuto, só se houver blitz escrevendo.
SELECT cron.schedule('blitz-redacao', '* * * * *', $$ SELECT public.sdr_invoke('blitz-redacao', 1) WHERE EXISTS (SELECT 1 FROM crm_blitz WHERE status = 'escrevendo' AND apagado_em IS NULL) $$);
