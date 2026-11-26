-- Ligações das tabelas do Gmail com empresas/oportunidades (2026-11-26). Aditiva.
-- Sem elas a tela Inteligência não consegue trazer o nome da empresa junto
-- (embed do PostgREST) e a seção "Status pelo Gmail" aparecia vazia.
DO $$ BEGIN
  ALTER TABLE crm_gmail_sugestoes ADD CONSTRAINT crm_gmail_sugestoes_empresa_fk FOREIGN KEY (empresa_id) REFERENCES crm_empresas(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE crm_gmail_sugestoes ADD CONSTRAINT crm_gmail_sugestoes_oportunidade_fk FOREIGN KEY (oportunidade_id) REFERENCES crm_oportunidades(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE crm_gmail_status ADD CONSTRAINT crm_gmail_status_empresa_fk FOREIGN KEY (empresa_id) REFERENCES crm_empresas(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
NOTIFY pgrst, 'reload schema';
