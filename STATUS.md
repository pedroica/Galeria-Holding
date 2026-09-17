# STATUS.md — Galeria Holding CRM
*Atualizado: 2026-09-17 | Branch: parte0 (em andamento)*

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

## PARTE 0 — Dados fundacionais (branch: parte0) ✅ CONCLUÍDA

| Tarefa | Status | Detalhe |
|---|---|---|
| 0.1 — Push/merge fase1 | ✅ | tag pre-fase1, merge --no-ff, push main. Produção: https://galeria-holding.vercel.app — auth gate + nav 13 agências + AgenciaHome 7 abas + HoldingHome kanban |
| 0.2 — ghub_accs investigação | ✅ | 20.536 entradas = par empresa×agência do seed (formato flat {galeria_XXXX}), idêntico a gh_decisores_v3. Já em Supabase. Zero delta. Ver VERIFICACAO_A.md |
| 0.3 — crm_agencias | ✅ | 13 agências + holding inseridas |
| 0.4 — crm_servicos | ✅ | Catálogo de serviços criado |
| 0.5 — crm_cases (C2) | ✅ | 47 cases importados de cases.js em 4 batches (2026-09-17) |
| 0.6 — crm_templates | ✅ | 224 templates (14 agências × 4 etapas × 4 canais) inseridos (2026-09-17) |

---

## FASE C — Cases, credenciais, pipeline (branch: parte0)

| Tarefa | Status | Detalhe |
|---|---|---|
| C1 — Storage buckets | ✅ | cases, credenciais, assets (public=true, 50/10MB), backups (auth, 100MB) — 4 buckets + RLS (2026-09-17) |
| C2 — Import cases | ✅ | 47 casos em crm_cases |
| C3 — Tela Cases (block3.js) | ✅ | Grade thumb, filtros (q/tipo/destaque/prospecção), player modal, quick-add URL, STAR, desativar, duplicar idioma (EN/ES) (2026-09-17) |
| C4 — Serviços screen | ✅ | AgServicosTab expandida: descricao_longa, entregaveis, sinais_de_encaixe, preco, desativar, accordion (2026-09-17) |
| C5 — Credenciais screen | ✅ | AgCredenciaisTab: 12 tipos, idioma pt/en/es, corpo markdown, dados jsonb, midia, ordem drag ▲▼, desativar (2026-09-17) |
| C6 — HTML renderer | ✅ | api/c/[token].js — Cinema P&B, páginas 16:9, teclado, touch, fullscreen (2026-09-17) |
| C7 — Credential builder | ✅ | api/gerar-credencial.js + UI no AgCredenciaisTab: selecionar blocos, gerar link token 7d (2026-09-17) |
| C8 — Pipeline sender | ✅ | AgEnviarTab: lista credenciais geradas, copy link/email/WA/LinkedIn (2026-09-17) |

---

## FASE D — Motor de prospecção (branch: fase-d) ✅ CONCLUÍDA

| Tarefa | Status | Detalhe |
|---|---|---|
| D1 — Eligibilidade crm_decisores | ✅ | Cols estrelas, etapa_cadencia, pausa_ate_em, respondeu, reuniao_marcada_em, agencia_prospectando, sinal_recente_em — migration d1_decisores_eligibility_cols (2026-09-17) |
| D2 — Score crm_empresas | ✅ | Cols estrelas, sinal_recente_em — mesma migration (2026-09-17) |
| D3 — Gerador de fila (Claude) | ✅ | api/gerar-fila.js — POST, JWT, D1 elegibilidade, D2 ordenação, gerarTexto claude-sonnet-4-6, ≤120 palavras, salva crm_fila (2026-09-17) |
| D4 — Crons automáticos | ✅ | gerar-fila-diario (6h BRT), noticias-semanal (seg 7h BRT), enriquecimento-diario (10h30 BRT) — vercel.json atualizado (2026-09-17) |
| D5 — AprovacaoHoje reescrito | ✅ | Abas Email/WhatsApp/LinkedIn, cards agência+empresa+decisor+texto, edição inline, aprovar/pular/lote, mailto rascunho, wa.me+desfazer, LinkedIn+clipboard (2026-09-17) |
| D6 — Registrar resposta/reunião | ✅ | Buttons ↩ Respondeu e 📅 Reunião: patch crm_decisores + cria/move kanban card (2026-09-17) |
| D7 — VERIFICACAO_D.md | ✅ | Schema ✅, D1/D2 lógica ✅, 5 amostras em docs/amostras/, plano runtime em VERIFICACAO_D.md §8 (aguarda push fase-d) (2026-09-17) |

---

## FASE E — Cockpit ✅ CONCLUÍDA (branch: fase-e, commit: em andamento)

| Tarefa | Status | Detalhe |
|---|---|---|
| E1 — Tela Hoje | ✅ | `TelaHoje` component — nav 'Hoje', stats (pendentes/enviados/respostas/reuniões), barra progresso dia, reuniões do dia, custo IA acumulado (2026-09-17) |
| E2 — Painel de metas semanal | ✅ | `PainelMetas` como aba 'Metas semanais' em HoldingHome — últimas 4 semanas por agência: reuniões/3, enviados, respostas, barra progresso 40/sem (2026-09-17) |
| E3 — Fechamento automático sexta 17h | ✅ | `api/cron/fechamento-sexta.js` — cron sexta 20h UTC (17h BRT): cards negociacao stale→contato, fechamento >14d→negociacao, gera relatório em crm_config (2026-09-17) |
| E4 — 5 melhorias autônomas | ✅ | M1: estrelas no card (★ de contexto_para_aprovacao); M2: botão Pausar 7d; M3: auto-refresh 60s; M4: custo USD no header; M5: keyboard nav J/K/Enter (2026-09-17) |
| E5 — README + VERIFICACAO_E.md + tag + merge | ✅ | README atualizado, VERIFICACAO_E.md criado, tag pré+pós, merge →main, push (2026-09-17) |

---

## Env vars pendentes no Vercel (ação manual do Pedro)

| Variável | Valor |
|---|---|
| `CRON_SECRET` | *(valor gerado — Pedro tem o valor; não commitar aqui)* |
| `SUPABASE_SERVICE_ROLE_KEY` | mesmo valor que `SUPA_CRM_SERVICE_KEY` |

Sem `CRON_SECRET` os crons ainda funcionam via fallback `SUPA_KEY`. Com ele, a autenticação fica mais segura.
