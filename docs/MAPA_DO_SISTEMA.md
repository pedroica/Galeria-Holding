# Mapa do Sistema — CRM Galeria Holding

**Produção:** https://galeria-holding-sage.vercel.app  
**Supabase:** `uetltlnjmobeiunxfsqi` (central-galeria, sa-east-1)  
**Stack:** React 18 UMD (sem build) + Supabase Postgres + Vercel Serverless Functions  
**Gerado em:** 2026-09-24

---

## 1. Telas e navegação

Definida em `block3.js` ≈ linha 5654. Cada item `[slug, label]` aparece na topbar.

| Slug | Label | Componente | Acesso |
|------|-------|------------|--------|
| `hoje` | Hoje | `TelaHoje` | todos |
| `holding` | Holding | `HoldingHome` | todos |
| `agencia` | Agências | `AgenciaHome` | todos |
| `aprovar` | Aprovar | `AprovacaoHoje` | todos |
| `fila` | Fila | `FilaDoDia` | todos |
| `base` | Base | `EmpresasView` (block4.js) | todos |
| `templates` | Templates | `TemplatesView` | todos |
| `copiloto` | Copiloto | `CopiloView` (block_copiloto.js) | todos |
| `atividade` | Atividade | `AtividadeView` (block_atividade.js) | todos |
| `pipeline` | Pipeline | `PipelineGlobalView` (block_pipeline.js) | todos |
| `admin` | Admin | `AdminView` (block_pipeline.js) | `meuPapel === 'admin'` |
| `ferramentas` | Ferramentas | `FerramentasModal` (modal) | todos |

### 1.1 `hoje` — TelaHoje (`block3.js:6704`)

Dashboard diário. Queries paralelas ao montar:
- `crm_fila?status=eq.rascunho` → pendentes + custo IA
- `crm_fila?status=in.(aprovado,enviado)&enviado_em=gte.hoje` → enviados hoje
- `crm_toques?data=gte.hoje&resultado=in.(respondeu,resposta,reuniao_marcada)` → respostas hoje
- `crm_kanban?col=eq.reuniao&atualizado_em=gte.hoje` → reuniões hoje
- `crm_kanban` (todos) → reuniões da semana
- `crm_relatorios?tipo=eq.semanal&order=gerado_em.desc&limit=1` → último relatório

### 1.2 `holding` — HoldingHome (`block3.js:6906`)

Kanban consolidado. Colunas fixas: `1º Contato | Reunião | Proposta | Negociação | Fechamento`.  
Sub-tabs: `pipeline` | `metas`.  
Leitura: `crm_kanban?select=*&order=ordem.asc`.

### 1.3 `agencia` — AgenciaHome (`block3.js:7789`)

Sub-tabs por agência:

| Tab | Componente | Escrita |
|-----|------------|---------|
| `pipeline` | `KanbanView` (block1.js) | `crm_kanban` |
| `noticias` | `AgNoticiasTab` | — |
| `servicos` | `AgServicosTab` | — |
| `cases` | `AgCasesTab` | — |
| `credenciais` | `AgCredenciaisTab` | `crm_credenciais_geradas` |
| `textos` | `AgTextosTab` | `crm_templates` |
| `enviar` | `AgEnviarTab` | → POST /api/fila |

### 1.4 `aprovar` — AprovacaoHoje (`block3.js:2918`)

Fila de rascunhos. Aprovação individual/em lote, descarte, edição inline.  
Auto-refresh a cada 60s. Atalhos: J/K navegar, Enter aprovar.

### 1.5 `fila` — FilaDoDia (`block3.js:3455`)

Fila de itens aprovados. Tabs: Email | WhatsApp | LinkedIn | Histórico.  
Ações: Abrir no Outlook → Enviado → INSERT `crm_toques` + PATCH `crm_decisores.ultimo_toque_em`.  
Atalhos: ↑/↓ navegar, O abrir, E enviado, P pular.

