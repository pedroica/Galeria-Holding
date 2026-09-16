# VERIFICACAO_A.md — Fase A concluída
*Gerado em: 2026-09-16*

---

## Checklist Supabase

| Item | Esperado | Real | Status |
|------|----------|------|--------|
| crm_kanban total | 97 | 97 | ✅ |
| crm_kanban gaia | 50 | 50 | ✅ |
| crm_kanban holding | 47 | 47 | ✅ |
| crm_kanban com empresa_id | ≥95 | 95 | ✅ |
| crm_shared (tabela existe) | — | 0 rows (vazia, OK) | ✅ |
| crm_personal (tabela existe) | — | 0 rows (vazia, OK) | ✅ |
| anon SELECT policy crm_kanban | ativa | ativa | ✅ |
| anon SELECT policy crm_empresas | ativa | ativa | ✅ |

## Breakdown crm_kanban por etapa

| Tab | Contato | Reunião | Proposta | Negoc. | Fechamento | Total |
|-----|---------|---------|----------|--------|------------|-------|
| gaia | 13 | 9 | 15 | 5 | 8 | **50** |
| holding | 20 | 10 | 5 | 9 | 3 | **47** |
| **Total** | 33 | 19 | 20 | 14 | 11 | **97** |

## Checklist código (branch etapa5, commit 7f6a196)

| Item | Status |
|------|--------|
| Auth gate removido (acesso direto) | ✅ commit b72450d |
| gh-store.js v3 com kanbanLoadAll (anon read) | ✅ commit 7f6a196 |
| KanbanDiario carrega do Supabase na montagem | ✅ commit 7f6a196 |
| persist() sincroniza writes para Supabase | ✅ commit 7f6a196 |
| Botão "📤 Backup" exporta localStorage | ✅ commit 7f6a196 |
| DECISOES.md com mapeamento de tabelas | ✅ commit 7f6a196 |
| STATUS.md com progresso por fase | ✅ commit 7f6a196 |
| scripts/sync_localstorage_to_supabase.js atualizado | ✅ commit 7f6a196 |

## Preview URL

https://galeria-holding-git-etapa5-pedroica-7790s-projects.vercel.app

Comportamento esperado no preview:
1. Abre direto sem tela de login
2. Navegar para "📊 Kanban Diário" → aba GAIA mostra 50 empresas, Holding 47
3. Dados carregados do Supabase (não do localStorage local)
4. Botão "📤 Backup" baixa JSON com todo o localStorage

## Pendente (A2f — opcional antes do merge)

- Bridge régua/blocklist → crm_configuracoes: os campos `gh_regua_v1` e `gh_blocklist_v1` ainda leem do localStorage. Impacto: baixo (não são dados de pipeline, são configs de régua de contato que podem ser re-configuradas). **Decisão: avançar para merge e resolver na Fase B junto com agencia_id.**

## Decisão de merge

**Aguardando aprovação de Pedro para:**
1. Confirmar que preview funciona OK no browser
2. Fazer export final do localStorage de produção (botão "📤 Backup" na produção)
3. Dar "OK merge etapa5 → main"
