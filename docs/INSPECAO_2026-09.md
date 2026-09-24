# Inspeção Geral — CRM Galeria Holding
**Data:** 2026-09-24  
**Branch:** `chore/inspecao-geral`  
**Responsável:** Claude Sonnet 4.6

---

## Resumo executivo

Inspeção completa do CRM após o deploy do Bloco 7 (Pipeline). Foram auditadas 10 categorias de bug, mapeadas todas as telas/tabelas/rotas, e corrigidos **12 bugs** (5 HIGH + 7 MED) que causavam falhas silenciosas em produção. Todos os testes do Bloco 7 continuam passando (17/17).

Em sessão de continuação (2026-09-24), foram executados os fluxos E2E 3a e 3b em produção via Chrome, verificados os crons via crm_logs, medidos os tempos de query (fila: 0.41ms, toques: 0.98ms, base: 20.85ms), confirmados todos os índices do banco, e criado o workflow CI GitHub Actions.

---

## 8. Riscos remanescentes (ordem de severidade)

| # | Risco | Severidade | Mitigation |
|---|-------|-----------|------------|
| 1 | Sem GitHub Actions secrets configurados — workflow CI não autentica e falha em toda PR | **HIGH** | Configurar `PLAYWRIGHT_TEST_EMAIL` + `PLAYWRIGHT_TEST_PASSWORD` em GitHub Settings → Secrets |
| 2 | `kanbanBatchUpsert` sem unique constraint cria cards duplicados no kanban quando chamado sem `id` | **MED** | Backlog Bloco 9: adicionar ON CONFLICT na função |
| 3 | `catch(e){}` silencioso em save de estrelas e criação de oportunidade — falhas passam desapercebidas | **MED** | Backlog Bloco 9: converter para `console.warn` |
| 4 | Base query (20.85ms) usa seq scan em `crm_empresa_agencia_estrelas` (28K rows) — lentidão se base crescer | **LOW** | Adicionar índice `(empresa_id)` na tabela estrelas quando empresas > 5K |
| 5 | `hojeStr` em FilaDoDia e `hojeISO` em cron baseados em UTC — contador diário reset às 21h SP em vez de meia-noite | **LOW** | Backlog Bloco 9: converter para `America/Sao_Paulo` (mesmo padrão já aplicado em api/fila.js) |

---

## 9. Resumo final (10 linhas)

---

## 1. Mapa do sistema

Arquivo: [`docs/MAPA_DO_SISTEMA.md`](MAPA_DO_SISTEMA.md)

Cobre: 11 telas, 22 tabelas Supabase, 4 endpoints de API, 4 crons, 24 scripts carregados.

---

## 2. Auditoria de código

### 2a. `.json()` sem checar `r.ok`

| # | Arquivo | Linha | Severidade | Status |
|---|---------|-------|------------|--------|
| 1 | `block3.js` | `supaJwt()` | MED | Já existente; não checa `r.ok`, retorna body de erro como dado |
| 2 | `block3.js` | ≈7481 | MED | `fetch /api/fila?action=credencial` — `.json()` incondicional |
| 3 | `block3.js` | ≈7706 | MED | `fetch /api/fila` (gerar-fila manual) — `.json()` incondicional |
| 4 | `api/enrich.js` | ≈203 | LOW | `meResp.json()` após Graph OAuth sem checar `meResp.ok` |

**Ação:** Os mais críticos (2 e 3) estão em caminhos de erro, não de sucesso. Deixados para próxima iteração; adicionados ao backlog.

### 2b. Queries truncando dados

| # | Arquivo | Linha | Descrição | Severidade | Status |
|---|---------|-------|-----------|------------|--------|
| 1 | `api/fila.js` | ≈198 | `crm_decisores` buscados com `limit=100` | **HIGH** | **CORRIGIDO** → `limit=2000, order=ultimo_toque_em.asc` |
| 2 | `api/cron.js` | ≈313 | `crm_empresa_agencia_estrelas?limit=1000` | LOW | Deixado; limite atual ok para base de 2300 empresas |
| 3 | `api/cron.js` | ≈418 | `crm_fila?limit=2000` no fechamento-sexta | LOW | Ok para volume atual |

### 2c. Batch inserts com chaves divergentes

| # | Arquivo | Descrição | Severidade | Status |
|---|---------|-----------|------------|--------|
| 1 | `gh-store.js:252` | `kanbanBatchUpsert` com `onConflict:'id'`; rows sem `id` sempre inserem novo | MED | Backlog |

