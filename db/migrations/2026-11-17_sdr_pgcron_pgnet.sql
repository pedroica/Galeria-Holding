-- Relógio do SDR: habilita pg_net e pg_cron (pg_cron dispara pg_net chamando
-- /api/cron em lotes pequenos). Aplicada em produção 2026-11-17.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
