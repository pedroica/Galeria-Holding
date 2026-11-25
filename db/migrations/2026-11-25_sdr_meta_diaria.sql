-- Meta diária de rascunhos + trilha de contexto + teto de gasto + vigia (2026-11-25).
-- Aditiva (nenhum DELETE). Aplicada em produção em duas etapas no mesmo dia.
-- Os valores são os mesmos padrões do código (api/cron.js configSdr); ficam no
-- banco para o Pedro poder ajustar sem deploy.

-- Etapa 1
INSERT INTO crm_configuracoes (chave, valor) VALUES
  ('sdr_meta_rascunhos_dia',        '20'::jsonb),    -- rascunhos de e-mail no Gmail por dia
  ('sdr_custo_dia_max_usd',         '5'::jsonb),     -- teto de gasto do modelo por dia (US$); 0 = sem teto
  ('sdr_sem_fato',                  'true'::jsonb),
  ('sdr_sem_fato_min_estrelas',     '3'::jsonb),
  ('sdr_nota_encaixe_min_sem_fato', '6'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- Etapa 2: a trilha "por setor e cargo" virou trilha de CONTEXTO (só segue sem
-- notícia quem tem histórico real no CRM). As chaves são renomeadas, não apagadas.
UPDATE crm_configuracoes SET chave = 'sdr_trilha_contexto' WHERE chave = 'sdr_sem_fato';
UPDATE crm_configuracoes SET chave = 'sdr_nota_encaixe_min_contexto', valor = '7'::jsonb WHERE chave = 'sdr_nota_encaixe_min_sem_fato';
UPDATE crm_configuracoes SET chave = 'obsoleto_sdr_sem_fato_min_estrelas' WHERE chave = 'sdr_sem_fato_min_estrelas';

-- Vigia da manhã (07h30 BRT, dias úteis). Usa sdr_invoke direto (não sdr_tick)
-- para avisar mesmo quando o relógio estiver desligado.
SELECT cron.schedule('sdr-vigia', '30 10 * * 1-5', $$ SELECT public.sdr_invoke('sdr-vigia', 1) $$);