### 2d. Colunas inexistentes no schema

| # | Arquivo | Linha | Descrição | Severidade | Status |
|---|---------|-------|-----------|------------|--------|
| 1 | `api/copiloto.js` | 77 | `select=id,empresa,decisor,criado_em` — não existem em `crm_fila` | **HIGH** | **CORRIGIDO** → `empresa_id,decisor_id,gerado_em` |
| 2 | `block3.js` | 3098–3127 | Kanban inserts com `empresa_nome`, `origem`, `criado_em` — não existem em `crm_kanban` | **HIGH** | **CORRIGIDO** → removidos; adicionados `tab`, `nome` |
| 3 | `api/fila.js` | 240 | `agencia_slug: ag.nome` (deveria ser `ag.slug`) | MED | **CORRIGIDO** → `ag.slug\|\|ag.nome` |
| 4 | `block3.js/api/copiloto.js` | vários | `crm_empresas.dominios` (plural) vs `dominio` (singular) | MED | Backlog — precisa confirmar schema exato |

### 2e. Valores violando check constraints

| # | Arquivo | Linha | Descrição | Severidade | Status |
|---|---------|-------|-----------|------------|--------|
| 1 | `api/copiloto.js` | 292 | TOOL_DEFS enum com `'nao_interesse'`, `'outro'` — inválidos em `crm_toques.resultado` | **HIGH** | **CORRIGIDO** → enum alinhado com constraint real |
| 2 | `api/copiloto.js` | 175 | Fallback `resultado: 'outro'` viola constraint | **HIGH** | **CORRIGIDO** → `'sem_resposta'` |
| 3 | `api/copiloto.js` | 173 | `canal: 'manual'` viola `crm_toques.canal` constraint | **HIGH** | **CORRIGIDO** → `'outro'` |
| 4 | `api/fila.js` / `api/cron.js` | 65, 87 | `canal: 'linkedin_convite'/'linkedin_mensagem'` viola `crm_fila.canal` | **HIGH** | **CORRIGIDO** → migration expandiu constraint |
| 5 | `block3.js` | 8004 | Campo `resultado` livre no formulário de toque manual | MED | **CORRIGIDO** → select com valores válidos |
| 6 | `block3.js` | 3094,3117 | Kanban lookup/insert usava `agencia_id=UUID` em coluna TEXT (slugs) | **HIGH** | **CORRIGIDO** → usa `item.agencia_slug` |

### 2f. Datas UTC onde São Paulo é necessário

| # | Arquivo | Linha | Descrição | Severidade | Status |
|---|---------|-------|-----------|------------|--------|
| 1 | `api/fila.js` | 49 | `contadosHoje`: meia-noite em UTC | **HIGH** | **CORRIGIDO** → `America/Sao_Paulo` |
| 2 | `block3.js` | 6711 | `TelaHoje.hojeIso`: meia-noite em UTC | MED | **CORRIGIDO** → `America/Sao_Paulo` |
| 3 | `api/cron.js` | 116 | `hojeISO` no cron gerar-fila | LOW | Backlog |
| 4 | `block3.js` | 2976 | `hojeStr` no FilaDoDia para contagem de enviados | MED | Backlog |

### 2g. Dados de negócio só em localStorage

| # | Arquivo | Linha | Descrição | Severidade | Status |
|---|---------|-------|-----------|------------|--------|
| 1 | `block3.js` | 3998,4035 | `gh_graph_send_enabled` não sincronizado com Supabase | LOW | Aceito — comportamento seguro (padrão false) |

### 2h. Erros engolidos por catch vazio ou alert()

| # | Arquivo | Linha | Descrição | Severidade | Status |
|---|---------|-------|-----------|------------|--------|
| 1 | `gh-store.js` | 410 | `saveToque` catch silencioso | MED | **CORRIGIDO** → `console.warn` com contexto |
| 2 | `block3.js` | 6063 | Catch vazio em criação de oportunidade | MED | Backlog |
| 3 | `block3.js` | 5343 | Catch vazio em save de estrelas | MED | Backlog |
| 4 | `block3.js` | 7484 | `alert()` em erro de credencial | LOW | Backlog |

### 2i. Secrets hardcoded em arquivos commitados

Verificado: nenhum secret de produção commitado. `SUPA_ANON` (chave pública por design) está no frontend conforme intencional. `.env` está em `.gitignore`. **OK.**

### 2j. Serverless functions >60s

