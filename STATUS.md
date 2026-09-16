# STATUS.md — Galeria Holding CRM
*Atualizado: 2026-09-16 | Branch: etapa5 → aguardando merge main*

---

## FASE A — Virada para Supabase ✅ CONCLUÍDA

| Passo | Status | Descrição |
|---|---|---|
| A1 — Auth gate | ✅ | Magic link em produção; anon removido de todas as RLS |
| A2 — Bridge localStorage↔Supabase | ✅ | gh-store.js: monkey-patch + hydrateFromSupabase |
| A3 — Roteamento tabelas reais | ✅ | gh_decisores_v3→crm_decisores, gh_blocklist_v1→crm_carteira_clientes, ghub_custom_leads→crm_empresas |
| A4 — Verificação zero perda | ✅ | 97 kanban + 2742 decisores + 2273 empresas confirmados |
| A4 — Sync dry-run + apply | ✅ | No-op — Supabase já canônico |
| 0.2 — Magic link preview | ✅ | Confirmado pelo usuário |
| 0.6 — Tag pre-etapa5 | ✅ | `git tag pre-etapa5 main` → commit 072d2b2 |
| 0.6 — Merge etapa5→main | ✅ | Merge 354b077 → fix 3d137af (gh-store.js no index.html) |
| 0.6 — Produção confirmada | ✅ | Auth gate visível em galeria-holding.vercel.app |

---

## Segurança

- `.env` gitignored, nunca commitado
- `SUPA_CRM_SERVICE_KEY` / `SUPA_AGENTE_SERVICE_KEY`: server-side only
- `SUPA_CRM_ANON_KEY`: único credential no frontend
- `backups/`: gitignored, PII local only
- Repositório: **privado**
- Histórico etapa5: limpo (PII removido com soft-reset + force-push)

---

## Supabase — Estado atual (2026-09-16T18:07)

| Tabela | Registros |
|---|---|
| crm_kanban | 97 (50 GAIA + 47 Holding) |
| crm_decisores | 2742 |
| crm_empresas | 2273 |
| crm_carteira_clientes | 25 |
| crm_shared | 0 (popula após login pós-merge) |

---

## FASE B — A implementar (branch: fase1)

| Tela | Status |
|---|---|
| B1 — Nova navegação (Holding, 13 agências, Aprovar hoje, Base, Ferramentas) | ⏳ |
| B2 — Remover tabs antigos (Bom Dia, Diário, Régua, Agente, XP, Radar, LLM box, Mailing, Blocklist) | ⏳ |
| B3 — Home por agência (Pipeline kanban, Notícias, Serviços, Cases, Credenciais, Textos, botão Enviar pipeline) | ⏳ |
| B4 — Home Holding (kanban global, métricas, feed de notícias) | ⏳ |
| B5 — Aprovar hoje (cards por canal, aprovação em lote) | ⏳ |
| B6 — Base (lista empresas + card empresa com decisores, histórico) | ⏳ |
| B7 — Documentar decisões + screenshots em docs/capturas/ | ⏳ |

---

## Fases futuras

- **FASE C** — A definir
- **FASE D** — A definir
- **FASE E** — A definir
