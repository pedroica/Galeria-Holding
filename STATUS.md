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
- **Bloco E: leitura da caixa a cada 15 min em dias úteis 08h-20h BRT, por regras (sem modelo).** Porquê: bounce, auto-resposta e opt-out têm padrões claros; regra é grátis, instantânea e auditável. O que não casa com nada vira "indefinido" e vai para o Pedro ler.
- **Na dúvida entre opt-out e outra coisa, vale o opt-out.** "Não tenho interesse" desliga a cadência daquela pessoa. Porquê: o custo de insistir com quem pediu para parar é maior que o de perder um lead.
- **E-mail que não é de decisor do CRM não é gravado.** Porquê: a caixa do Pedro tem correspondência pessoal e de clientes; só guardamos o que é do SDR.
- **Resposta com interesse cria oportunidade em "Contato direto"** (não em "Primeira reunião"), com próximo passo "responder e marcar". Porquê: interesse ainda não é reunião marcada; o Pedro move quando marcar.
- **"Não agora" pausa a pessoa por 90 dias** (`pausa_ate_em`) e a seleção passou a respeitar essa pausa. Porquê: volta na hora certa sem ser esquecida.
- **Bounce com WhatsApp cadastrado não encerra a cadência:** o próximo toque cai para o WhatsApp. Porquê: o e-mail errado não invalida o contato.
- **Coluna `opt_out` criada em `crm_decisores`.** Porquê: a seleção já checava `opt_out`, mas a coluna não existia; agora o pedido de saída fica gravado e é respeitado.
- **Bloco D: envio em dois jobs (sdr-agendar às 07h BRT, sdr-envio a cada 5 min das 07h às 11h BRT) com a guarda conferida duas vezes**, a segunda relendo o banco no instante do envio. Porquê: se o Pedro apertar "Pausar tudo" entre o agendamento e o envio, nada sai.
- **Janela de envio 07:30-11:00 BRT** (valor já gravado em `sdr_janelas`). Porquê: manhã é quando decisor lê e-mail; mantido o que estava configurado.
- **Aquecimento: 15 e-mails/dia na primeira semana, +5 por semana, teto `email_daily_max`; envio para se o bounce de 7 dias passar de 2%.** Porquê: proteger a reputação do domínio do Pedro.
- **Toda mensagem automática leva uma linha de saída** ("responder remover" no e-mail, "responda SAIR" no WhatsApp). Porquê: guarda da missão (opt-out funcionando antes de qualquer envio) e boa prática anti-spam.
- **E-mail sai pelo `/me/sendMail` do Graph com a assinatura em texto "Pedro Ica"**, sem a imagem PNG. Porquê: a imagem fica no servidor do enrich e duplicá-la no cron aumenta o risco sem ganho de resposta; dá para ligar depois.
- **WhatsApp só sai com modelo aprovado pela Meta**; o job `sdr-wa-modelos` submete 4 modelos e grava o aprovado sozinho. Porquê: primeiro contato no WhatsApp Business exige modelo; enquanto não houver, o D3 fica barrado e o lead segue por e-mail.
- **Resposta de prospect pelo WhatsApp é tratada como a do e-mail** (SAIR = opt-out, qualquer resposta para a cadência) e **nunca recebe resposta automática**. "pausar" vindo do número do Pedro aciona o botão de pânico. Porquê: regra 3 do CLAUDE.md.
- **Botão "⏸ Pausar tudo" fica na barra do topo, em todas as telas**, vermelho quando o Piloto está ligado. Porquê: pânico tem que estar a um clique de qualquer lugar.
- **Constraint de `crm_logs.nivel` ampliada para aceitar `aviso` e `error`.** Porquê: achado ao testar o botão de pânico em produção: só `info` era aceito, então todo aviso/erro dos crons sumia em silêncio e a tela Atividade nunca mostrava alerta.
- **Follow-ups (D3/D7/D14) nascem como `aguardando` com a data já no próximo dia útil** e a seleção da noite os promove quando vencem. Porquê: o mesmo fluxo de dossiê, redação e QC vale para o follow-up, sem caminho paralelo.
- **Bloco G: candidatos de topo de funil vão para `crm_sdr_topo` e só entram na seleção depois que o Pedro aceita** (tela SDR). Aceito passa à frente de tudo com a agência sugerida. Porquê: cross-sell mexe com cliente ativo de outra agência; a apresentação tem que ser combinada antes.
- **Cross-sell sempre pontua acima de sinal e lookalike.** Porquê: cliente que já confia no grupo converte muito mais que lead frio.
- **Lookalike via Lusha com filtro de porte (100+ funcionários) e sem órgão público.** Rodada única hoje: 50 resultados por 10 créditos, 12 aproveitados. Porquê: as sementes misturam setores e trouxeram muita empresa pequena; sem o filtro a lista não serve.
- **Banco de cases lido ao vivo de `crm_cases` (liberados para prospecção), somado ao JSON.** Fora: projeções ("Proposta, não resultado") e casos sem confirmação; caso "sem métricas" entra sem número. Porquê: 47 cases no banco contra 14 no JSON; o JSON envelhece.
- **ICP por empresa gravado no JSON** (setores, porte, cargos, sinais-gatilho, ângulo) para Galeria, Milà, 404, Caramelo, Catalyst, Mantiqueira, A.gente, Vitrine, GUX e GAIA, e regra de seleção nova para a Mantiqueira. Porquê: é alvo de prospecção, não promessa comercial; derivado da especialidade de cada uma.
- **Tela SDR nova** (barra do topo): respostas para ler, amostra do Modo Sombra, topo de funil. O botão "Ligar Piloto" só habilita depois da amostra aprovada. Porquê: deixar o envio "a um clique" sem tirar a decisão do Pedro.
- **Correção: `crm_noticias.criado_em` criada.** Porquê: o job semanal gravava e filtrava por uma coluna inexistente; a rotação não excluía nada e as mesmas 20 empresas voltavam todo dia.

