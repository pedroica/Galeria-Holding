# CLAUDE.md — Galeria Holding CRM

## Projeto
CRM de prospecção outbound para o grupo Galeria Holding e suas agências.  
**Produção:** https://galeria-holding-sage.vercel.app  
**Repositório:** https://github.com/pedroica/Galeria-Holding  
**Supabase:** `uetltlnjmobeiunxfsqi` (central-galeria, sa-east-1)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + React 18 (UMD, sem build step) — `index.html` carrega os blocks via `(0,eval)()` |
| Estilos | CSS inline + classes globais definidas em `index.html` |
| Banco | Supabase Postgres + RLS; acesso via REST (`fetch` autenticado) |
| API | Vercel Serverless Functions em `/api/*.js` (ES modules, `export default`) |
| Deploy | Vercel Hobby — máximo **12 serverless functions** |

---

## Arquitetura de arquivos

```
index.html          — entry point; carrega scripts em sequência via eval
gh-store.js         — camada Supabase: supa client, auth, helpers crm_fila/kanban
gh-core.js          — proxy fetch (Anthropic/Hunter/Lusha), chaves locais, WA verify
block0_util.js      — utilitários compartilhados (scorecard, Claude helpers)
block1.js           — Kanban (crm_kanban) + componentes de agenda/pipeline
block2.js           — Login, configurações, modal Ferramentas
block3.js           — Tela principal: Empresas (FigurinhasV2), AprovacaoHoje,
                      FilaDoDia, AgenciaHome, OutboundView, TemperaturaView
block4.js           — Dashboard, Notícias, Relatórios
block5.js           — Kanban estratégico (KES)
block6.js           — Calendário / Agenda
block7.js           — Radar de leads + enriquecimento C-level
block_agente.js     — Agente autônomo de prospecção
api/enrich.js       — Proxy: Hunter, Lusha (person + empresa), health check
api/gerar-fila.js   — Gera lote crm_fila (rascunho)
api/cron/           — Crons diários/semanais
```

### Como os scripts são carregados
`index.html` usa `(0,eval)(code)` para cada block: o código roda no escopo global. Não há Babel/transpiler — escreva JavaScript moderno mas **sem JSX**. Use `React.createElement(...)` diretamente.

Hooks disponíveis em block3.js: `const { useState, useMemo, useEffect, useCallback } = React;` está no topo do arquivo; todos os componentes abaixo podem usá-los.

---

## Navegação principal (block3.js ≈ linha 3998)

```javascript
[['hoje','Hoje'],['holding','Holding'],['agencia','Agências'],
 ['aprovar','Aprovar'],['fila','Fila'],['base','Base'],['ferramentas','Ferramentas']]
```

Cada item `[slug, label]` aparece na topbar. Para adicionar uma tela nova:
1. Adicionar o par ao array acima
2. Adicionar o caso `navSection === 'slug' ? React.createElement(MinhaView, null) :` na chain de views (≈ linha 4033)
3. Escrever o componente React no bloco correto

---

## Tabelas principais (Supabase)

| Tabela | Uso |
|---|---|
| `crm_fila` | Fila de prospecção. Status: `rascunho → aprovado → enviado\|pulado\|erro` |
| `crm_decisores` | Contatos (nome, cargo, email, wa, linkedin_url, ultimo_toque_em) |
| `crm_empresas` | Empresas (nome, setor, dominio, site) — `estrelas` não usar, está zerado |
| `crm_empresa_agencia_estrelas` | `max(coalesce(estrelas_manual, estrelas_calculadas))` por empresa_id |
| `crm_toques` | Histórico de toques (direcao, canal, assunto, resumo, data, fonte, resultado) |
| `crm_kanban` | Cards por pipeline de agência |
| `crm_shared` | localStorage partilhado (key/value JSONB) |
| `crm_configuracoes` | Config global (chave/valor) — `email_daily_max`, `whatsapp_daily_max` |

