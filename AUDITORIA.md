# AUDITORIA — Galeria Holding CRM

**Data:** 2026-10-07  
**Branch:** auditoria-completa  
**Auditado por:** Claude Code (Sonnet 4.6)

---

## a) O que o app faz (linguagem simples)

CRM de prospecção B2B outbound para o grupo Galeria Holding e suas 13 agências de comunicação/marketing. Permite que as equipes de cada agência gerenciem o relacionamento com potenciais clientes: criam oportunidades de negócio, movem entre estágios de pipeline (Wishlist → Cliente ativo), registram histórico de contatos (toques), aprovam e enviam e-mails e WhatsApps de prospecção gerados por IA, enriquecem dados de decisores via Lusha, e acompanham métricas de atividade.

---

## b) Inventário

### Telas (blocos)

| Slug nav | Componente principal | Arquivo | Descrição |
|----------|---------------------|---------|-----------|
| `hoje` | `AgenciaHome` / `HoldingHome` | block3.js | Dashboard diário por agência |
| `fila` | `FilaDoDia` | block3.js | Fila de prospecção aprovada para envio |
| `aprovar` | `AprovacaoHoje` | block3.js | Aprovação de rascunhos gerados pela IA |
| `base` | `FigurinhasV2` | block3.js + block4.js | Base de empresas + decisores |
| `holding` | `HoldingHome` | block3.js | Visão consolidada do grupo |
| `agencia` | `AgenciaHome` | block3.js | Visão por agência |
| `ferramentas` | `ModalFerramentas` | block2.js | Config, enrich, kanban estratégico |
| `pipeline` | `PipelineGlobalView` | block_pipeline.js | Pipeline CRM global ou por agência |
| `copiloto` | `CopilotoView` | block_copiloto.js + block5.js | Chatbot IA com tools sobre o banco |
| `atividade` | `AtividadeView` | block_atividade.js | Métricas de toques, execuções de cron |
| `diario` | `DiarioView` | block_diario.js | Diário de acompanhamento |
| `agenda` | `AgendaView` | block6.js | Calendário de atividades |
| `radar` | `RadarView` | block7.js | Radar de leads + enriquecimento C-level |
| `admin` | `AdminView` | block_pipeline.js | Gestão de usuários, lixeira, restauração |
| `bomdias` | `BomDiasView` | block_bomdias.js | Resumo matinal gerado por IA |
| `xp` | `XpView` | block_xp_view.js | Sistema de gamificação |
| `gaia` | `GaiaShare` | block_gaia_share.js | Compartilhamento GAIA |

### Endpoints de API (Vercel Serverless Functions)

| Endpoint | Método | Auth | Descrição |
|----------|--------|------|-----------|
| `/api/enrich` | GET/POST | JWT (alguns) | Proxy multi-provider: hunter, lusha-*, graph-*, crawl, gaia-board, whatsapp, claude, health |
| `/api/fila` | GET/POST | JWT / token-hexadecimal | Gerar fila (POST), abrir e-mail no Outlook (GET com token), credencial |
| `/api/cron` | GET/POST | Bearer CRON_SECRET | Crons: gerar-fila-diario, enriquecimento-diario, noticias-semanal, fechamento-sexta |
| `/api/copiloto` | POST | JWT no body | Chat com IA via Claude + tools sobre banco |
| `/api/crm-backup` | POST | JWT | Export CSV/JSON para Supabase Storage |

### Tabelas banco (Supabase)

| Tabela | RLS ativa | Política principal |
|--------|-----------|-------------------|
| crm_oportunidades | Sim | SELECT: auth ativo; ALL write: admin |
| crm_oportunidade_eventos | Sim | INSERT: authenticated; SELECT: auth ativo |
| crm_agencias | Sim | ALL: authenticated |
| crm_empresas | Sim | ALL: authenticated |
| crm_decisores | Sim | ALL: authenticated |
| crm_toques | Sim | ALL: authenticated |
| crm_fila | Sim | ALL: authenticated |
| crm_kanban | Sim | ALL: authenticated |
| crm_usuarios | Sim | SELECT/ALL: admin; SELECT próprio: authenticated |
| crm_auditoria | Sim | SELECT: admin; INSERT: **public** (inclui anon) |
| crm_oauth_tokens | Sim | ALL: NEGADO (somente service role) |
| crm_shared / crm_personal | Sim | ALL: authenticated |
| crm_copiloto_conversas | Sim | ALL: owner (user_id = auth.uid()) |
| crm_configuracoes | Sim | ALL: authenticated |
| crm_logs | Sim | ALL: authenticated + service_role (com override public=false) |
| crm_test_oportunidades | Sim | ALL: anon BLOQUEADO |
| crm_test_oportunidade_eventos | Sim | ALL: anon BLOQUEADO |

### Integrações externas

- **Supabase** — banco + auth + storage
- **Anthropic Claude** — geração de fila, copiloto IA
- **Lusha API v3** — enriquecimento de decisores (search + reveal)
- **Hunter.io** — enriquecimento de e-mails
- **Microsoft Graph** — rascunhos e envio de e-mail via Outlook
- **Meta WhatsApp Business** — envio de mensagens (via webhook)
- **DuckDuckGo** — fallback busca de domínio

### Perfis de usuário

| Papel | Permissões |
|-------|-----------|
| `admin` | Tudo: criar, editar, mover, apagar oportunidades; gerenciar usuários |
| `leitor` | Ler oportunidades + inserir eventos; NÃO pode escrever em crm_oportunidades |

---