### 1.6 `base` — EmpresasView (`block4.js:174`)

Lista de empresas com sidebar + painel de detalhes. Sub-tabs: Visão Geral, Figurinhas, Kanban, Atividade, Toques, Enriquecimento.  
Modal Abordar (`block2.js:401`): Email/WhatsApp/LinkedIn.  
Modal Enriquecimento: Lusha V3 por domínio.

### 1.7 `copiloto` — CopiloView (`block_copiloto.js:156`)

Chat IA com streaming SSE → `POST /api/copiloto`.  
Ferramentas de leitura: `buscar_empresa`, `listar_decisores`, `historico_toques`, `itens_fila`, `contadores_semana`, `listar_templates`, `noticias_empresa`, `listar_oportunidades`.  
Ferramentas de ação (requerem confirmação): `gerar_fila`, `registrar_resultado`, `abordar`, `criar_oportunidade`, `mover_estagio`, `atribuir_dono`.

### 1.8 `pipeline` — PipelineGlobalView (`block_pipeline.js`)

Kanban de oportunidades. Drag-and-drop entre estágios → UPDATE `crm_oportunidades.estagio` + INSERT `crm_oportunidade_eventos`.  
Estágios: Prospect | Reunião marcada | Reunião feita | Briefing | Proposta | Negociação | Ganho | Perdido | Pausado.

### 1.9 `admin` — AdminView (`block_pipeline.js`, role-gated)

Gerenciamento de usuários (`crm_usuarios`) e configurações (`crm_configuracoes`). Visível somente para `papel='admin'`.

---

## 2. Tabelas Supabase

Todas têm RLS `autenticado_tudo` (ALL para `authenticated`), exceto `crm_oauth_tokens` (negar_tudo).

| Tabela | Descrição | Colunas-chave |
|--------|-----------|---------------|
| `crm_agencias` | Agências do grupo | `id uuid`, `nome`, `slug`, `color` |
| `crm_cases` | Cases de sucesso por agência | `id`, `agencia_id`, `titulo`, `url_pagina`, `ativo`, `permitido_em_prospeccao` |
| `crm_configuracoes` | Config global chave/valor | `chave pk`, `valor` · chaves: `email_daily_max`, `whatsapp_daily_max`, `enriquecimento_diario_max` |
| `crm_copiloto_conversas` | Histórico do Copiloto | `id`, `user_id`, `titulo`, `mensagens jsonb` |
| `crm_credenciais_blocos` | Blocos de apresentação | `tipo` ∈ capa, numeros, case, fechamento, livre |
| `crm_credenciais_geradas` | Credenciais HTML | `token unique`, `empresa_id`, `agencia_ids jsonb`, `html_url` |
| `crm_decisores` | Contatos | `id`, `empresa_id`, `nome`, `cargo`, `email`, `email_valido`, `wa`, `linkedin_url`, `status`, `ultimo_toque_em`, `temperatura`, `etapa_cadencia`, `agencia_prospectando` |
| `crm_empresa_agencia_estrelas` | Score fit empresa×agência | PK `(empresa_id, agencia_id)`, `estrelas_manual`, `estrelas_calculadas` |
| `crm_empresas` | Empresas | `id`, `nome unique`, `setor`, `dominio`, `website`, `tier`, `cliente_ativo`, `agencia_atendendo` |
| `crm_fila` | Fila de prospecção | `id`, `decisor_id`, `empresa_id`, `canal` ∈ email/whatsapp/linkedin/linkedin_convite/linkedin_mensagem, `status` ∈ rascunho/aprovado/enviado/pulado/erro/respondido, `agencia_id uuid`, `agencia_slug text`, `etapa_cadencia`, `template_id`, `gerado_em` |
| `crm_kanban` | Cards pipeline agências | `id serial`, `tab text` (slug), `col text`, `nome`, `empresa_id uuid`, `agencia_id text` (slug) |
| `crm_logs` | Logs de crons e Copiloto | `origem`, `nivel`, `mensagem`, `contexto jsonb`, `custo_usd` |
| `crm_noticias` | Notícias indexadas por empresa | `empresa_id`, `titulo`, `url`, `fonte`, `data` |
| `crm_oauth_tokens` | Tokens OAuth Microsoft Graph | RLS negar_tudo; somente service key |
| `crm_oportunidade_eventos` | Audit trail do pipeline | `oportunidade_id`, `tipo` ∈ criada/estagio/dono/pedido_atualizacao, `de`, `para`, `texto`, `autor_email` |
| `crm_oportunidades` | Funil comercial | `id`, `empresa_id`, `agencia_id uuid`, `estagio`, `oferta`, `valor_estimado`, `origem` ∈ abordagem_direta/fila/indicação/inbound/upsell |
| `crm_personal` | Preferências pessoais | PK `(user_id, key)`, `value jsonb` |
| `crm_relatorios` | Relatórios semanais | `tipo='semanal'`, `semana_inicio date`, `dados jsonb`, `token unique` |
| `crm_servicos` | Portfólio de serviços | por agência |
| `crm_shared` | Bridge localStorage↔Supabase | PK `key`, `value jsonb` |
| `crm_templates` | Templates de prospecção | `canal` ∈ email/whatsapp/linkedin_convite/linkedin_mensagem, `etapa`, `ativo` |
| `crm_toques` | Histórico de contatos | `canal` ∈ email/whatsapp/linkedin/ligacao/reuniao/outro, `direcao` ∈ enviado/recebido, `resultado` ∈ sem_resposta/respondeu/bounce/visualizado/reuniao/enviado/atendeu/caixa_postal/nao_atendeu/reuniao_marcada/resposta, `fonte` ∈ sistema/outlook/manual/sh_activities/regua/diario |
| `crm_usuarios` | Usuários do CRM | `email`, `nome`, `papel` ∈ admin/editor/leitor, `ativo` |