## Métricas: linha de base e proposta de 3x em 90 dias

**Linha de base do outbound (fila, 21/09 a 17/11, ~8 semanas):** 52 empresas contatadas, 3 decisores responderam (5,8%), **0 oportunidades e 0 reuniões** atribuíveis à fila. O "skip" de 89,6% (1.380 de 1.540) é quase todo rascunho que **nunca foi aprovado** e expirou (807 arquivados na limpeza de 16/11, 330+93+36+23+22 substituídos por lotes novos), não rejeição de texto.

| empresa | oportunidades (total) | em reunião ou além | clientes ativos | envios da fila 90d | itens pulados |
|---|---|---|---|---|---|
| GAIA | 51 | 26 | 8 | 1 | 84 |
| Galeria | 17 | 6 | 2 | 2 | 82 |
| cccaramelo | 16 | 10 | 6 | 2 | 76 |
| 404 | 15 | 10 | 3 | 20 | 159 |
| Milà | 4 | 2 | 0 | 2 | 59 |
| Catalyst | 2 | 2 | 0 | 2 | 74 |
| Vitrine, GUX, A.gente, Mantiqueira | 0 | 0 | 0 | 0 a 3 | 58 a 85 |

Todas as 109 oportunidades têm origem `abordagem_direta` (relacionamento do Pedro e das agências), criadas a partir de 17/09.

**Conta do 3x (o alvo é reunião vinda do outbound, hoje ~0 por mês):**
- Capacidade de e-mail com aquecimento (15/dia, +5 por semana, teto 40): 15+20+25+30+35 e depois 40 por 8 semanas = 445 envios por dia útil somados nas 13 semanas × 5 dias = **2.225 e-mails em 90 dias**.
- 3 e-mails por pessoa (D0, D7, D14) + 1 WhatsApp: **~740 decisores novos**.
- Resposta: hoje 5,8% sem sinal e sem QC. Com fato do dossiê em 100% das mensagens, premissa conservadora de 8%: **~59 respostas**; 40% positivas: **~24 interessados**; 70% viram reunião: **~17 reuniões**.
- Cross-sell: 14 candidatos hoje; com apresentação pela agência que já atende, 40%: **~6 reuniões**.
- Total: **~23 reuniões em 90 dias (≈ 8 por mês)**, contra ~0 hoje e contra 3,4 por mês, que é o 3x da linha de base de leads qualificados (1,1 por mês). Para chegar lá, `email_daily_max` precisa subir de 15 para 40 a partir da 6ª semana (hoje está em 15 e trava o aquecimento).
- Gargalos reais, em ordem: (1) aprovação: 89% dos rascunhos morreram sem decisão; (2) sinal: só 1 sinal de compra forte em 799 notícias de 45 dias, então a maior parte dos leads vai sem gancho e fica retida; (3) cases: Caramelo, Catalyst, Mantiqueira e GUX não têm nenhum case liberado.

## Fase 2: decisões tomadas

