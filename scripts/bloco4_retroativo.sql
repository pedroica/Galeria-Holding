-- Migração retroativa Bloco 4: crm_fila enviado → crm_toques
-- Cria toques para itens da fila enviados sem toque correspondente
-- Loga contagem em crm_logs com origem='fila_retroativo'
-- Execução: única, idempotente via BEGIN/COMMIT

DO $$
DECLARE
  v_count INT := 0;
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT
      f.id AS fila_id,
      f.decisor_id,
      f.empresa_id,
      f.canal,
      f.agencia_id,
      f.etapa,
      f.template_id,
      f.corpo,
      f.assunto,
      f.contexto_para_aprovacao,
      f.enviado_em
    FROM crm_fila f
    WHERE f.status = 'enviado'
      AND f.enviado_em IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM crm_toques t
        WHERE t.decisor_id = f.decisor_id
          AND t.canal = f.canal
          AND t.data BETWEEN (f.enviado_em - INTERVAL '2 hours') AND (f.enviado_em + INTERVAL '2 hours')
          AND (t.origem IS NULL OR t.origem IN ('fila','fila_retroativo'))
      )
  LOOP
    INSERT INTO crm_toques (
      decisor_id, empresa_id, canal, agencia_id, etapa, template_id,
      texto_enviado, assunto, resumo, data, fonte, resultado, origem, criado_em, direcao
    ) VALUES (
      v_row.decisor_id,
      v_row.empresa_id,
      v_row.canal,
      v_row.agencia_id,
      v_row.etapa,
      v_row.template_id,
      LEFT(COALESCE(v_row.corpo, ''), 2000),
      LEFT(COALESCE(v_row.assunto, ''), 500),
      LEFT(COALESCE(v_row.contexto_para_aprovacao, ''), 500),
      v_row.enviado_em,
      'manual',
      'sem_resposta',
      'fila_retroativo',
      v_row.enviado_em,
      'enviado'
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO crm_logs (origem, nivel, mensagem, contexto)
  VALUES (
    'bloco4_migracao',
    'info',
    'Migração retroativa fila→toques concluída',
    jsonb_build_object('toques_criados', v_count, 'executado_em', NOW())
  );

  RAISE NOTICE 'Migração retroativa: % toques criados.', v_count;
END;
$$;
