# Agentes de WhatsApp — Galeria Holding

Três agentes que atendem no seu WhatsApp e trabalham dentro do seu CRM. Eles
não são um chatbot com respostas prontas: cada mensagem sua roda um **loop de
tool use** — o modelo decide quais ferramentas chamar, chama, lê o resultado e
responde. É o mesmo mecanismo que você usa no Claude, com as ferramentas do seu
negócio no lugar das de código.

| Agente | Comando | Cérebro | O que faz |
|---|---|---|---|
| 🗂️ Secretária | `/sec` | Claude | Briefing do dia, lembretes, kill switch do robô, consultas rápidas |
| 🤝 Vendedor | `/vendedor` | Claude | Fila de abordagem, ficha do decisor, redação da abordagem, registro do que aconteceu |
| 🔎 Buscador | `/buscador` | Qwen | Caça CMOs até 100% da lista, destrava empresas sem domínio, relatório de progresso |

Sem barra nenhuma, você fala com quem falou por último. `/ajuda` lista tudo,
`/status` diz quem está atendendo e em qual modelo, `/novo` zera a conversa.

## Por que híbrido (Qwen + Claude)

O buscador roda volume: dezenas de empresas por dia, decisões mecânicas
(este cargo é de marketing? este domínio está limpo?). Qwen resolve isso por uma
fração do custo. A secretária e o vendedor conversam com você e escrevem texto
comercial em português — aí a diferença de qualidade aparece, e vale Claude.

Trocar é uma variável de ambiente, não uma refatoração:
`AGENT_BRAIN_BUSCADOR=claude` e pronto. Se o Qwen não estiver configurado, o
roteador cai para Claude sozinho e avisa no `/status`.

## Arquitetura

```
WhatsApp (Cloud API, Meta)
        │  webhook assinado (HMAC SHA-256)
        ▼
api/whatsapp.ts ──── allowlist de números ──── dedupe por wamid
        │
        ▼
agents/orchestrator.ts
        ├── routing.ts     → qual agente atende
        ├── personas.ts    → prompt + cérebro + chaveiro de tools
        ├── llm/router.ts  → Claude ou Qwen
        ├── llm/loop.ts    → o loop de tool use
        └── tools/         → Supabase, Lusha, blocklist
        ▼
Supabase (fonte única da verdade)

api/cron/agent-daily.ts  ── 7h30 BRT ──► lote de CMOs + lembretes + relatório
       │                                    (mesma rotina que o worker do Mac)
       └── agent/src/worker/daemon.ts ── Mac 24h, só saída ── ver MAC.md
```

O webhook e o worker são independentes: o webhook responde suas mensagens na
Vercel; o worker do Mac faz o trabalho pesado sem limite de tempo. Os dois
compartilham `jobs/daily-routine.ts` e uma marca em `settings`, então a rotina
do dia roda uma vez só, não importa quem chegou primeiro.

Cada camada tem uma responsabilidade e é testável sozinha: `llm/loop.ts` roda
com um provider falso, `channels/whatsapp.ts` roda sem rede, `jobs/daily-cmo.ts`
tem a matemática de progresso separada do I/O.

## Segurança

1. **Assinatura.** Todo webhook é validado contra o App Secret da Meta. Sem
   assinatura válida, 401 — a URL ser pública não basta para comandar nada.
2. **Allowlist.** Só números em `WHATSAPP_ALLOWED_NUMBERS` são atendidos. Número
   de fora recebe silêncio (nem confirmamos que o número existe) e vira evento.
3. **Chaveiro por agente.** A secretária não alcança a ferramenta que gasta
   crédito; o buscador não alcança a que registra venda. Chamada fora da
   allowlist vira erro para o modelo, não execução.
4. **`DRY_RUN=true`.** Enquanto ligado, nada externo acontece: as ferramentas
   marcadas como `external` são recusadas e o agente explica o que faria.