---

## 3. Rotas de API

### `api/enrich.js` — Proxy unificado

| Provider | Método | O que faz |
|----------|--------|-----------|
| `hunter` (mode=domain/verify) | GET | Proxy Hunter.io |
| `lusha-domain` | POST | Descobre domínio via Lusha V3 + DuckDuckGo; persiste `crm_empresas.website` |
| `lusha-search` | GET | Lusha V3 prospecting (sem reveal) |
| `lusha-reveal` | POST | Lusha V3 reveal email+telefone (gasta créditos) |
| `graph-init` | POST | PKCE OAuth Microsoft; armazena state em `crm_oauth_tokens` |
| `graph-status` | GET | `{connected, email}` |
| `graph-disconnect` | POST | Limpa tokens |
| `graph-draft` | POST | Cria rascunho no Outlook; persiste IDs em `crm_fila` |
| `graph-send` | POST | Envia rascunho; INSERT `crm_toques`; PATCH `crm_decisores` |
| `graph-sync` | POST | Verifica isDraft; marca enviados |
| `claude` | POST | Proxy Anthropic `/v1/messages` |
| `crawl` | GET | Scraping website + BrasilAPI QSA; retorna decisores |
| `gaia-board` | GET/POST | Vercel KV (board GAIA) |
| `health` | GET | Status das APIs |

### `api/fila.js` — Geração de fila e credenciais

| Método | Parâmetros | O que faz |
|--------|------------|-----------|
| GET | `?token=<hex>` | Renderiza credencial HTML |
| POST | `{agencia_slug?, canais, limite, sem_ia}` | Gera rascunhos; usa Claude se `sem_ia=false`; limites diários via `contadosHoje()` |
| POST | `?action=credencial` | Cria `crm_credenciais_geradas` |

Limites por canal: `email=50, whatsapp=80, linkedin_convite=20, linkedin_mensagem=20`

