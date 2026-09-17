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

## FASE B — Redesign ✅ CONCLUÍDA (branch: fase1)

| Tela | Status | Notas |
|---|---|---|
| B1 — Nova navegação (Holding, 13 agências, Aprovar hoje, Base, Ferramentas) | ✅ | 5-section topbar + sub-nav agências + sub-tabs |
| B2 — Remover tabs antigos (Bom Dia, Diário, Régua, Agente, LLM box, Mailing, Hot Pipeline, Tutorial) | ✅ | Documentado em DECISOES.md §B-001 |
| B3 — Home por agência (Pipeline, Notícias, Serviços, Cases, Credenciais, Textos, Enviar) | ✅ | Todas 7 abas funcionais com REST Supabase |
| B4 — Home Holding (kanban global, totais, filtros, drag-and-drop, metas) | ✅ | HoldingHome reescrito |
| B5 — Aprovar hoje mobile-ready | ✅ | Wrapper com overflow:auto |
| B6 — Base (EmpresasView 2342 empresas + EmpresaDrawer) | ✅ | navSection='base' → EmpresasView |
| B7 — VERIFICACAO_B.md + docs/capturas/ | ✅ | VERIFICACAO_B.md criado |
| Supabase — crm_credenciais_blocos | ✅ | Tabela criada com RLS |
| Supabase — crm_templates | ✅ | Tabela criada + 8 templates iniciais |

---

## Git — Fase B encerrada

| Passo | Status | Detalhe |
|---|---|---|
| Tag `pre-fase1` local | ✅ | commit 9ec5449 |
| `git push origin fase1` | ✅ | branch remota ok |
| `git push origin pre-fase1` | ✅ | tag no GitHub |
| `git merge --no-ff fase1` → main | ✅ | merge 4eabd49 |
| `git push origin main` | ✅ | Vercel auto-deploy disparado |

---

## Fases futuras

- **FASE C** — A definir (hints: AI em AgTextosTab; Blocklist em FerramentasModal como "Carteira")
- **FASE D** — A definir
- **FASE E** — A definir