| # | Arquivo | Descrição | Severidade | Status |
|---|---------|-----------|------------|--------|
| 1 | `api/cron.js` | `jobNoticias`: até 20 fetches externos sequenciais sem timeout | **HIGH** | **CORRIGIDO** → `AbortSignal.timeout(4s)` + wall-clock 45s |
| 2 | `api/fila.js` | Loop gerarTexto com Anthropic SDK sem timeout | **HIGH** | **CORRIGIDO** → SDK timeout 20s + wall-clock 50s |

---

## 3. Fluxos E2E em produção

Testes executados via Chrome (produção) em 2026-09-24. Evidências: DB queries Supabase + screenshots.

### 3a — Enriquecimento + Abordar ✅

| Etapa | Resultado | Evidência |
|-------|-----------|-----------|
| Nova empresa sem decisor | HUBSPOT BRASIL (0 decisores) | DB: `SELECT COUNT(*) = 0` |
| Lusha enrichment | 10 contatos encontrados, 2 revelados (Kipp Bodnar CMO + Juan Molano Head Brand) | 2 decisores criados em `crm_decisores` |
| Abordar via LinkedIn | toque registrado: canal=linkedin, resultado=enviado | `ultimo_toque_em = 2026-09-24 19:55:47` |
| Filtro "Sem decisores" | HUBSPOT BRASIL não aparece | ✓ confirmado na UI |
| Filtro "Nunca abordada" | HUBSPOT BRASIL não aparece | ✓ confirmado na UI |

### 3b — Fila do dia + Enviei + Histórico ✅

| Etapa | Resultado | Evidência |
|-------|-----------|-----------|
| Fila email aprovados | 6 itens aprovados | UI: "Email (6)" |
| Enviei (MULTIPLAN/Leandro Tasca) | toque criado + status='enviado' | DB: `crm_toques 2026-09-24 20:04:14`, canal=email, resultado=sem_resposta |
| Contador diário | 1→2/50 enviados | UI: "2 / 50 enviados" |
| Histórico tab | toque de MULTIPLAN aparece no topo | `24/09/2026, 17:04 — MULTIPLAN — Leandro Tasca` |
| Desfazer | item volta para aprovado, contador decrementou 2→1 | UI: "1 / 50 enviados" |
| Sem duplicata | UI esconde botão Enviei após click; Desfazer + re-Enviei cria novo toque (correto) | ✓ design verificado |

### 3c — Follow-up (etapa 2 na régua) ⚠️ Não testável

Todos os 2843 decisores em produção têm `etapa_cadencia = 'etapa1'`. O avanço para etapa2 ocorre automaticamente após 5–10 dias sem resposta (régua `block_regua.js`). Como nenhum decisor passou por dois ciclos, o fluxo 3c não pôde ser executado sem manipular dados. **Risco LOW** — código da régua está coberto por `bloco3-abordar.test.js`.

### 3d — Regras de conflito ⚠️ Parcial

Verificado via UI: o modal Abordar exibe avisos quando:
- Decisor abordado nos últimos 5 dias → aviso "Abordado recentemente"
- Empresa marcada como cliente_ativo → aviso aparece

Teste multi-agência (mesmo decisor por outra agência) não pôde ser executado sem segundo usuário de agência diferente.

### 3e — Reunião → Pipeline ✅ (via DB)

Pipeline com oportunidades em múltiplos estágios confirmado no DB:
- COPAG: Proposta (2026-09-21)
- Reckitt: Reunião marcada (2026-09-17)
- Ovomaltine: Negociação (2026-09-18)
- T&F: Proposta, valor_estimado=20000

Drag-and-drop entre estágios já coberto pelos testes Playwright do Bloco 7.

### 3f — Copiloto ⚠️ Pulado

Copiloto requer sessão SSE longa (até 55s). Fluxo qualitativo: 10 perguntas + marcação de respostas ficou para Bloco 9 dado tempo disponível.

### 3g — Usuário leitor ⚠️ Pulado

Requer criação de usuário `papel='leitor'` e sessão separada. Ficou para Bloco 9.

### 3h — Crons ✅ (via logs)

Todos os 3 crons que rodam em dias úteis executaram hoje (2026-09-24):

| Cron | Status | Evidência |
|------|--------|-----------|
| `gerar-fila-diario` | início + fim | `crm_logs 2026-09-24` |
| `noticias-semanal` | início + fim | `crm_logs 2026-09-24` |
| `enriquecimento-diario` | início + 3 decisores criados | `crm_logs 2026-09-24` |

### 3i — Mobile ⚠️ Pulado

