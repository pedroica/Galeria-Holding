-- Rotação do enriquecimento Lusha (BLOCO 4e).
-- Marca a última tentativa de enriquecimento por decisor, para o job
-- enriquecimento-diario rodar por ordem de "menos recentemente tentado"
-- em vez de reconsultar os mesmos 50 decisores todos os dias.
-- Aditiva: ADD COLUMN IF NOT EXISTS, sem DROP nem ALTER destrutivo.
ALTER TABLE crm_decisores ADD COLUMN IF NOT EXISTS enriquecimento_tentado_em timestamptz;

-- Índice parcial: só os candidatos reais do job (sem e-mail, não apagados).
CREATE INDEX IF NOT EXISTS idx_crm_decisores_enriq_tentado
  ON crm_decisores (enriquecimento_tentado_em NULLS FIRST)
  WHERE email IS NULL AND apagado_em IS NULL;
