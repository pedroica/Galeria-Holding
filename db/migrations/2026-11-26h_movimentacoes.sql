-- Movimentações de executivos (2026-11-26). Aditiva.
-- Quem assumiu como CMO / diretor(a) de marketing: imprensa todo dia, Lusha 1x/semana.
-- Cada uma vira contato na base e, com e-mail, um RASCUNHO de parabéns no Gmail
-- (nada é enviado sem o Pedro). Sem e-mail, a mensagem fica pronta para o LinkedIn.
CREATE TABLE IF NOT EXISTS crm_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,                       -- pessoa|empresa normalizados (não repete)
  pessoa text NOT NULL,
  cargo text,
  empresa text,
  cargo_anterior text,
  empresa_anterior text,
  trajetoria text,
  feitos text,
  fonte text,                                -- imprensa | lusha
  veiculo text,
  titulo text,
  url text,
  publicado_em timestamptz,
  empresa_id uuid REFERENCES crm_empresas(id),
  decisor_id uuid REFERENCES crm_decisores(id),
  fila_id uuid REFERENCES crm_fila(id),
  status text NOT NULL DEFAULT 'nova',       -- nova | rascunho | sem_email | descartada | erro
  motivo text,
  assunto text,
  mensagem_email text,
  mensagem_linkedin text,
  custo_usd numeric NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_movimentacoes_status_check CHECK (status IN ('nova', 'rascunho', 'sem_email', 'descartada', 'erro'))
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_movimentacoes_chave ON crm_movimentacoes (chave);
ALTER TABLE crm_movimentacoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_tudo ON crm_movimentacoes FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Relógios: imprensa a cada 20 min das 06h às 09h40 BRT (a 1ª passada do dia busca as
-- fontes; as seguintes processam o que ficou pendente); Lusha segunda 06h BRT.
SELECT cron.schedule('movimentacoes', '*/20 9-12 * * *', $$ SELECT public.sdr_invoke('movimentacoes', 1) $$);
SELECT cron.schedule('movimentacoes-lusha', '0 9 * * 1', $$ SELECT public.sdr_invoke('movimentacoes-lusha', 1) $$);