Todas têm RLS `autenticado_tudo` (ALL para `authenticated`). Use sempre a sessão JWT de `window.__supaSession.access_token`.

### Credenciais frontend
```javascript
const SUPA_URL  = 'https://uetltlnjmobeiunxfsqi.supabase.co';  // OK no frontend
const SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r'; // anon key, pública por design
```
Server-side secrets ficam **somente** em variáveis de ambiente Vercel.

---

## Autonomia operacional

Pedro não é técnico e não quer ser acionado para buscar chaves, variáveis, links ou clicar em dashboards. Claude Code tem autorização permanente para: obter e gravar credenciais no `.env` local (`vercel env pull`, criar chaves no Supabase pelo Chrome, ler variáveis do projeto); criar, editar e apagar variáveis de ambiente na Vercel; fazer redeploy; rodar crons pelo botão Run; consultar e alterar o banco pelo MCP do Supabase; navegar nos dashboards da Vercel e do Supabase pelo Chrome. Nunca mostrar o valor de uma credencial no chat. Só acionar Pedro para decisão de negócio ou quando um bloqueio de segurança da própria ferramenta impedir a ação, e nesse caso dizer em uma linha o que foi bloqueado e a alternativa.

Cada merge na main está autorizado assim que os testes reais passarem (saída colada) — não parar para pedir aprovação.

---

## Regras de segurança (não negociáveis)

1. **Nunca apague dados** — UPDATE/INSERT sempre. DELETE só em cleanup de testes, confirmado explicitamente.
2. **Migrações só aditivas** — `ADD COLUMN IF NOT EXISTS`, nunca DROP/ALTER TYPE destrutivo.
3. **Nunca envie e-mails automaticamente** — a tela Fila do dia abre o Outlook; quem clica é o usuário.
4. **SUPA_CRM_SERVICE_KEY / SUPA_AGENTE_SERVICE_KEY** — server-side only, nunca no frontend.
5. **SUPA_ANON** — único credential Supabase permitido no frontend.
6. **LUSHA_KEY / HUNTER_KEY / ANTHROPIC_API_KEY** — variáveis de ambiente Vercel only.
7. `.env` é gitignored. Nunca escrever valor de secret em arquivo, commit, STATUS.md ou relatório.

---

## Convenções de código

- **Sem JSX** — React.createElement direto, igual ao resto do codebase.
- **Sem build** — nenhum npm run build; o deploy é o próprio source.
- **Branch por feature** — `feature/nome-da-feature`. Merge na main só com ok do usuário, exceto telas autônomas explicitamente aprovadas.
- **Commit a cada alteração** testada; push ao mesmo tempo.
- **Commits de docs/correções pequenas** → podem ir direto na main.
- Fontes: `'IBM Plex Mono',monospace` para texto funcional, `'Syne',sans-serif` para títulos.
- Paleta dark: fundo `#060606`, card `#0d0d1a` / `#1A1A2E`, border `#1A1A2E` / `#2D2D44`.
- Accent: `#FF6B2B` (orange), `#60A5FA` (blue), `#34D399` (green), `#818CF8` (purple), `#FBBF24` (stars).

---

## Lusha API V3 — Enriquecimento de Decisores

**Base URL:** `https://api.lusha.com/v3/` · Auth: header `api_key: LUSHA_KEY`

| Provider (enrich.js) | Rota Lusha | Método | Billing |
|---|---|---|---|
| `lusha-search` | `/v3/contacts/prospecting` | POST | api_search por resultado |
| `lusha-reveal` | `/v3/contacts/enrich` | POST | revealEmail + revealPhone por contato |

### lusha-domain — body da requisição (POST)
```json
{ "company": "Avon", "empresaId": "uuid-da-empresa" }
```
Fluxo: (a) companies/prospecting por nome → (b) variações .com.br/.com → (c) DuckDuckGo  
Grava `website` em `crm_empresas` via service key. Retorna `{domain, source}` ou `{found: false}`.

