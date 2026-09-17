# Galeria Holding CRM

Sistema de prospecção B2B para 13 agências — Pedro Ica, Head of Growth, Galeria Holding.

Acesse: [galeria-holding.vercel.app](https://galeria-holding.vercel.app)

## Stack
- React 18.2 + Babel Standalone (single-file block3.js, sem bundler)
- Supabase — auth (magic link), Postgres (RLS por row), Storage (4 buckets)
- IA: Claude claude-sonnet-4-6 (geração de textos de prospecção)
- Vercel — serverless API + 5 crons agendados
- 2.300+ empresas brasileiras na base
- 28.500+ linhas em crm_empresa_agencia_estrelas (score por agência)

## Fases entregues

| Fase | Descrição |
|------|-----------|
| A | Virada para Supabase — auth gate, RLS, bridge localStorage |
| B | Redesign — nav 13 agências, HoldingHome kanban, Base |
| Parte 0 | Dados fundacionais — 47 cases, 224 templates, 13 agências |
| C | Cases/credenciais/pipeline — renderer HTML, builder, sender |
| D | Motor de prospecção — gerar-fila.js (Claude), 4 crons, AprovacaoHoje |
| E | Cockpit — Tela Hoje, Painel de metas, fechamento automático sexta, 5 melhorias |

## Telas principais

- **Hoje** — progresso diário (aprovações pendentes, enviados, respostas, reuniões)
- **Holding** → Pipeline — kanban global drag-and-drop, filtros por agência/etapa
- **Holding** → Metas semanais — funil por agência últimas 4 semanas
- **Agências** — pipeline por agência, notícias, serviços, cases, credenciais, textos
- **Aprovar** — fila de emails/WA/LinkedIn gerados por IA para revisão e envio
- **Base** — 2.300+ empresas com decisores, estrelas, temperatura

## Crons automáticos (Vercel)

| Cron | Horário BRT | Função |
|------|-------------|--------|
| gerar-fila-diario | 6h diário | Gera fila de prospecção via Claude |
| noticias-semanal | seg 7h | Google News para empresas ★≥3 |
| enriquecimento-diario | 10h30 diário | Lusha: email (★≥3) e telefone (★=5) |
| fechamento-sexta | sex 17h | Move cards stale; gera relatório semanal |
| agent-daily | 10h30 diário | Agente IA diário |

## Env vars necessárias (Vercel)

| Variável | Descrição |
|---------|-----------|
| `SUPA_CRM_URL` | URL do projeto Supabase |
| `SUPA_CRM_ANON_KEY` | Chave pública (usada no frontend) |
| `SUPA_CRM_SERVICE_KEY` | Chave de service role (backend only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Alias para `SUPA_CRM_SERVICE_KEY` (adicionar) |
| `ANTHROPIC_API_KEY` | Para geração de textos via Claude |
| `CRON_SECRET` | Token de autenticação dos crons |
| `LUSHA_API_KEY` | Enriquecimento de contatos |

## Configurar IA
Em ⚙ Configurações, insira sua Claude API Key (`sk-ant-...`)  
Obtenha em: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

## Board GAIA para o time (acesso restrito)

Página separada, **somente leitura**, com apenas o kanban da GAIA:
`/gaia.html`. Quem abre não enxerga o CRM, a base de empresas, os contatos
nem o pipeline da Holding.

**Como compartilhar:** no CRM → aba **⚡ GAIA Pipeline** → botão
**🔗 Compartilhar**. Escolha um código de acesso (ou sorteie um), marque o
que ocultar (valores em R$, notas, coluna Perdido) e gere o acesso.

O board é cifrado no navegador com **AES-GCM 256**, chave derivada do código
via PBKDF2-SHA256 (210k iterações). Sem o código, o link não abre nada —
nem o servidor nem o Vercel veem os dados em claro. Mande o link e o código
por canais diferentes.

### Dois modos

| | Link com snapshot | Link fixo |
|---|---|---|
| Configuração | nenhuma | Upstash Redis/Vercel KV + 1 env var |
| URL | longa, muda a cada geração | sempre `/gaia.html` |
| Atualização | gerar link novo | clicar em "Publicar board" |

**Para habilitar o link fixo:**
1. Vercel → projeto → *Storage* → conectar um **Upstash Redis** (ou Vercel KV).
   Isso injeta `KV_REST_API_URL` e `KV_REST_API_TOKEN` automaticamente.
2. Vercel → *Settings* → *Environment Variables* → criar
   `GAIA_PUBLISH_TOKEN` com um segredo qualquer (só você usa, para publicar).
3. Redeploy. No modal, cole o token no campo do modo 2 e clique em
   **Publicar board**.

### Revogar o acesso
Troque o código e gere/publique de novo. Links antigos continuam abrindo o
snapshot antigo com o código antigo — no modo link fixo, republicar com um
código novo invalida o acesso de quem só tinha o anterior.

### Arquivos
- `gaia.html` — página do time (somente leitura)
- `gaia-share-core.js` — empacotamento compacto + criptografia
- `block_gaia_share.js` — modal "Compartilhar" dentro do CRM
- `api/gaia-board.js` — endpoint do link fixo (guarda só o texto cifrado)