### `api/copiloto.js` — Copiloto IA

| Método | Body | O que faz |
|--------|------|-----------|
| POST | `{jwt, conversaId?, mensagem, confirmarAcao?}` | SSE streaming; tool use claude-sonnet-4-6; salva `crm_copiloto_conversas`; loga custo |

Max duration: 55s.

### `api/cron.js` — Jobs agendados

| Job | Cron (UTC) | BRT | O que faz |
|-----|-----------|-----|-----------|
| `gerar-fila-diario` | `30 9 * * 1-5` | 6:30 Seg-Sex | Gera rascunhos via `/api/fila`; pula se ≥30 rascunhos |
| `enriquecimento-diario` | `0 9 * * *` | 6:00 diário | Lusha V3 reveal para decisores sem email; teto `enriquecimento_diario_max` (padrão 10); wall-clock 45s |
| `noticias-semanal` | `30 8 * * 1-5` | 5:30 Seg-Sex | Google News RSS para até 20 empresas com ≥3 estrelas; AbortSignal.timeout(4s) por fetch; wall-clock 45s |
| `fechamento-sexta` | `0 20 * * 5` | 17:00 Sex | Relatório semanal: toques, reuniões, top5 empresas, oportunidades; upsert `crm_relatorios` |

---

## 4. Scripts carregados (`index.html`)

Fase 1 — loadScript sequencial:
1. `gh-store.js` — supa client, auth, helpers crm_fila/kanban/toques, bridge localStorage↔Supabase
2. `gh-core.js` — proxy fetch (Claude/Hunter/Lusha), chaves locais, verificação WA
3. `gaia-share-core.js` — compartilhamento GAIA (cifração, KV)
4. `block0_util.js` — utilitários (scorecard, Claude helpers)
5. `templates_agencias.js` — `AGENCY_TEMPLATES` por agência/setor
6. `block_regua.js` — régua de cadência, slots, prioridade, enriquecimento Lusha
7. `block_xp.js` — engine de gamificação XP

Fase 2 — eval sequencial:
8. `block1.js` — KanbanView, EnrichAgent, EmailModal, AddCompanyModal
9. `block2.js` — Login, ConfigModal, AbordagemModal, TemplatesView
10. `block_copiloto.js` → `window.CopiloView`
11. `block_atividade.js` → `window.AtividadeView`, `window.checkCronAlertFromLogs`
12. `block_pipeline.js` → `window.PipelineGlobalView`, `window.AdminView`
13. `block3.js` — **App shell principal**, todos os nav items e telas
14. `block6.js` — FerramentasModal, OutboundView
15. `block7.js` — RadarTab, enriquecimento C-level
16. `block4.js` — EmpresasView (versão principal)
17. `block5.js` — KanbanEstrategico, FunilComercial, PortfolioExecutivo
18. `block_regua_views.js`, `block_bomdias.js`, `block_xp_view.js`, `block_diario.js`
19. `block_blocklist.js` → `window.GH_BL`
20. `block_agente.js` → `window.AgenteView`

---

## 5. Variáveis de ambiente Vercel

| Variável | Usado em | Notas |
|----------|----------|-------|
| `SUPA_CRM_URL` / `SUPA_CRM_ANON_KEY` | api/* | também hardcoded no frontend como `SUPA_ANON` |
| `SUPA_CRM_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | api/* server-side | nunca no frontend |
| `ANTHROPIC_API_KEY` | api/copiloto.js, api/fila.js | — |
| `LUSHA_API_KEY` / `LUSHA_KEY` | api/enrich.js, api/cron.js | — |
| `HUNTER_KEY` | api/enrich.js | — |
| `CRON_SECRET` | api/cron.js | auth Bearer de todos os crons |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` | api/enrich.js | Graph OAuth; secret expira 2028-09-21 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | api/enrich.js (gaia-board) | Vercel KV |
| `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` | tests/ | — |
