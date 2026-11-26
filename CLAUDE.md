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
block1.js           — utilitários de agenda/contato ainda usados pelas telas
block2.js           — Login, configurações
block3.js           — Telas principais: Hoje, Inteligência, Holding, Agências, Aprovar,
                      SDR, Fila do dia, Base, Templates, Admin
block4.js           — Base de empresas (EmpresasView), Notícias, Relatórios
block6.js           — Modal Ferramentas (backup & APIs)
block_pipeline.js   — Pipeline (crm_oportunidades)
block_copiloto.js   — Copiloto
block_atividade.js  — Tela Atividade: toques/dia, canal/agência, execuções de crons
block_blocklist.js  — Blocklist
(Limpeza de 26/11/2026: block5, block7, régua, bom dia, diário, XP e Gaia Share
 saíram do app — nenhuma tela os abria. Estão no histórico do git se precisar.
 gaia-share-core.js continua, usado só pela página pública gaia.html.)
api/enrich.js       — Proxy: Hunter, Lusha (person + empresa), health check
api/gerar-fila.js   — Gera lote crm_fila (rascunho)
api/cron/           — Crons diários/semanais
```

### Como os scripts são carregados
`index.html` usa `(0,eval)(code)` para cada block: o código roda no escopo global. Não há Babel/transpiler — escreva JavaScript moderno mas **sem JSX**. Use `React.createElement(...)` diretamente.

Hooks disponíveis em block3.js: `const { useState, useMemo, useEffect, useCallback } = React;` está no topo do arquivo; todos os componentes abaixo podem usá-los.

---

## Navegação principal (block3.js, App)

Menu enxuto (26/11/2026): **Hoje · Pipeline · Fila · Base · Inteligência · Agências · Admin**.
Telas agrupadas em sub-abas (`SUBABAS` no App, barra `BarraSubAbas`):
- Fila: Aprovar · Enviar · Agente (SDR)
- Pipeline: Pipeline · Metas semanais · Kanban legado
- Inteligência: Inteligência · Atividade
- Admin: Usuários (só admin) · Templates · Blocklist · Copiloto
- Agências: Pipeline · Notícias · Serviços · Materiais (Cases/Credenciais/Textos) · Enviar pipeline

`navTo('sdr'|'aprovar'|'atividade'|'templates'|...)` continua valendo: `NAV_ALIAS` leva para o menu + sub-aba certos.
A tela mostrada é `vista` (menu + sub-aba). Para uma tela nova: adicionar a sub-aba em `SUBABAS`,
o mapeamento em `VISTA` e o caso `vista === '...' ?` na chain de telas.

---

## Prazos e reuniões (missão do app)

- **Prazo** = próximo passo de oportunidade aberta (`crm_oportunidades.proximo_passo` + `proximo_passo_em`, date).
  Regras puras em `prazos.js` (window.Prazos; testes em `tests/prazos.test.mjs`).
- Tela Hoje → `PainelPrazos` (vencidos / hoje / esta semana / sem prazo; Feito, +1 dia útil, +1 semana, Definir prazo, Abrir)
  e `PainelReunioes` (meta semanal `META_REUNIOES_SEMANA` = 10, em block3.js, usada também em Metas semanais e na Base + próximas reuniões).
- Pipeline: salvar oportunidade aberta exige próximo passo + data; arrastar para etapa aberta sem prazo abre o formulário.
- **Reuniões** = `crm_reunioes_v` (toques de reunião + entradas em "Primeira reunião"). O `crm_kanban` legado não conta mais.
- Gmail (`gmail-crm`): data combinada vira prazo (`aplicarPrazoDoEmail`: só com resposta real, data futura e sem
  sobrescrever edição mais nova do Pedro); reunião marcada com data vira toque `reuniao_marcada` com `reuniao_em`.

## Backup automático (api/crm-backup.js)

Cron diário às 23h BRT (02h UTC) exporta todas as tabelas `crm_` como CSV e JSON para o Google Drive.

### Variáveis de ambiente necessárias
Nenhuma variável adicional — usa `SUPA_CRM_SERVICE_KEY` (já configurada) para escrever no Storage.

### Onde ficam os backups
Supabase Storage, bucket **`backups`** (privado), projeto `uetltlnjmobeiunxfsqi`.  
Estrutura: `backups/<YYYY-MM-DD>/<tabela>.csv` e `<tabela>.json`.  
Acesso: Storage → Buckets → backups → navegar pasta pelo dia desejado, ou via API com service key.

### Variáveis de ambiente necessárias
Nenhuma variável nova. `SUPA_CRM_SERVICE_KEY` (já existente) é usado como credencial de escrita no Storage.

### Como restaurar a partir de um backup

1. Abra o Supabase Dashboard → Storage → Buckets → `backups`
2. Navegue até a pasta `YYYY-MM-DD` do dia desejado
3. Faça download do arquivo `<tabela>.json` da tabela a restaurar
4. Abra o Supabase Dashboard → SQL Editor
5. Para recuperar registros apagados por soft-delete (opção preferencial):
   - Use a tela Admin → Lixeira → Restaurar (funciona dentro de 30 dias)
6. Para restauração a partir do JSON (emergência):
   ```sql
   -- Exemplo para crm_oportunidades (adaptar para cada tabela)
   INSERT INTO crm_oportunidades (id, titulo, estagio, ...)
   SELECT (j->>'id')::uuid, j->>'titulo', j->>'estagio', ...
   FROM jsonb_array_elements('<cole o JSON aqui>'::jsonb) AS j
   ON CONFLICT (id) DO UPDATE SET
     titulo = EXCLUDED.titulo, estagio = EXCLUDED.estagio,
     atualizado_em = now(), apagado_em = EXCLUDED.apagado_em;
   ```
7. Verificar contagens: `SELECT count(*) FROM <tabela> WHERE apagado_em IS NULL;`

### Botão "Exportar tudo agora"
Disponível na tela Admin. Chama `POST /api/crm-backup` — o backend usa `SUPA_CRM_SERVICE_KEY` (server-side only) para escrever no Storage. O frontend envia apenas o JWT de sessão.

### Retenção
30 dias. Pastas mais antigas são removidas automaticamente na execução do cron.

---

## Tabelas principais (Supabase)

| Tabela | Uso |
|---|---|
| `crm_fila` | Fila de prospecção. Status: `rascunho → aprovado → enviado\|pulado\|erro` |
| `crm_decisores` | Contatos (nome, cargo, email, wa, linkedin_url, ultimo_toque_em) |
| `crm_empresas` | Empresas (nome, setor, dominio, site) — `estrelas` não usar, está zerado |
| `crm_empresa_agencia_estrelas` | `max(coalesce(estrelas_manual, estrelas_calculadas))` por empresa_id |
| `crm_toques` | Histórico de toques (direcao, canal, assunto, resumo, data, fonte, resultado) |
| `crm_kanban` | Cards por pipeline de agência (legado) |
| `crm_oportunidades` | Pipeline CRM — estágios: Wishlist, Primeira reunião, Contato direto, Negociando direto, Concorrências, Negociação, Cliente ativo, Perdido, Pausado |
| `crm_oportunidade_eventos` | Histórico de eventos por oportunidade (estagio, criada, apagado, pedido_atualizacao…) |
| `crm_agencias` | Agências do grupo (id, nome, slug, cor) |
| `crm_usuarios` | Usuários do CRM (email, papel: admin|leitor, agencia_id, ativo) |
| `crm_auditoria` | Trilha de auditoria: toda alteração em oportunidades/empresas/decisores (tabela, registro_id, campo, valor_de, valor_para, usuario_email, criado_em) |
| `crm_logs` | Log de execuções de crons e backups |
| `crm_shared` | localStorage partilhado (key/value JSONB) |
| `crm_configuracoes` | Config global (chave/valor) — `email_daily_max`, `whatsapp_daily_max` |
| `crm_test_oportunidades` | Cópia de estrutura para testes CI — nunca contém dados de produção |
| `crm_test_oportunidade_eventos` | Cópia de estrutura para testes CI |

Todas têm RLS `autenticado_tudo` (ALL para `authenticated`). Use sempre a sessão JWT de `window.__supaSession.access_token`.

### Credenciais frontend
```javascript
const SUPA_URL  = 'https://uetltlnjmobeiunxfsqi.supabase.co';  // OK no frontend
const SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r'; // anon key, pública por design
```
Server-side secrets ficam **somente** em variáveis de ambiente Vercel.

---

## Variáveis de ambiente (Vercel Production + .env local)

| Variável | Uso | Onde usar |
|---|---|---|
| `SUPA_CRM_URL` | URL do projeto Supabase CRM | api/* (fallback hardcoded) |
| `SUPA_CRM_ANON_KEY` | Anon key do Supabase CRM (pública) | api/*, também hardcoded no frontend |
| `SUPA_CRM_SERVICE_KEY` | Service key do Supabase CRM | api/* server-side only |
| `SUPABASE_SERVICE_ROLE_KEY` | Alias de SUPA_CRM_SERVICE_KEY (aceito nos apis) | api/* server-side only |
| `SUPA_AGENTE_URL` | URL do projeto Supabase Agente | api/copiloto.js |
| `SUPA_AGENTE_ANON_KEY` | Anon key do Supabase Agente | api/copiloto.js |
| `SUPA_AGENTE_SERVICE_KEY` | Service key do Supabase Agente | api/copiloto.js server-side only |
| `ANTHROPIC_API_KEY` | Chave da API Anthropic Claude | api/copiloto.js, api/fila.js |
| `LUSHA_API_KEY` | Chave da API Lusha V3 | api/enrich.js, api/cron.js |
| `CRON_SECRET` | Token Bearer que a Vercel envia nos crons | api/cron.js (authCheck) |
| `MS_CLIENT_ID` | Azure App Registration — Microsoft Graph | api/enrich.js |
| `MS_CLIENT_SECRET` | Azure App Secret — Microsoft Graph (expira 2028-09-21) | api/enrich.js server-side only, nunca logar |
| `MS_TENANT_ID` | Azure Tenant ID — Galeria | api/enrich.js |
| `PLAYWRIGHT_TEST_EMAIL` | Email do usuário de teste Playwright | tests/ apenas |
| `PLAYWRIGHT_TEST_PASSWORD` | Senha do usuário de teste Playwright | tests/ apenas |

Nunca colocar valores de secrets em arquivos, commits, logs ou no chat.

---

## Autonomia operacional

Pedro não é técnico e não quer ser acionado para buscar chaves, variáveis, links ou clicar em dashboards. Claude Code tem autorização permanente para: obter e gravar credenciais no `.env` local (`vercel env pull`, criar chaves no Supabase pelo Chrome, ler variáveis do projeto); criar, editar e apagar variáveis de ambiente na Vercel; fazer redeploy; rodar crons pelo botão Run; consultar e alterar o banco pelo MCP do Supabase; navegar nos dashboards da Vercel e do Supabase pelo Chrome. Nunca mostrar o valor de uma credencial no chat. Só acionar Pedro para decisão de negócio ou quando um bloqueio de segurança da própria ferramenta impedir a ação, e nesse caso dizer em uma linha o que foi bloqueado e a alternativa.

Cada merge na main está autorizado assim que os testes reais passarem (saída colada) — não parar para pedir aprovação.

---

## Regras de segurança (não negociáveis)

1. **Nunca apague dados** — UPDATE/INSERT sempre. DELETE só em cleanup de testes, confirmado explicitamente. Use soft-delete: `UPDATE ... SET apagado_em = now()` para remover da visão ativa; lixeira na tela Admin permite restaurar em 30 dias.
2. **Migrações só aditivas** — `ADD COLUMN IF NOT EXISTS`, nunca DROP/ALTER TYPE destrutivo.
3. **Envio automático só sob o Piloto Automático, com guarda dupla.** A regra base continua: a tela Fila do dia abre o Outlook e quem clica é o usuário. A ÚNICA exceção é o "Piloto Automático" do SDR, e ele só envia (e-mail via Graph `graph-send`, WhatsApp via Cloud API) quando **todas** estas condições são verdadeiras ao mesmo tempo: (a) `crm_configuracoes.sdr_piloto_automatico = true` (nasce `false`, e só é ligada pelo Pedro depois do Modo Sombra); (b) a mensagem passou no controle de qualidade com nota mínima 8 em todos os critérios e risco baixo; (c) estamos dentro da janela de envio, em dia útil, fora de feriado (`sdr_feriados`); (d) o teto diário/aquecimento de envios não foi atingido. Com a chave desligada, o sistema faz tudo igual e **para no rascunho aprovado**, como hoje. O botão "Pausar tudo" (tela) e a palavra "pausar" no WhatsApp do copiloto desligam a chave na hora e cancelam os envios agendados que ainda não saíram. Resposta a quem respondeu **nunca** sai sem o toque do Pedro.
4. **SUPA_CRM_SERVICE_KEY / SUPA_AGENTE_SERVICE_KEY** — server-side only, nunca no frontend.
5. **SUPA_ANON** — único credential Supabase permitido no frontend.
6. **LUSHA_KEY / HUNTER_KEY / ANTHROPIC_API_KEY** — variáveis de ambiente Vercel only.
7. `.env` é gitignored. Nunca escrever valor de secret em arquivo, commit, STATUS.md ou relatório.

---

## Convenções de código

- **Sem JSX** — React.createElement direto, igual ao resto do codebase.
- **Sem build** — nenhum npm run build; o deploy é o próprio source.
- **Branches que disparam CI** — `fix/**`, `feature/**`, `chore/**` no push; `pull_request` para main. Merge na main só com CI verde.
- **Commit a cada alteração** testada; push ao mesmo tempo.
- **Mudanças em `.github/workflows/`** — o token local não tem escopo `workflow`; editar pelo editor web do GitHub e depois `git pull` para sincronizar.
- **Testes de integração** (suite "Bloco 8 — crm_oportunidades_visao isolamento") requerem `SUPABASE_SERVICE_ROLE_KEY` no ambiente; em CI vem do secret homônimo no GitHub Actions; localmente lê `SUPA_CRM_SERVICE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` do `.env`.
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

## Base: setores, listas e placar (26/11/2026)

- `crm_empresas.setor_canonico`: setor numa lista única (`lib/setores.js`), preenchido pelo job `classificar-setores`
  (setor antigo mapeado de graça; o resto pela IA, Sonnet, lotes de 60). O `setor` original não é tocado.
- `crm_base_contatos_v`: um contato por linha com setor, estrelas, último toque, cliente ativo e oportunidade aberta.
- Base › **Listas e blitz** (`block_base.js`, regras em `base.js`): filtros por setor, cargo, estrelas, canal e
  "deixar de fora"; salva em `crm_listas` / `crm_lista_itens`. Base › **Placar** lê `crm_placar_v`.

## Fila antiga desligada (26/11/2026)

- O gerador antigo (`gerar-fila-diario`) saiu dos crons da Vercel: não gerava nada desde 17/11 e o agente SDR o substitui.
  O botão manual "Gerar nova fila" (Fila › Aprovar) continua.
- Uma tarefa agendada do **Claude Cowork** ("fila-do-dia", grava `crm_fila.origem='cowork'`) criou 331 rascunhos de 18/11 a 26/11,
  nenhum enviado. Ela não está neste repositório: é a tarefa "Máquina de Reuniões: fila do dia" em claude.ai/scheduled-task,
  **pausada em 26/11/2026** (religar no mesmo lugar). Os 326 pendentes foram arquivados (status `pulado`,
  `decisao_por='limpeza-26-11'`). Para desfazer:
  `UPDATE crm_fila SET status='rascunho', motivo_pulo=NULL, decisao_por=NULL, decisao_em=NULL WHERE decisao_por='limpeza-26-11';`

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

---

## Gmail — rascunhos, respostas e envio em lote

O Outlook (Graph) depende de aprovação do TI da Galeria; o e-mail do SDR roda pelo Gmail do Pedro.

- **Credenciais do app Google:** env `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ou, se faltarem, Vault (`google_client_id` / `google_client_secret`), lidos pela RPC `sdr_google_oauth()` (só service_role).
- **App OAuth no Google Cloud:**
  - Tipo "Aplicativo da Web", redirect `https://galeria-holding-sage.vercel.app/api/enrich`.
  - Tela de consentimento **publicada (Em produção)**: em modo Teste o refresh token expira em 7 dias.
  - Escopos `gmail.compose`, `gmail.readonly`, `openid`, `email`.
- **Providers em `api/enrich.js`:** `gmail-init`, `gmail-status`, `gmail-disconnect` e `gmail-send`. Todos exigem o JWT do usuário; o segredo do cron não envia. O callback é o mesmo `/api/enrich`, com state `gmailoauth_…`.
- **Tokens:** em `crm_oauth_tokens` com `provider='google'` (RLS restritivo), nunca no front.
- **`lib/gmail-token.js`:** token/refresh, MIME, assinatura padrão do Gmail (`settings/sendAs`), criar e enviar rascunho, ler a caixa.
- **Crons:**
  - `rascunhos-matinais` cria o rascunho no Gmail quando conectado (senão, Outlook). Usa a assinatura do Gmail e põe cópia de `crm_configuracoes.email_copia` (`email_copia_tipo`: bcc|cc).
  - `sdr-respostas` lê a caixa do Gmail (cursor `sdr_inbox_cursor_gmail`).
- O id do rascunho fica em `crm_fila.outlook_message_id` e o link em `outlook_draft_link` (colunas reaproveitadas).
- **Regra 3 continua:** o rascunho é criado sozinho; o envio só sai com o clique do Pedro ("Enviar e-mails em lote", com confirmação).
