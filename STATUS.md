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
