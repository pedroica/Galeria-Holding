-- Meta diária de rascunhos + trilha sem fato + teto de gasto (2026-11-25). Aditiva.
-- Os valores abaixo são os mesmos padrões do código (api/cron.js configSdr); ficam
-- no banco para o Pedro poder ajustar sem deploy.
INSERT INTO crm_configuracoes (chave, valor) VALUES
  ('sdr_meta_rascunhos_dia',        '20'::jsonb),    -- rascunhos de e-mail no Gmail por dia
  ('sdr_custo_dia_max_usd',         '5'::jsonb),     -- teto de gasto do modelo por dia (US$); 0 = sem teto
  ('sdr_sem_fato',                  'true'::jsonb),  -- lead sem notícia com fonte pode seguir pela trilha de setor/cargo
  ('sdr_sem_fato_min_estrelas',     '3'::jsonb),     -- encaixe mínimo da empresa com o grupo para a trilha sem fato
  ('sdr_nota_encaixe_min_sem_fato', '6'::jsonb)      -- nota mínima do estrategista na trilha sem fato
ON CONFLICT (chave) DO NOTHING;