- **Relógio autenticado pelo Vault, sem depender da Vercel.** O servidor manda o Bearer recebido para a RPC `sdr_cron_token_valido` (só service_role), que compara dentro do banco e responde true/false. Porquê: o segredo nunca sai do Vault nem passa pelo servidor; a outra conta da Vercel deixa de ser bloqueio. `SDR_CRON_SECRET` na env segue aceito se um dia for preenchido.
- **Cache de 5 minutos só para token aprovado** (guardado como sha256) e **falha fechada** se o banco não responder. Porquê: evita uma consulta por chamada sem travar rotação de segredo nem abrir o endpoint numa queda.
- **Relógio validado em produção:** disparo real do pg_cron (`sdr_invoke('sdr-agendar')`) voltou 200, com início e fim gravados no `crm_logs`. O relógio segue dormente.
- **Modo Sombra virou uma chave própria (`sdr_modo_sombra`, nasce ligada).** Tudo roda e é marcado `sombra=true`, mas nada vai para a fila de aprovação nem para agendamento/envio. Porquê: provar qualidade sem encher a fila do Pedro de rascunhos de teste.
- **Rodar o Modo Sombra por chamada direta, sem ligar o relógio.** Porquê: o item 2 pede a prova; ligar o relógio continua sendo decisão do Pedro.
- **Câmbio fixo de R$ 5,40 por dólar para o custo** (`sdr_usd_brl`). Porquê: só para o placar; ajustável no banco.
- **Limpeza da carteira só com sugestões** (`classificacao_sugerida`, `duplicata_de`, `setor_sugerido`, `setor_fonte`). 103 registros: 77 clientes reais, 13 campanhas, 6 duplicatas, 7 indefinidos; 45 setores vazios preenchidos como sugestão. Nada apagado, mesclado ou sobrescrito. Porquê: mesclar é decisão do Pedro (item 3e).
- **Setor inferido pelo domínio ou pela marca conhecida, com a fonte registrada.** Os dados de Lusha no banco não têm setor nem porte (headcount vazio em toda a carteira). Porquê: transparência sobre de onde veio cada sugestão.
- **Seleção intercala as empresas do grupo (round-robin pelo score).** Porquê: 1.661 das 2.033 empresas elegíveis caem na Holding/Galeria por falta de setor; sem intercalar, o lote diário seria quase só delas e as outras 8 não teriam fila própria.
- **Correção: chaves estrangeiras nas tabelas do SDR.** Sem FK, a API do Supabase não fazia os joins e todo job a partir do dossiê falhava em produção; os testes unitários simulavam o banco e não pegaram. Adicionadas como NOT VALID e criado teste no e2e (que roda com a service key) com as consultas reais dos jobs. Porquê: achado na primeira rodada real do Modo Sombra.
- **A chave da Anthropic na Vercel está inválida** (a API devolve 401 "invalid x-api-key"). A redação e o QC não rodam em produção com ela. Contorno no código: se a chave da env faltar ou for recusada, o servidor usa a chave guardada no Vault do Supabase com o nome `anthropic_api_key` (RPC só service_role, cache de 10 min). Porquê: trocar a chave passa a depender só do Supabase, não da outra conta da Vercel. **Falta alguém com acesso ao console da Anthropic gerar uma chave e salvá-la no Vault.** O copiloto de WhatsApp e a geração com IA da fila usam a mesma variável e provavelmente estão parados também.
- **Seleção rodada de novo no mesmo dia não reinicia quem já avançou** (upsert passa a ignorar duplicata). Porquê: ao ampliar o lote do Modo Sombra, os 30 leads já com dossiê voltaram para 'selecionado'.

## Fase 2: entregabilidade (item 4)

**Auditoria de `galeriaholding.co` (17/11, DNS público):**
- SPF `v=spf1 include:spf.protection.outlook.com -all` (estrito, correto para M365).
- DKIM ativo: o seletor 1 publica a chave RSA; o seletor 2 vazio é normal na rotação do M365.
- DMARC `p=quarantine` com relatórios para `monitorar.dmarc@`.
- MX no Exchange Online.
- Fora da Spamhaus DBL. A URIBL recusou a consulta por resolvedor público, então não foi possível checar.
- `galeria.ag` está com DMARC `p=none` (mais fraco); não deve ser usado para frio.
- **Outlook não está conectado ao CRM** (nenhum refresh token em `crm_oauth_tokens`). Sem reconectar na tela Fila, nada sai por e-mail e as respostas não são lidas.

