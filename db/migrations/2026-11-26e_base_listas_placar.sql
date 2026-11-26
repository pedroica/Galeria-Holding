-- Base organizada (2026-11-26). Aditiva.
-- 1) setor_canonico: setor numa lista única (72% da base estava como "Outros"),
--    classificado pela IA (job classificar-setores). O setor original não é tocado.
ALTER TABLE crm_empresas ADD COLUMN IF NOT EXISTS setor_canonico text;
ALTER TABLE crm_empresas ADD COLUMN IF NOT EXISTS setor_confianca text;

-- 2) Listas de empresas/contatos (blitz, território). Itens são um retrato: quem
--    estava no filtro quando a lista foi salva (dá para tirar/pôr à mão).
CREATE TABLE IF NOT EXISTS crm_listas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  apagado_em timestamptz
);
CREATE TABLE IF NOT EXISTS crm_lista_itens (
  lista_id uuid NOT NULL REFERENCES crm_listas(id),
  decisor_id uuid NOT NULL REFERENCES crm_decisores(id),
  empresa_id uuid REFERENCES crm_empresas(id),
  incluido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lista_id, decisor_id)
);
ALTER TABLE crm_listas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lista_itens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY autenticado_tudo ON crm_listas FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY autenticado_tudo ON crm_lista_itens FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Uma linha por contato, com o que os filtros precisam (lida inteira pela tela Base › Listas).
CREATE OR REPLACE VIEW crm_base_contatos_v WITH (security_invoker = true) AS
SELECT d.id AS decisor_id, d.nome, d.cargo, d.email, nullif(d.wa, '') AS wa, nullif(d.linkedin_url, '') AS linkedin_url,
       d.status AS decisor_status, coalesce(d.opt_out, false) AS opt_out, d.ultimo_toque_em, d.respondeu,
       e.id AS empresa_id, e.nome AS empresa, coalesce(e.setor_canonico, nullif(e.setor, 'Outros')) AS setor,
       e.setor AS setor_original, coalesce(e.dominio, e.website, e.site) AS site, coalesce(e.cliente_ativo, false) AS cliente_ativo,
       (SELECT max(coalesce(s.estrelas_manual, s.estrelas_calculadas)) FROM crm_empresa_agencia_estrelas s WHERE s.empresa_id = e.id AND s.apagado_em IS NULL) AS estrelas,
       (SELECT max(t.data) FROM crm_toques t WHERE t.empresa_id = e.id AND t.apagado_em IS NULL) AS empresa_ultimo_toque_em,
       EXISTS (SELECT 1 FROM crm_oportunidades o WHERE o.empresa_id = e.id AND o.apagado_em IS NULL AND o.estagio NOT IN ('Perdido', 'Pausado')) AS tem_oportunidade
  FROM crm_decisores d JOIN crm_empresas e ON e.id = d.empresa_id
 WHERE d.apagado_em IS NULL AND e.apagado_em IS NULL AND coalesce(d.status, 'ativo') NOT IN ('saiu_da_empresa', 'invalido');
GRANT SELECT ON crm_base_contatos_v TO authenticated;

-- 4) Placar de enriquecimento (uma linha).
CREATE OR REPLACE VIEW crm_placar_v WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM crm_empresas WHERE apagado_em IS NULL) AS empresas,
  (SELECT count(*) FROM crm_empresas WHERE apagado_em IS NULL AND coalesce(setor_canonico, nullif(setor, 'Outros')) IS NOT NULL AND coalesce(setor_canonico, '') <> 'Outros') AS empresas_com_setor,
  (SELECT count(*) FROM crm_empresas WHERE apagado_em IS NULL AND coalesce(dominio, website, site) IS NOT NULL) AS empresas_com_site,
  (SELECT count(*) FROM crm_empresas e WHERE e.apagado_em IS NULL AND EXISTS (SELECT 1 FROM crm_decisores d WHERE d.empresa_id = e.id AND d.apagado_em IS NULL)) AS empresas_com_contato,
  (SELECT count(*) FROM crm_decisores WHERE apagado_em IS NULL) AS contatos,
  (SELECT count(*) FROM crm_decisores WHERE apagado_em IS NULL AND nullif(email, '') IS NOT NULL) AS contatos_com_email,
  (SELECT count(*) FROM crm_decisores WHERE apagado_em IS NULL AND nullif(wa, '') IS NOT NULL) AS contatos_com_celular,
  (SELECT count(*) FROM crm_decisores WHERE apagado_em IS NULL AND nullif(linkedin_url, '') IS NOT NULL) AS contatos_com_linkedin,
  (SELECT count(*) FROM crm_decisores WHERE apagado_em IS NULL AND nullif(cargo, '') IS NOT NULL) AS contatos_com_cargo,
  (SELECT count(*) FROM crm_decisores WHERE apagado_em IS NULL AND nullif(cargo, '') IS NOT NULL AND (nullif(email, '') IS NOT NULL OR nullif(wa, '') IS NOT NULL)) AS contatos_prontos;
GRANT SELECT ON crm_placar_v TO authenticated;
