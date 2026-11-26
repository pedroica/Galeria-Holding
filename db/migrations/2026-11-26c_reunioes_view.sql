-- Reuniões a partir de fontes reais (2026-11-26). Aditiva.
-- Antes a tela Hoje contava reuniões no crm_kanban (legado, somente leitura desde
-- 01/10), por isso marcava sempre 0. Fontes:
--   • toques de reunião (registrados à mão, pelo Outlook/diário ou pela leitura do Gmail)
--   • oportunidades que entraram em "Primeira reunião" (Pipeline ou agente do Gmail)
-- marcada_em = quando a reunião foi conseguida (conta para a meta semanal);
-- reuniao_em = quando ela acontece (lista de próximas reuniões), se conhecido.
CREATE OR REPLACE VIEW crm_reunioes_v WITH (security_invoker = true) AS
SELECT 'toque:' || t.id::text AS id, t.empresa_id, e.nome AS empresa, NULL::uuid AS oportunidade_id,
       t.data AS marcada_em, t.reuniao_em, coalesce(nullif(t.assunto, ''), t.resumo) AS titulo, 'toque'::text AS origem
  FROM crm_toques t LEFT JOIN crm_empresas e ON e.id = t.empresa_id
 WHERE t.apagado_em IS NULL
   AND (t.resultado IN ('reuniao', 'reuniao_marcada') OR t.reuniao_em IS NOT NULL OR t.canal = 'reuniao')
UNION ALL
SELECT 'op:' || ev.id::text, o.empresa_id, e.nome, o.id,
       ev.criado_em, NULL::timestamptz, o.titulo, 'pipeline'::text
  FROM crm_oportunidade_eventos ev
  JOIN crm_oportunidades o ON o.id = ev.oportunidade_id
  LEFT JOIN crm_empresas e ON e.id = o.empresa_id
 WHERE o.apagado_em IS NULL AND ev.para = 'Primeira reunião' AND ev.tipo IN ('estagio', 'criada');
GRANT SELECT ON crm_reunioes_v TO authenticated;
