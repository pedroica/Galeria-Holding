# STATUS — SDR omnichannel autônomo

Última atualização: 2026-11-17 · branch de partida: `main` em `1652ed1` (PR #19 + BLOCO 7 mesclados).

## Diagnóstico de partida (17/11/2026) — o que foi confirmado no código

As 5 causas apontadas na missão foram conferidas no código atual da `main`:

| Causa | Confirmação |
|---|---|
| Lote diário sai de template | `api/cron.js` `jobGerarFila` chama `/api/fila` com `sem_ia: true`. |
| Prompt sem fatos do cliente | `gerarTexto` (`api/fila.js`) recebe só nome/setor/cargo e o `system` proíbe citar cases, resultados e números. |
| `crm_noticias` não alimenta a redação | Tabela coletada (`jobNoticias`), mas nenhum caminho do prompt a lê. |
| `graph-sync` é raso | `api/enrich.js` provider `graph-sync` só confere `isDraft` dos rascunhos; não lê respostas nem bounces. |
| Sem cadência entre canais | E-mail e WhatsApp decididos item a item em `crm_fila`; não há um fio por pessoa. |

## O que mudou desde o diagnóstico

- **PR #19 mesclado** (segurança, fila, enriquecimento, crons, rede de proteção) — já em produção na `main`.
- **BLOCO 7** (revisão final) mesclado junto: normalizou schedules dos crons em `vercel.json`, somou testes `gh-core-auth` e `secret-trim`, e consolidou a normalização (`trim`) dos segredos de cron em `enrich.js` (`CRON_SECRET` + ambas as service keys).
- `CRON_SECRET` existe em Production (confirmado: crons rodam em `info`, sem `error` nem 401 nos últimos 3 dias).
- Validação de MX antes de enfileirar e-mail já existe (`api/fila.js`, PR #19) — reaproveitada pelo controle de qualidade do SDR (4.6).

## Blocos (ordem de execução da missão)

- **A. Fundação** — em andamento (migrações `crm_dossies`/estado SDR, `SDR_CRON_SECRET`, pg_cron/pg_net, chaves de `crm_configuracoes`).
- B. Dossiê · C. Redação e qualidade · D. Cadência e envio · E. Leitura de respostas · F. Modo Sombra · G. Usabilidade · H. Aprendizado — pendentes.

## Decisões de negócio pendentes (do Pedro)

1. Avaliar a amostra de 20 mensagens do Modo Sombra (Bloco F) — única decisão prevista para ligar o Piloto Automático.
2. `sdr_piloto_automatico` nasce **desligada**; nada é enviado sem a avaliação acima.

---

## Decisões tomadas (modo autônomo)

- **SDR_CRON_SECRET na Vercel: bloqueado, contornado.** Sem CLI da Vercel/Supabase, sem token e sem navegador neste ambiente, e o MCP da Vercel só enxerga o time `galeria-credenciais` (projeto `galeria-holding` dá 404). Porquê: não dá para copiar o segredo do Vault sem exibi-lo; o relógio fica dormente até isso ser feito, sem ruído de 401.
- **Relógio pg_cron agendado mas dormente** (`sdr_relogio_ativo=false`). Porquê: tudo pronto para ligar com um UPDATE, e nada roda (nem custo de modelo) antes da decisão 3a.
- **Modelo da redação e do QC: `claude-opus-5-5`, esforço `medium` na redação e `low` no avaliador.** Porquê: é o modelo mais capaz de uso geral; o avaliador só dá notas, não precisa de mais esforço.
- **Custo estimado: ~180 chamadas/noite, ≈ R$ 440/mês** (US$ 4/20 por milhão de tokens). Porquê: abaixo do teto de R$ 500 do item 3c; só passa a existir quando o relógio for ligado; o custo real fica gravado por mensagem em `crm_sdr_mensagens.custo_usd`.
- **Structured outputs (JSON schema) em vez de "parsear" texto.** Porquê: elimina mensagens perdidas por JSON quebrado.
- **Fallback de recusa no servidor ligado** (`fallbacks: "default"`). Porquê: se o modelo recusar um pedido, a API tenta o modelo reserva na mesma chamada em vez de perder o lead.
- **Lead sem sinal público com fonte não vai para o modelo**; fica em `avaliado` com motivo "precisa de pesquisa manual". Porquê: sem lastro a mensagem nunca passaria no QC (100% citando fonte é meta da missão) e seria custo jogado fora.
- **3 versões por lead (ângulos fato / ideia / case), avaliador separado + checagens por código**, vence a aprovada de maior nota. Porquê: especificação 4.4/4.6; o código confere lastro (URL do dossiê), números do case, forma e personalização, coisas que o modelo pode errar.
- **Todo item gerado entra em `crm_fila` como `rascunho`**, mesmo com QC aprovado. Porquê: com o Piloto desligado nada sai sem o toque do Pedro; a nota e a fonte aparecem em `contexto_para_aprovacao`.
- **1 primeiro contato por empresa por semana; empresa tocada por qualquer agência nos últimos 30 dias fica de fora.** Porquê: evita duas agências do grupo abordando a mesma marca (regra 4.2).
- **Canal do toque segue a cadência (D0 e-mail, D3 WhatsApp, D7 e D14 e-mail) e cai para o outro canal se faltar o contato.** Porquê: não perder o lead por falta de um dos dois canais.