### lusha-search — body da requisição
```json
{
  "filters": {
    "contacts": {
      "include": {
        "seniority": [9,10,8,6],
        "departments": ["Marketing","General Management"]
      }
    },
    "companies": { "include": { "domains": ["ambev.com.br"] } }
  },
  "pagination": { "page": 0, "size": 10 }
}
```
Seniority numérico: 9=c-suite · 10=founder · 8=vice-president · 6=director  
Departments: strings, descobertos via `GET /v3/contacts/prospecting/filters/departments`  
Retorna até 10 contatos COM cargo (enrich base sem reveal = grátis), ordenados por senioridade.  
Resposta: `{ contacts: [{id, firstName, lastName, title, linkedin_url}], total }`

### lusha-reveal — body da requisição (POST)
```json
{ "contacts": [{"id":"v1.xxx","firstName":"Jean","lastName":"De Melo","title":"CEO"}] }
```
Internamente chama `POST /v3/contacts/enrich` com `reveal: ["emails","phones"]`  
Resposta: `results[].email`, `wa` (celular BR), `linkedin_url`, `title`  
Billing: `revealEmail` + `revealPhone` por contato · máx 5 por chamada  
Créditos após reveal: `GET /v3/account/usage` → `credits.balance`

### Billing por chamada
| Chamada | Crédito gasto |
|---------|--------------|
| lusha-domain step (a) | api_search (0 se sem resultado) |
| lusha-domain step (b) | api_search por contato retornado (size=1, geralmente 0 se domínio errado) |
| lusha-search prospecting | api_search × N contatos (máx 10) |
| lusha-search enrich base | 0 (jobTitle/socialLinks não são per-datapoint) |
| lusha-reveal | revealEmail + revealPhone × N contatos (máx 5) |

---

## Limite Vercel Hobby

Máximo **12 serverless functions**. Arquivo atual com **3 funções** (9 slots livres para Blocos 5-6):
- `api/enrich.js` — providers: hunter, lusha-*, graph-*, health, claude, crawl, gaia-board, whatsapp
- `api/fila.js` — GET `?token=<hex>` (credencial HTML), POST (gerar fila), POST `?action=credencial`
- `api/cron.js` — GET/POST `?job=gerar-fila-diario|enriquecimento-diario|noticias-semanal|fechamento-sexta`

URLs legacy continuam funcionando via rewrites em vercel.json:
- `/api/whatsapp` → `/api/enrich?provider=whatsapp` (webhook Meta mantido)
- `/api/gerar-fila` → `/api/fila` (retrocompatibilidade)
- `/api/gerar-credencial` → `/api/fila?action=credencial`
- `/api/claude`, `/api/crawl`, `/api/gaia-board` → provider equivalente em enrich
- `/c/:token` → `/api/fila?token=:token`

Novas funcionalidades de API: adicionar provider em `api/enrich.js` ou action em `api/fila.js`.

---

## Tela Fila do dia (FilaDoDia, block3.js)

- Mostra `status='aprovado'` para o canal da aba (Email/WhatsApp/LinkedIn)
- Ações: Abrir no Outlook (Outlook Web deeplink padrão; ou `mailto` via Config) → Enviei → grava `crm_toques` + atualiza `crm_decisores.ultimo_toque_em`
- Follow-up (`etapa_cadencia >= 2`): copia corpo, mostra thread_ref para localizar thread
- Pular: grava `motivo_pulo` em `crm_fila`
- Desfazer: volta para `status='aprovado'`
- Editável inline (assunto + corpo), salva em `crm_fila` ao sair do campo
- Atalhos: ↑/↓ navegar, O abrir, E enviei, P pular (desligados em input/textarea)
- Meta diária: `crm_configuracoes.email_daily_max` (padrão 50)
- Modo sequência (WA/LinkedIn): "▶ Sequência" → abre o primeiro item; após Enviei/Pular, abre o próximo automaticamente
- WhatsApp: número normalizado com prefixo 55 (sem duplicação), corpo com `encodeURIComponent`