5. **Service role só no servidor.** A chave que bypassa RLS vive nas funções
   Vercel. O navegador continua com a anon key, e as tabelas novas
   (`agent_sessions`, `wa_inbox`) não têm policy para anon — histórico de
   conversa não vaza pelo CRM.

## Buscador: como ele chega a 100%

A meta é `cmo_status = 'ok'` em toda empresa elegível. Cada empresa carrega seu
próprio estado, e é isso que faz o trabalho ser cumulativo:

| Status | Significa | Volta para a fila? |
|---|---|---|
| `pendente` | ainda não tentada | sim |
| `ok` / `revisar` | decisor cadastrado | não |
| `sem_dominio` | sem domínio, impossível buscar | só depois de `corrigir_dominio` |
| `sem_decisor` | Lusha não achou ninguém de marketing | sim, depois de 30 dias |
| `erro` | falha técnica | sim, depois de 30 dias |
| `bloqueada` | cliente da Holding | nunca |
| `ignorada` | você tirou da meta | nunca |

Todo dia às 7h30 o cron pega as próximas `CMO_DAILY_QUOTA` empresas por rank,
respeitando o orçamento de créditos Lusha, e marca cada uma. O relatório chega
no seu WhatsApp com % de cobertura e quantos dias faltam no ritmo atual.

O gargalo real não é crédito, é **empresa sem domínio** — sem domínio não há
busca. Por isso o relatório sempre mostra quantas estão travadas assim, e o
buscador pede os domínios em lotes de 10, por ordem de rank.

## Colocar no ar

1. **Banco.** Rode `supabase/migrations/0001_agents.sql` no SQL Editor
   (depois do `0000_init.sql`). Ele cria as tabelas novas e já classifica a base
   existente: bloqueadas viram `bloqueada`, sem domínio viram `sem_dominio`, e
   quem já tem contato com email vira `ok`.

2. **Meta / WhatsApp.** Em developers.facebook.com: crie o app, adicione o
   produto WhatsApp, pegue o *Phone Number ID* e um token permanente de System
   User. Em Webhooks, aponte para `https://<seu-dominio>/api/whatsapp`, use o
   mesmo `WHATSAPP_VERIFY_TOKEN` e assine o campo **messages**.

3. **Vercel.** Preencha as variáveis do bloco `[5]` do `.env.example`. Se elas
   faltarem, o webhook responde 500 e loga exatamente qual falta.

4. **Lusha.** Confira o contrato da sua conta antes de gastar crédito:
   ```bash
   cd agent && LUSHA_API_KEY=... npm run probe:lusha -- natura.com.br
   ```
   O script só faz o *search* (preview, sem revelar contato). Se o mapeamento
   voltar 0, ajuste `mapSearchResponse()` em `src/lusha/client.ts` — ou os paths
   por env, sem tocar em código.

5. **Ligar de verdade.** Com tudo respondendo em `DRY_RUN=true`, troque para
   `false`. A partir daí o buscador gasta crédito e grava contato.

## Limite da Cloud API que vale conhecer

A Meta só deixa mandar texto livre dentro de **24h** desde a sua última
mensagem. O relatório das 7h30 chega normalmente se você trocou qualquer
mensagem no dia anterior; fora disso é preciso um template aprovado
(`WHATSAPP_TEMPLATE_NAME`). Sem template, o relatório fica registrado em
`events` e chega assim que você mandar qualquer coisa.

## Testes

```bash
cd agent
npm test              # 96 testes, sem rede
npm run test:agentes  # só os dos agentes
npm run typecheck
```

O que está coberto: assinatura HMAC (inclusive corpo adulterado e tamanho
diferente), parse do webhook, quebra de mensagem longa, allowlist com nono
dígito, comandos de barra, loop de tool use (paralelo, erro, teto, deadline),
tradução Claude ↔ Qwen, fronteira da allowlist de tools, DRY_RUN, matemática de
progresso e orçamento de créditos, corte de histórico sem `tool_result` órfão.