## c) Jornadas de usuário para testar

1. **Login** — magic link via e-mail
2. **Fila do dia** — aprovar rascunho → enviar e-mail (Outlook deeplink) → Enviei → registra toque
3. **Criar oportunidade** — no pipeline, criar nova oportunidade com empresa + estágio
4. **Mover estágio** — drag-and-drop no kanban de pipeline (admin only)
5. **Mover agência** — dropdown no card ou botão no painel lateral (admin only)
6. **Editar oportunidade** — abrir painel lateral, editar campos, salvar (admin only)
7. **Apagar oportunidade** — soft-delete via lixeira (admin only)
8. **Restaurar oportunidade** — Admin view → Lixeira → Restaurar
9. **Enriquecer decisor** — Base de empresas → buscar decisores via Lusha
10. **Copiloto** — perguntar sobre histórico de empresa, gerar fila via confirmação
11. **Backup manual** — Admin → Exportar tudo agora
12. **Leitor tenta escrever** — deve receber erro explícito (não falso positivo)

---

## Problemas encontrados e corrigidos

### [CRÍTICO] Falso positivo em write silenciosas — `return=minimal` vs RLS

**Arquivo:** `block_pipeline.js`  
**Causa raiz:** PATCH no Supabase com `Prefer: return=minimal` retorna HTTP 204 tanto quando rows são atualizadas (sucesso real) quanto quando 0 rows são afetadas (usuário bloqueado por RLS). O código tratava `null` (resposta do 204) como sucesso incondicional.  
**Funções afetadas:** `moverAgencia`, `assumirAgencia`, `salvarEdicao`, `apagar`, `moverEstagio`  
**Fix aplicado:** Mudança para `Prefer: return=representation` + verificação `Array.isArray(res) && res.length > 0`. Falha real reverte update otimista e exibe toast/alert de erro.  
**Commits:** fix: detectar write silenciosa (return=representation em PATCHes de crm_oportunidades)

---

## Análise de segurança

### ✅ Sem exposição de service keys no frontend
Grep em todos os block*.js, gh-store.js, gh-core.js: nenhuma ocorrência de `SUPA_CRM_SERVICE_KEY`, `SUPA_AGENTE_SERVICE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`.

### ✅ RLS ativa em todas as tabelas
Todas as 40+ tabelas em `public` têm `rowsecurity=true`.

### ✅ API endpoints validam auth
- `api/cron.js`: Bearer CRON_SECRET obrigatório
- `api/enrich.js`: `verifyUserJwt()` nos endpoints sensíveis (Graph, draft, send)
- `api/copiloto.js`: JWT no body validado antes de executar tools

### ⚠️ ATENÇÃO — crm_auditoria: INSERT permitido para `anon`
A policy `service key insert auditoria` usa role `{public}` (inclui anon/unauthenticated). Qualquer requisição com apenas o SUPA_ANON (sem login) pode inserir registros falsos na tabela de auditoria. Impacto: poluição do log de auditoria; não afeta dados reais. Recomendado: mudar role para `{authenticated}`.

### ✅ `window.__supaSession` — fonte confiável
Populado exclusivamente via `supa.auth.onAuthStateChange` no gh-store.js. Não há leitura direta de `localStorage` que possa ser injetada.

### ✅ Sem JSX/transpiler → sem surface de injection via template literals
Todo o React é `createElement` direto. Sem `dangerouslySetInnerHTML`.

### ✅ `eval()` em index.html é de arquivos estáticos do mesmo origin
O `(0,eval)(code)` em index.html carrega blocos JS do mesmo domínio Vercel. Não há input de usuário nesse path.

---

## Pendências identificadas (não corrigidas nesta auditoria)

1. **crm_auditoria INSERT anon** — baixa criticidade, mas deveria restringir a `{authenticated}`.
2. **Testes Playwright com usuário `leitor`** — os testes existentes usam `playwright-test@galeria.internal` (papel leitor), que não pode testar fluxos de write em crm_oportunidades. Seria necessário um usuário admin de teste separado para cobrir esses fluxos.
3. **moverEstagio** — drag-and-drop no UI já restringe a `meuPapel === 'admin'` no frontend, mas seria melhor ter teste de integração end-to-end para confirmar o bloqueio server-side.
4. **MS_CLIENT_SECRET expira 2028-09-21** — renovar ~90 dias antes com o comando documentado em CLAUDE.md.
5. **`crm_logs` política dupla** — existe tanto `autenticado_tudo_logs` (ALL: authenticated) quanto `service_only` (ALL: false, public). A primeira sobrescreve a segunda para authenticated, mas é confuso. Considerar simplificar.

---

## Recomendações para próximos passos

1. **Criar usuário admin de teste para CI** — o usuário `playwright-test@galeria.internal` é leitor, o que impede cobrir os fluxos de write críticos no pipeline. Criar `playwright-admin-test@galeria.internal` com papel=admin e adicionar testes de `moverAgencia`, `salvarEdicao`, `moverEstagio` com verificação de resultado.

2. **Adicionar policy de INSERT autenticado em crm_auditoria** — substituir `service key insert auditoria` (role: public) por `authenticated_insert_auditoria` (role: authenticated). Isso impede inserção de registros falsos sem login.

3. **Centralizar a lógica de PATCH com detecção de 0-rows em helper** — criar função `supaUpdate(path, body, opts)` que encapsula `return=representation` + verificação + toast de erro. Evita que futuros PATCHes em crm_oportunidades repitam o mesmo padrão de verificação e caiam no mesmo bug.