---

## Microsoft Graph — Rascunhos de E-mail

### Arquitetura

```
Frontend (block3.js)
  ↓ POST /api/enrich?provider=graph-init
  ← { authUrl }  →  window.location.href = authUrl (PKCE)
  ↓ Microsoft redireciona para https://galeria-holding-sage.vercel.app?code=...&state=graphoauth_...
  ↓ IIFE no topo de block3.js → localStorage('gh_graph_pending')
  ↓ useEffect navega para 'fila'; FilaDoDia mount useEffect troca code por token
  POST /api/enrich?provider=graph-token  →  tokens salvos em crm_oauth_tokens (service-key only)
```

### Variáveis de ambiente necessárias (Vercel)
- `MS_CLIENT_ID` — Application (client) ID: `7fa6efd1-e50f-4b08-ade7-4d6385daba69`
- `MS_CLIENT_SECRET` — client secret, **expira 2028-09-21** — renovar antes com `az ad app credential reset --id 7fa6efd1-e50f-4b08-ade7-4d6385daba69 --years 2 --display-name CRM-Vercel`
- `MS_TENANT_ID` — tenant GALERIA: `32d2ee77-b1dd-4036-bf8f-b3c09f681bb9`
- `SUPA_CRM_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — já existente; código aceita ambos

### Tabela crm_oauth_tokens
RLS RESTRICTIVE — política "negar_tudo" bloqueia anon e authenticated.
Apenas service key (server-side) pode ler/escrever.
Colunas: `user_id`, `access_token`, `refresh_token`, `expires_at`, `pkce_state`, `pkce_verifier`, `graph_email`

### crm_fila — colunas Graph
- `outlook_message_id text` — ID do rascunho no Graph
- `rascunho_criado_em timestamptz` — quando foi criado
- `outlook_draft_link text` — URL de abertura no Outlook Web
- `rascunho_erro text` — mensagem de erro se falhar

### Fluxo de segurança
1. Nunca enviar sem ação do usuário — "Enviar aprovados" só aparece se `sendEnabled=true` (toggle em Config, desligado por padrão)
2. Nunca criar rascunho de item não-aprovado
3. Nunca criar duas vezes — verifica `outlook_message_id` antes de chamar Graph
4. Tokens ficam apenas em `crm_oauth_tokens` server-side; nunca retornam ao frontend
5. `MS_CLIENT_ID` é variável de ambiente Vercel; nunca no código-fonte

### Providers em api/enrich.js
- `graph-init` — gera PKCE + authUrl (delegated scopes: Mail.ReadWrite Mail.Send User.Read offline_access)
- `graph-token` — troca code por tokens, armazena em Supabase
- `graph-status` — retorna `{connected, email}` sem expor tokens
- `graph-disconnect` — deleta linha de tokens
- `graph-draft` — cria rascunho via Graph (ou createReply em follow-up); assina com PNG inline
- `graph-send` — envia rascunho via `/me/messages/{id}/send`
- `graph-sync` — verifica isDraft flag, marca enviados no CRM

### Assinatura de e-mail
Arquivo: `assinatura_galeria_holding.png` na raiz do projeto (não comitar; entregar à parte).
Carregado como Base64 no cold start de `api/enrich.js`. Se ausente, fallback para texto.
Incorporado como `fileAttachment` com `isInline:true` e `contentId: "assinatura001"`.
HTML body referencia via `<img src="cid:assinatura001" width="520">`.

### Regras adicionais de segurança
8. `.env` é gitignored — nunca commit.
9. `MS_CLIENT_ID` vai apenas em variável de ambiente Vercel.
10. Nunca logar access_token ou refresh_token em nenhum arquivo.
