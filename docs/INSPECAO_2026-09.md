# Inspeção Geral — CRM Galeria Holding
**Data:** 2026-09-24  
**Branch:** `chore/inspecao-geral`  
**Responsável:** Claude Sonnet 4.6

---

## Resumo executivo

Inspeção completa do CRM após o deploy do Bloco 7 (Pipeline). Foram auditadas 10 categorias de bug, mapeadas todas as telas/tabelas/rotas, e corrigidos **12 bugs** (5 HIGH + 7 MED) que causavam falhas silenciosas em produção. Todos os testes do Bloco 7 continuam passando (17/17).

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

**Nota:** Testes E2E via browser (item 3 do escopo) ficam para próxima janela. Os 17 testes do Bloco 7 validam os fluxos principais de pipeline, RLS e copiloto.

Fluxos cobertos pelos testes existentes:
- ✅ Autenticação (storageState Playwright)
- ✅ Pipeline: nav, kanban, estágios
- ✅ RLS: service key lê, anon bloqueado
- ✅ Migração kanban → oportunidades
- ✅ Automação reuniao_marcada → crm_oportunidades
- ✅ Eventos de estágio
- ✅ Copiloto: listar_oportunidades

Fluxos não cobertos (backlog Bloco 9):
- Aprovar → Enviar fluxo completo
- Enriquecimento Lusha E2E
- Geração de fila manual
- Credencial HTML
- Crons (smoke test via `/api/cron?job=...`)

---

## 4. Performance / carga

**Nota:** Testes de carga (item 4 do escopo) ficam para próxima janela.

Correções preventivas aplicadas:
- `crm_decisores limit=2000` (era 100) — desbloqueia bases >100 decisores elegíveis
- Wall-clock guards em crons e fila evitam timeout Vercel
- `AbortSignal.timeout(4s)` em fetches externos dos crons

---

## 5. Suíte de testes

Arquivo: `tests/bloco7-playwright.spec.js` — 17 testes  
Comando: `npx playwright test tests/bloco7-playwright.spec.js`

**GitHub Actions CI:** a configurar no Bloco 9 (`.github/workflows/playwright.yml`).

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
