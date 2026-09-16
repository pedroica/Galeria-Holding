# STATUS.md — Galeria Holding CRM
*Atualizado automaticamente. Última revisão: 2026-09-16*

---

## FASE A — Migração para Supabase

| # | Tarefa | Status | Notas |
|---|--------|--------|-------|
| A1a | Remover auth gate (acesso direto) | ✅ DONE | `curUser` hardcoded, `sessLoading=false` — commit b72450d |
| A1b | crm_shared + crm_personal criados | ✅ DONE | Migration executada 2026-09-16 |
| A1c | empresa_id linkada em crm_kanban | ✅ DONE | 95/97 cards com empresa_id |
| A2a | kanbanLoadAll (leitura sem sessão) | ✅ DONE | gh-store.js v3 — anon SELECT policy adicionada |
| A2b | Bridge gh_hotpipeline_v1 → crm_kanban | ✅ DONE | useEffect no KanbanDiario, persist→kanbanUpsertCard |
| A2c | Bridge ghub_sh_* → crm_shared | ✅ DONE | gh-store.js já tinha sharedGet/Set |
| A2d | Bridge ghub_me_* → crm_personal | ✅ DONE | gh-store.js já tinha personalGet/Set |
| A2e | Bridge crm_decisores | ✅ DONE | gh-store.js já tinha getDecisores/saveDecisor |
| A2f | Bridge régua/blocklist → crm_configuracoes | ⏳ PENDENTE | tabela crm_configuracoes existe |
| A3 | Script sync + botão exportar | ✅ DONE | sync atualizado p/ hp_v1; botão 📤 Backup em KanbanDiario |
| A4 | Verificação e VERIFICACAO_A.md | ⏳ PENDENTE | |

## FASE B — CRM por Agência

| # | Tarefa | Status |
|---|--------|--------|
| B1 | agencia_id em crm_kanban | ⏳ PENDENTE — aguarda merge A |
| B2 | Views por agência | ⏳ PENDENTE |
| B3 | Holding como vista consolidada | ⏳ PENDENTE |
| B4 | Tracking de reuniões | ⏳ PENDENTE |

## FASE C — Conteúdo por Agência
⏳ PENDENTE — aguarda merge B

## FASE D — Motor de Prospecção IA
⏳ PENDENTE — aguarda merge C

## FASE E — Dashboard + Autonomia
⏳ PENDENTE — aguarda merge D

---

## Banco de Dados (2026-09-16)

| Tabela | Registros | Observação |
|--------|-----------|------------|
| crm_kanban | 97 | 50 gaia + 47 holding; 95 com empresa_id |
| crm_empresas | 200+ | empresa_id linkada ao kanban |
| crm_decisores | — | dados dos contatos |
| crm_toques | — | histórico de contatos |
| crm_shared | 0 | criada hoje |
| crm_personal | 0 | criada hoje |
| crm_fila | — | fila de prospecção |
| crm_configuracoes | — | régua, blocklist, alertas |

## Branch

- **Branch ativo:** `etapa5`
- **Preview:** https://galeria-holding-git-etapa5-pedroica-7790s-projects.vercel.app
- **Produção (main):** https://galeria-holding.vercel.app
- **Último commit:** b72450d (fix: acesso direto sem login)
