-- ═══════════════════════════════════════════════════════════════
-- MIGRATION ETAPA 5 — CRM Galeria Holding (corrigida contra schema real)
-- Projeto: central-galeria (uetltlnjmobeiunxfsqi)
-- Idempotente em tudo — pode rodar múltiplas vezes sem efeito colateral
-- ─────────────────────────────────────────────────────────────────
-- O QUE EXISTE E NÃO É TOCADO:
--   crm_kanban          (79 cards, col empresa_id já existe)
--   crm_fila            (já existe com schema correto, fica vazia)
--   crm_empresa_agencia_estrelas (já existe, é a tabela real de estrelas)
--   crm_empresas        (2.202 rows, não modificado)
-- O QUE ESTE SCRIPT FAZ:
--   1. Cria crm_shared e crm_personal (novas)
--   2. Cria 32 entradas em crm_empresas para cards sem empresa_id
--   3. Vincula empresa_id nos 32 cards do crm_kanban
-- ═══════════════════════════════════════════════════════════════

-- ── 1. crm_shared — substitui ghub_sh_* do localStorage ─────────
CREATE TABLE IF NOT EXISTS crm_shared (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. crm_personal — substitui ghub_me_* do localStorage ───────
CREATE TABLE IF NOT EXISTS crm_personal (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- ── 3. RLS para as novas tabelas ─────────────────────────────────
ALTER TABLE crm_shared   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_personal ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='crm_shared' AND policyname='crm_shared_auth'
  ) THEN
    CREATE POLICY crm_shared_auth ON crm_shared
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='crm_personal' AND policyname='crm_personal_own'
  ) THEN
    CREATE POLICY crm_personal_own ON crm_personal
      FOR ALL TO authenticated
      USING  (user_id = auth.uid()::text)
      WITH CHECK (user_id = auth.uid()::text);
  END IF;
END $$;

-- ── 4. Inserir em crm_empresas os cards sem vínculo ──────────────
-- Apenas os que não existem por nome (case-insensitive)
INSERT INTO crm_empresas (nome, fonte)
SELECT DISTINCT k.nome, 'kanban'
FROM crm_kanban k
WHERE k.empresa_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_empresas e
    WHERE lower(trim(e.nome)) = lower(trim(k.nome))
  );

-- ── 5. Vincular empresa_id nos cards do crm_kanban ───────────────
UPDATE crm_kanban k
SET   empresa_id    = e.id,
      atualizado_em = now()
FROM  crm_empresas e
WHERE k.empresa_id IS NULL
  AND lower(trim(e.nome)) = lower(trim(k.nome));

-- ── Checkpoint ───────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM crm_kanban WHERE empresa_id IS NULL)  AS kanban_sem_empresa,
  (SELECT count(*) FROM crm_kanban)                           AS kanban_total,
  (SELECT count(*) FROM crm_shared)                          AS shared_rows,
  (SELECT count(*) FROM crm_personal)                        AS personal_rows;