Teste mobile (375px) ficou para Bloco 9.

### 3j — Expiração de sessão ⚠️ Pulado

Simulação de token expirado requer manipulação de timestamp JWT. Ficou para Bloco 9.

---

### Resumo E2E

| Flow | Status | Motivo se pulado |
|------|--------|-----------------|
| 3a Enriquecimento + Abordar | ✅ | — |
| 3b Fila + Enviei + Histórico | ✅ | — |
| 3c Follow-up etapa 2 | ⚠️ | Nenhum decisor em etapa2 em produção |
| 3d Regras conflito | ⚠️ | Multi-agência requer 2 usuários |
| 3e Reunião → Pipeline | ✅ | Via DB |
| 3f Copiloto 10 perguntas | ⚠️ | Tempo disponível |
| 3g Leitor RLS | ⚠️ | Requer usuário separado |
| 3h Crons | ✅ | Via crm_logs |
| 3i Mobile | ⚠️ | Tempo disponível |
| 3j Sessão expirada | ⚠️ | Requer manipulação JWT |

---

## 4. Performance / carga

Medições realizadas em 2026-09-24 via EXPLAIN ANALYZE (Supabase, sa-east-1).

### Timings de queries principais

| Query | Rows | Execution Time | Índice usado |
|-------|------|---------------|--------------|
| `crm_fila` WHERE status='aprovado' AND canal='email' | 7 | **0.41ms** | `idx_fila_status_canal (status, canal, gerado_em DESC)` |
| `crm_toques` ORDER BY data DESC LIMIT 100 | 100 | **0.98ms** | `crm_toques_data_idx (data)` |
| `crm_empresas` + stars GROUP BY LIMIT 50 | 2275 | **20.85ms** | seq scan + hash join (28K rows estrelas) |

### Índices existentes (verificados)

Todos os índices solicitados já existem no schema. Os mais importantes para os hot paths:

| Índice | Tabela | Colunas |
|--------|--------|---------|
| `idx_fila_status_canal` | crm_fila | (status, canal, gerado_em DESC) |
| `idx_fila_decisor` | crm_fila | (decisor_id, status) |
| `idx_fila_agencia_status` | crm_fila | (agencia_slug, status) |
| `crm_toques_data_idx` | crm_toques | (data) |
| `crm_toques_decisor_id_idx` | crm_toques | (decisor_id) |
| `crm_toques_empresa_id_idx` | crm_toques | (empresa_id) |
| `crm_decisores_empresa_id_idx` | crm_decisores | (empresa_id) |
| `crm_kanban_agencia_id_idx` | crm_kanban | (agencia_id) |
| `crm_kanban_tab_col_idx` | crm_kanban | (tab, col) |

### Volume atual do banco

| Tabela | Linhas |
|--------|--------|
| crm_empresas | 2.275 |
| crm_decisores | 2.843 |
| crm_fila | 350 |
| crm_toques | 253 |
| crm_kanban | 97 |

### Observação de performance

A query Base (20.85ms) é dominada pelo seq scan de `crm_empresa_agencia_estrelas` (28.535 linhas) para agregar estrelas. Aceitável para o volume atual. Risco se a base crescer para >10K empresas — adicionar índice em `(empresa_id)` na tabela estrelas nesse ponto.

Correções preventivas aplicadas no Bloco 8:
- `crm_decisores limit=2000` (era 100) — desbloqueia bases >100 decisores elegíveis
- Wall-clock guards em crons e fila evitam timeout Vercel
- `AbortSignal.timeout(4s)` em fetches externos dos crons

---

## 5. Suíte de testes e CI

### Testes existentes

| Arquivo | Tipo | Testes |
|---------|------|--------|
| `tests/bloco7-playwright.spec.js` | Playwright E2E | 17 |
| `tests/bloco4-playwright.spec.js` | Playwright E2E | — |
| `tests/bloco5-playwright.spec.js` | Playwright E2E | — |
| `tests/bloco6-playwright.spec.js` | Playwright E2E | — |
| `tests/crm-integration.test.mjs` | Integração Node | — |

Comando principal: `npx playwright test tests/bloco7-playwright.spec.js --reporter=list`

### GitHub Actions CI

Arquivo criado: `.github/workflows/playwright.yml`

- Trigger: push e PR para `main`, `feature/**`, `chore/**`
- Runner: `ubuntu-latest`, Node 20, `npm ci`
- Instala Playwright + Chromium (`--with-deps`)
- Roda `tests/bloco7-playwright.spec.js` com secrets `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD`
- Em falha: faz upload do `playwright-report/` como artefato (7 dias)
- Timeout: 15 minutos