**Teto seguro no domínio principal:** até 40 e-mails frios por dia, chegando lá pela curva já configurada (15 na 1ª semana, +5 por semana, 6 semanas). Para se passar de 2% de bounce em 7 dias. Porquê: é o domínio corporativo do grupo; uma queima de reputação derruba o e-mail de todo mundo.

**Para escalar, proposta (preços estimados, sem checagem online, porque o sandbox não acessa a web):**

| fase | infraestrutura | envios/dia após aquecimento | custo/mês estimado |
|---|---|---|---|
| hoje | domínio principal, 1 caixa | 40 | R$ 0 |
| enxuta | + 3 domínios secundários (ex.: galeriaholding.com.br e variações) × 2 caixas M365 Basic + ferramenta de aquecimento | +180 (6 × 30) em 4 semanas | ~R$ 450 (caixas ~R$ 240, aquecimento ~R$ 200, domínios ~R$ 10) |
| completa | 9 domínios (1 por empresa) × 2 caixas + aquecimento | +540 (18 × 30) em 4 semanas | ~R$ 1.000 a 1.300 |

Cronograma da enxuta: semana 1 compra dos domínios + SPF/DKIM/DMARC; semanas 1 a 4 aquecimento sem frio; semana 5 em diante 10/dia por caixa, +5 por semana até 30. A completa passa de R$ 500 e entra como pergunta para o Pedro.

## Fase 2: topo de funil em escala (item 6)

Créditos Lusha nesta fase: **65 de 800** (saldo 2.374).

| fonte | créditos | candidatos úteis | créditos por candidato |
|---|---|---|---|
| lookalike GAIA (sementes de alimentos) | 10 | 34 | 0,3 |
| lookalike Galeria (consumo massivo) | 10 | 19 | 0,5 |
| lookalike Galeria e 404 com sementes misturadas | 20 | 0 (ruído: México, Portugal, empresas de 1 a 10 pessoas) | perdido |
| sinais Lusha (25 empresas sem fato público) | 25 | 6 fortes (vagas de marketing, crescimento) | 4,2 |
| cross-sell da base limpa | 0 | 21 | 0 |

Ainda não há leads aceitos, então o custo por **lead aceito** só existe depois que o Pedro aceitar na tela SDR. Ele é calculado de `crm_sdr_topo.dados.creditos` dos aceitos.

- **Lookalike só serve com sementes de um perfil.** Porquê: sementes misturadas (banco + fast food + streaming) devolveram ruído.
- **Sinal do Lusha entra como prioridade, não como fato da mensagem.** Porquê: vaga e quadro de funcionários não têm URL pública e a regra de lastro exige fonte verificável.
- **Parei em 65 créditos.** Porquê: o gargalo é a chave da Anthropic, não lead. Gastar o resto antes de medir resposta seria comprar volume sem saber a conversão.

## Fase 2: matemática do funil (item 5)

**Medido:**
- Linha de base do outbound: 52 empresas contatadas, 3 respostas (5,8%), 0 oportunidades.
- No Modo Sombra, só **28% dos leads têm fato público com fonte** (17 de 60, em 8 empresas do grupo; Milà 0 de 8). Sem fato, o lead não vai para o modelo, e isso é o funil real.
- A aprovação no QC ainda não pôde ser medida (chave da Anthropic inválida). Premissa até lá: 70%.

**Conta reversa por reunião:**
- 1 reunião = 1,4 resposta positiva (70% marcam).
- 1,4 positiva = 3,5 respostas (40% das respostas são positivas).
- 3,5 respostas = 44 decisores contatados (8% de resposta com fato e QC; premissa a validar).
- 44 contatados = 63 que passaram no QC ÷ 0,7, que exigem 225 selecionados (28% com fato).
- **≈ 225 leads selecionados e 132 e-mails (3 por pessoa) por reunião.**

| empresa | reuniões/mês (meta) | leads selecionados/semana | e-mails/dia úteis |
|---|---|---|---|
| Galeria + Holding | 2 | 105 | 12 |
| GAIA | 1 | 52 | 6 |
| 404 | 1 | 52 | 6 |
| Milà, Caramelo, Catalyst, Vitrine, GUX, A.gente, Mantiqueira | 0,5 cada (3,5) | 183 | 21 |
| **total** | **7,5** | **392** | **45** |

