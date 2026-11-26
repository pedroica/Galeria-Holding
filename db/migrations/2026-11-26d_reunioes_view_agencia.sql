-- crm_reunioes_v ganha a agência (slug) no fim, para a aba Metas semanais
-- dividir as reuniões por agência (2026-11-26). Aditiva: só acrescenta coluna.
-- toques guardam agencia_id como texto (uuid ou slug); oportunidades como uuid.
CREATE OR REPLACE VIEW crm_reunioes_v WITH (security_invoker = true) AS
SELECT 'toque:' || t.id::text AS id, t.empresa_id, e.nome AS empresa, NULL::uuid AS oportunidade_id,
       t.data AS marcada_em, t.reuniao_em, coalesce(nullif(t.assunto, ''), t.resumo) AS titulo, 'toque'::text AS origem,
       (SELECT a.slug FROM crm_agencias a WHERE a.id::text = t.agencia_id OR a.slug = t.agencia_id LIMIT 1) AS agencia_slug
  FROM crm_toques t LEFT JOIN crm_empresas e ON e.id = t.empresa_id
 WHERE t.apagado_em IS NULL
   AND (t.resultado IN ('reuniao', 'reuniao_marcada') OR t.reuniao_em IS NOT NULL OR t.canal = 'reuniao')
UNION ALL
SELECT 'op:' || ev.id::text, o.empresa_id, e.nome, o.id,
       ev.criado_em, NULL::timestamptz, o.titulo, 'pipeline'::text,
       (SELECT a.slug FROM crm_agencias a WHERE a.id = o.agencia_id)
  FROM crm_oportunidade_eventos ev
  JOIN crm_oportunidades o ON o.id = ev.oportunidade_id
  LEFT JOIN crm_empresas e ON e.id = o.empresa_id
 WHERE o.apagado_em IS NULL AND ev.para = 'Primeira reunião' AND ev.tipo IN ('estagio', 'criada');
GRANT SELECT ON crm_reunioes_v TO authenticated;