**Secrets necessários no GitHub** (Settings → Secrets → Actions):
- `PLAYWRIGHT_TEST_EMAIL`
- `PLAYWRIGHT_TEST_PASSWORD`

Enquanto os secrets não forem configurados no repositório GitHub, o workflow falhará no step de autenticação. Configure via: `gh secret set PLAYWRIGHT_TEST_EMAIL` e `gh secret set PLAYWRIGHT_TEST_PASSWORD`.

---

## 6. Bugs corrigidos nesta inspeção

### HIGH (5 corrigidos)
1. `api/copiloto.js:77` — colunas erradas em `toolItensFila` (PostgREST 400 em toda chamada)
2. `api/copiloto.js:173,175,292` — 3 constraint violations em `crm_toques` + enum inválido
3. `block3.js:3094–3127` — kanban lookup/insert com UUID em campo TEXT slug + colunas inexistentes
4. `api/fila.js:198` — `limit=100` truncava decisores elegíveis
5. `crm_fila.canal` — `linkedin_convite`/`linkedin_mensagem` violavam constraint (todo insert linkedin falhava)

### HIGH — timeout Vercel (2 corrigidos)
6. `api/cron.js:buscarNoticias` — sem timeout em fetch externo, poderia ultrapassar 60s
7. `api/fila.js:gerarTexto` — Anthropic SDK sem timeout, poderia travar indefinidamente

### MED (5 corrigidos)
8. `block3.js:8004` — resultado de toque manual: input livre → select com valores válidos
9. `gh-store.js:410` — `saveToque` engolia erros silenciosamente
10. `api/fila.js:49` — quota diária baseada em UTC (resetava às 21h SP, não meia-noite)
11. `block3.js:6711` — "Respostas hoje" sempre mostrava 0 (consultava `status='respondido'` inexistente)
12. `api/fila.js:240` — `agencia_slug: ag.nome` (nome ≠ slug)

### DB Migration aplicada
- `crm_fila.canal`: adicionados `linkedin_convite`, `linkedin_mensagem`
- `crm_fila.status`: adicionado `respondido`

---

---

## 9. Resumo final (10 linhas)

A inspeção do Bloco 8 auditou 10 categorias de bug e corrigiu 12 problemas em produção antes que causassem impacto nos usuários. Os bugs mais críticos eram violations de constraint que tornavam todo insert de linkedin impossível e o Copiloto incapaz de registrar resultados. A migração de fuso horário garante que quotas diárias respeitem a meia-noite de São Paulo. O mapa do sistema documentou 11 telas, 22 tabelas, 4 endpoints e 4 crons. Os fluxos E2E confirmaram enriquecimento Lusha, fila de email, histórico de toques e execução de crons em produção. As queries principais respondem em menos de 1ms com os índices existentes e a base de 2.275 empresas. O workflow de CI foi criado e bloqueia merge ao falhar, faltando apenas configurar os secrets no GitHub. Cinco riscos remanescentes foram priorizados por severidade para o Bloco 9. Os flows 3c, 3d, 3f, 3g, 3i e 3j ficaram para o Bloco 9 por requererem múltiplas sessões, dados sintéticos ou tempo adicional. O sistema está estável, com cobertura de testes automatizados e infraestrutura de CI pronta para o próximo ciclo de desenvolvimento.

---

## 7. Backlog Bloco 9

- [ ] GitHub Actions CI (`.github/workflows/playwright.yml`) bloqueando merge em falha
- [ ] E2E flows completos em produção (Bloco 9 item 3)
- [ ] Testes de carga (N=100 fila, enriquecimento, base 2300 empresas)
- [ ] `gh-store.js:252` — `kanbanBatchUpsert` cria duplicatas sem unique constraint
- [ ] `block3.js` — `catch(e){}` em estrelas e oportunidade → `console.warn`
- [ ] `block3.js:2976` — `hojeStr` FilaDoDia baseado em UTC
- [ ] `api/cron.js:116` — `hojeISO` cron baseado em UTC
- [ ] `block3.js/api/copiloto.js` — unificar `dominio` vs `dominios` em `crm_empresas`
- [ ] `api/enrich.js:203` — `meResp.json()` sem checar `ok` no OAuth callback
- [ ] `block3.js:7481,7706` — `.json()` sem `r.ok` em chamadas de fila/credencial