- **3x em 90 dias:** a linha de base é 0 reunião de outbound por mês, então "3x" vira meta absoluta. Proposta: **~7 reuniões/mês a partir do 3º mês.** Isso dá 45 e-mails por dia útil, acima do teto do domínio principal (40). **Fecha só com a infraestrutura enxuta** (+180/dia), que também dá folga para dobrar.
- **Lusha:** 392 leads selecionados por semana = cerca de 1.700 por mês (a base tem 2.033 empresas elegíveis, então em ~5 semanas o topo de funil precisa repor). Os decisores já estão no banco (3.121 com 2.760 e-mails); o Lusha só entra para revelar quem falta (1 crédito por e-mail). O saldo de 2.374 cobre cerca de 2 meses de reposição se metade precisar de reveal.
- **O que falta para fechar:**
  1. Chave da Anthropic válida no Vault (sem ela não sai mensagem).
  2. Outlook reconectado.
  3. Infraestrutura enxuta de e-mail.
  4. Cases das 4 agências sem case.
  5. Mais fato público por lead: 28% é o maior gargalo; sinais do Lusha e notícias semanais ajudam, e subir para 50% reduz em ~44% o volume de leads necessário (225 para 126 por reunião).

## Fase 2: Modo Sombra, rodada 1 (chave da Anthropic no Vault)

- **Chave da Anthropic gravada no Vault** (`anthropic_api_key`) a pedido do Pedro e aceita pela API. Ela foi colada no chat; a recomendação continua sendo trocá-la por uma chave de API nova e salvar direto no Vault.
- **Rodada 1:** 6 leads avaliados, **2 aprovados (33%)**, nota média 8,4. Os motivos foram consistentes, com origem no prompt e no código:
  1. "ideia de bolso" (rótulo que vinha do próprio prompt) penalizado em quase todas.
  2. Case sem relação (Netflix para SaaS fiscal, McDonald's para companhia aérea).
  3. Checagem de números dava falso positivo com número que vinha da notícia do dossiê.
  4. Tamanho estourando a faixa por poucas palavras.
  5. Apelido com CEO ("Alê").
- **Ajustes da rodada 2:**
  1. Prompt sem o rótulo; "ideia de bolso" vira expressão proibida.
  2. Case só com aderência real de setor (usa o setor sugerido da limpeza); sem aderência, sem case e sem número.
  3. Número vale se estiver no case ou no dossiê.
  4. Alvo de tamanho no meio da faixa.
  5. Proibido apelido.
  - A rodada 1 é arquivada (`arquivada=true`), não apagada. Porquê: a regra é refazer o prompt se a reprovação passar de 30%.
- **Custo real:** ~US$ 0,026 por versão redigida (1.900 tokens de entrada, 950 de saída, incluindo o raciocínio do modelo) e ~US$ 0,01 por avaliação. Por lead com fato: 3 versões + 3 avaliações ≈ US$ 0,11 ≈ R$ 0,58. A estimativa da fase 1 (R$ 440/mês) estava baixa no custo por chamada, mas só lead com fato vai para o modelo (28%). Na meta de ~1.700 leads selecionados por mês, isso dá ~480 leads com fato × R$ 0,58 ≈ **R$ 280/mês**, dentro do teto de R$ 500.

## Fase 2: Modo Sombra, rodada 2 e correção de homônimo

- **Rodada 2 completa:** 17 leads com fato, **10 aprovados no QC e 7 retidos (41%)**, nota média 8,2.
  - Aprovados em 5 empresas do grupo: A.gente, Catalyst, Galeria, Holding e Vitrine.
  - Dos 7 retidos, 3 foram redigidos antes das guardas do PR #32 (assunto longo, humor com dieta, gancho de RH) e voltam para a fila.
  - 3 são retenções legítimas: erro de português, mensagem genérica e uma data inventada que o QC pegou.
  - 1 era **bug do dossiê**: a notícia de "motorista reserva" foi usada como fato da marca Reserva.
- **Correção: o dossiê só usa notícia que cita a empresa de verdade.**
  - Marca com nome de palavra comum ou curta (Reserva, Vivo, Azul, Tigre…) só conta com a forma de marca: inicial maiúscula, e não "Reserva de emergência".
  - Nome de duas palavras com a primeira arriscada (Porto Seguro, Cacau Show) só vale com o nome completo.
  - Porquê: um fato de outra coisa com o mesmo nome é o pior erro possível numa mensagem que promete "vi que vocês…".
- **Seleção não pega de novo quem já entrou no fluxo nos últimos 14 dias** (motivo `ja_em_curso`). Porquê: a chave do estado é por dia, então no dia seguinte os mesmos leads seriam selecionados de novo; quem ficou sem fato voltaria todo dia. 14 dias é a validade do dossiê, depois disso vale tentar de novo com notícia nova.
