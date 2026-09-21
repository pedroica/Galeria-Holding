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

## Limite Vercel Hobby

Máximo **12 serverless functions**. Arquivo atual com exatamente 12:
`api/c/[token].js`, `api/claude.js`, `api/crawl.js`, `api/enrich.js`, `api/gaia-board.js`,
`api/gerar-credencial.js`, `api/gerar-fila.js`, `api/whatsapp.js`,
`api/cron/enriquecimento-diario.js`, `api/cron/fechamento-sexta.js`,
`api/cron/gerar-fila-diario.js`, `api/cron/noticias-semanal.js`

Novas funcionalidades de API devem usar um arquivo existente (ex: `api/enrich.js` com `provider=novo`).

---

## Tela Fila do dia (FilaDoDia, block3.js)

- Mostra `status='aprovado'` para o canal da aba (Email/WhatsApp/LinkedIn)
- Ações: Abrir no Outlook (`mailto` ou deeplink outlook.office.com) → Enviei → grava `crm_toques` + atualiza `crm_decisores.ultimo_toque_em`
- Follow-up (`etapa_cadencia >= 2`): copia corpo, mostra thread_ref para localizar thread
- Pular: grava `motivo_pulo` em `crm_fila`
- Desfazer: volta para `status='aprovado'`
- Editável inline (assunto + corpo), salva em `crm_fila` ao sair do campo
- Atalhos: ↑/↓ navegar, O abrir, E enviei, P pular (desligados em input/textarea)
- Meta diária: `crm_configuracoes.email_daily_max` (padrão 50)
