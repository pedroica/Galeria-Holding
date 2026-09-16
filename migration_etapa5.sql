-- ═══════════════════════════════════════════════════════════════
-- MIGRATION ETAPA 5 — CRM Galeria Holding
-- Projeto: central-galeria (uetltlnjmobeiunxfsqi)
-- Idempotente: IF NOT EXISTS / ON CONFLICT DO NOTHING em tudo
-- Rodar no SQL Editor do Supabase → central-galeria
-- ═══════════════════════════════════════════════════════════════

-- ── 1. crm_shared — substitui ghub_sh_* do localStorage ─────────
CREATE TABLE IF NOT EXISTS crm_shared (
  key         TEXT PRIMARY KEY,
  value       JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 2. crm_personal — substitui ghub_me_* do localStorage ───────
CREATE TABLE IF NOT EXISTS crm_personal (
  user_id     TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- ── 3. crm_fila — fila de acionamentos "Aprovar hoje" ────────────
CREATE TABLE IF NOT EXISTS crm_fila (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_uuid   UUID,
  empresa_nome   TEXT NOT NULL,
  grupo_id       TEXT NOT NULL DEFAULT 'gaia',
  rank           TEXT,
  fonte          TEXT DEFAULT 'manual',
  status         TEXT DEFAULT 'pendente',
  data_sugerida  DATE DEFAULT CURRENT_DATE,
  canal          TEXT,
  decisor_nome   TEXT,
  decisor_email  TEXT,
  decisor_phone  TEXT,
  nota           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_fila_status_data
  ON crm_fila (status, data_sugerida);

-- ── 4. crm_estrelas — rating 1-5 por empresa × grupo ────────────
CREATE TABLE IF NOT EXISTS crm_estrelas (
  company_key  TEXT NOT NULL,
  empresa_uuid UUID,
  grupo_id     TEXT NOT NULL,
  estrelas     SMALLINT CHECK (estrelas BETWEEN 0 AND 5),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company_key, grupo_id)
);

-- ── 5. crm_kanban_cards — cards do pipeline GAIA e Holding ───────
--    Inclui todos os cards do KB_DEFAULT_TABS (block1.js)
CREATE TABLE IF NOT EXISTS crm_kanban_cards (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tab_id       TEXT NOT NULL,            -- 'gaia' | 'holding'
  card_ext_id  INT,                      -- id original do array JS
  nome         TEXT NOT NULL,
  produto      TEXT,
  coluna       TEXT NOT NULL,
  tag          TEXT,
  nota         TEXT,
  galeria_ref  TEXT,                     -- empresa Galeria associada
  valor        NUMERIC DEFAULT 0,
  fonte        TEXT DEFAULT 'kanban',
  empresa_uuid UUID,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tab_id, card_ext_id)
);

-- ─────────────────────────────────────────────────────────────────
-- DADOS: 35 cards GAIA (KB_DEFAULT_TABS.gaia.cards)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO crm_kanban_cards (tab_id, card_ext_id, nome, produto, coluna, tag, nota, fonte)
VALUES
  ('gaia',  1,  'CVC',              'CR.IA',     'clientes',   'mrr',      'MRR ativo',                              'kanban'),
  ('gaia',  2,  'Ella',             'CR.IA',     'clientes',   'mrr',      'MRR ativo',                              'kanban'),
  ('gaia',  3,  'Natura',           'CR.IA',     'clientes',   'camp',     'Campanhas',                              'kanban'),
  ('gaia',  4,  'McDonald''s',      'BrandSync', 'clientes',   '',         'Melhorar critérios, + franqueados, Módulo Mídia', 'kanban'),
  ('gaia',  5,  'Havaianas',        'BrandSync', 'clientes',   '',         'Próx. passos: Módulo Mídia',             'kanban'),
  ('gaia',  6,  'Gemini',           'CR.IA',     'clientes',   'camp',     'Campanha feita — Pedro fatura',          'kanban'),
  ('gaia',  7,  'OLX',              'CR.IA',     'poc',        'poc-paga', 'POC paga — modelo de serviço OK',        'kanban'),
  ('gaia',  8,  'T&F',              'BrandSync', 'poc',        '',         'Aguardando ok POC',                      'kanban'),
  ('gaia',  9,  'Trousseau',        'CR.IA',     'reuniao',    '',         'Aguardando KV',                          'kanban'),
  ('gaia', 10,  'Reckitt',          'CR.IA',     'reuniao',    '',         'Reunião agendada',                       'kanban'),
  ('gaia', 11,  'Stellantis',       'CR.IA',     'reuniao',    '',         'Reunião agendada 21/05',                 'kanban'),
  ('gaia', 12,  'Ser Educação',     'CR.IA',     'reuniao',    '',         'Reunião agendada 18/05',                 'kanban'),
  ('gaia', 13,  'Bauducco',         'BrandSync', 'reuniao',    '',         'Reunião marcada — preço',               'kanban'),
  ('gaia', 14,  'McDonald''s',      'CR.IA',     'reuniao',    '',         'Reunião Marangoni',                      'kanban'),
  ('gaia', 15,  'Crefisa + Fama',   'CR.IA',     'reuniao',    '',         'Aguardando retorno Superintendente',     'kanban'),
  ('gaia', 16,  'Unilever',         'CR.IA',     'reuniao',    '',         'A Giovanna ficou de marcar reunião com a Fernanda', 'kanban'),
  ('gaia', 17,  'All Set',          'CR.IA',     'reuniao',    '',         'Agendar um próximo papo',                'kanban'),
  ('gaia', 18,  '99 app',           'CR.IA',     'reuniao',    '',         'Reunião agendada',                       'kanban'),
  ('gaia', 19,  'Vivo',             'BrandSync', 'reuniao',    '',         'Eles ficaram de trazer internamente o que esperam da POC', 'kanban'),
  ('gaia', 20,  'Dominos',          'CR.IA',     'proposta',   'prop',     'Proposta enviada com Milà — aguardando', 'kanban'),
  ('gaia', 21,  'Accor',            'CR.IA',     'proposta',   'prop',     'Proposta enviada com Caramelo',          'kanban'),
  ('gaia', 22,  'XP Investimentos', 'CR.IA',     'aguardando', 'prop',     'Aguardando retorno proposta',            'kanban'),
  ('gaia', 23,  'MGMBet',           'CR.IA',     'aguardando', 'prop',     'Aguardando retorno proposta',            'kanban'),
  ('gaia', 24,  'Itaú',             'CR.IA',     'aguardando', '',         'Aguardando retorno',                     'kanban'),
  ('gaia', 25,  'Veste S.A.',       'CR.IA',     'aguardando', '',         'Aguardando KVs',                         'kanban'),
  ('gaia', 26,  'GM',               'CR.IA',     'aguardando', '',         'Aguardando contato Ica',                 'kanban'),
  ('gaia', 27,  'Carrefour',        'CR.IA',     'aguardando', '',         'FUP bid folheto',                        'kanban'),
  ('gaia', 28,  'Bet Nacional',     'CR.IA',     'aguardando', '',         'Ver com Losso: Globo Play ou Performance', 'kanban'),
  ('gaia', 29,  'Keta',             'CR.IA',     'aguardando', '',         'Ica tentando falar com Igor',            'kanban'),
  ('gaia', 30,  'Royal Face',       'BrandSync', 'aguardando', '',         '',                                       'kanban'),
  ('gaia', 31,  'Oralsin',          'BrandSync', 'aguardando', '',         '',                                       'kanban'),
  ('gaia', 32,  'Central Ar',       'CR.IA',     'hold',       'poc-free', 'POC free — modelo SaaS',                 'kanban'),
  ('gaia', 33,  'Wine',             'CR.IA',     'hold',       'poc-free', 'POC free — modelo SaaS',                 'kanban'),
  ('gaia', 34,  'KPI',              'CR.IA',     'hold',       '',         'Formato parceria + mostrar ferramenta designers', 'kanban'),
  ('gaia', 35,  'Globo / ANCINE',   'CR.IA',     'hold',       '',         'On hold',                                'kanban')
ON CONFLICT (tab_id, card_ext_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- DADOS: cards Holding (KB_DEFAULT_TABS.holding.cards)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO crm_kanban_cards (tab_id, card_ext_id, nome, produto, coluna, galeria_ref, nota, fonte)
VALUES
  ('holding',  1, 'Kenner',             'lead', 'wishlist',      '',          '',                     'kanban'),
  ('holding',  2, 'Cacau Show',         'lead', 'wishlist',      '',          '',                     'kanban'),
  ('holding',  3, 'Azul',               'lead', 'wishlist',      '',          '',                     'kanban'),
  ('holding',  4, 'Minerva',            'lead', 'primreuniao',   '',          'Contato: Laura',       'kanban'),
  ('holding',  5, 'Leroy Merlin',       'lead', 'primreuniao',   'Catalyst',  '',                     'kanban'),
  ('holding',  6, 'GM',                 'lead', 'contatodir',    '',          'Contato: Bruno Alonso','kanban'),
  ('holding',  7, 'Trousseau',          'lead', 'contatodir',    '',          '',                     'kanban'),
  ('holding',  8, 'L''Occitane',        'lead', 'contatodir',    '',          '',                     'kanban'),
  ('holding',  9, 'Cervejaria Império', 'lead', 'contatodir',    '',          '',                     'kanban'),
  ('holding', 10, 'Vivara',             'lead', 'contatodir',    '',          '',                     'kanban')
ON CONFLICT (tab_id, card_ext_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- VÍNCULO: crm_fila inicial — empresas "aguardando" do GAIA
--          como sugestões para acionamento hoje
-- ─────────────────────────────────────────────────────────────────
INSERT INTO crm_fila (empresa_nome, grupo_id, fonte, status, data_sugerida, canal, nota)
SELECT
  nome,
  'gaia',
  'kanban',
  'pendente',
  CURRENT_DATE,
  'email',
  nota
FROM crm_kanban_cards
WHERE tab_id = 'gaia'
  AND coluna IN ('aguardando', 'reuniao')
  AND (nota IS NULL OR nota NOT LIKE '%perdido%')
ON CONFLICT DO NOTHING;

-- ── 6. Row Level Security — permitir ao usuário autenticado ──────
ALTER TABLE crm_shared    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_personal  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_fila      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_estrelas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_kanban_cards ENABLE ROW LEVEL SECURITY;

-- crm_shared: qualquer usuário autenticado lê e escreve
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='crm_shared' AND policyname='crm_shared_auth'
  ) THEN
    CREATE POLICY crm_shared_auth ON crm_shared
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- crm_personal: usuário só acessa suas próprias linhas
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='crm_personal' AND policyname='crm_personal_own'
  ) THEN
    CREATE POLICY crm_personal_own ON crm_personal
      FOR ALL TO authenticated
      USING (user_id = auth.uid()::text)
      WITH CHECK (user_id = auth.uid()::text);
  END IF;
END $$;

-- crm_fila, crm_estrelas, crm_kanban_cards: qualquer autenticado
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='crm_fila' AND policyname='crm_fila_auth'
  ) THEN
    CREATE POLICY crm_fila_auth ON crm_fila
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='crm_estrelas' AND policyname='crm_estrelas_auth'
  ) THEN
    CREATE POLICY crm_estrelas_auth ON crm_estrelas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='crm_kanban_cards' AND policyname='crm_kanban_auth'
  ) THEN
    CREATE POLICY crm_kanban_auth ON crm_kanban_cards
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Checkpoint: o que foi criado ─────────────────────────────────
SELECT
  tablename,
  (SELECT count(*) FROM crm_kanban_cards WHERE tab_id='gaia')    AS gaia_cards,
  (SELECT count(*) FROM crm_kanban_cards WHERE tab_id='holding') AS holding_cards,
  (SELECT count(*) FROM crm_fila)                                AS fila_inicial
FROM pg_tables
WHERE tablename = 'crm_kanban_cards'
LIMIT 1;
