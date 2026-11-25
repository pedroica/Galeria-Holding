# Agente comercial: como funciona (atualizado em 25/11/2026)

## Resumo de 30 segundos
- **De madrugada (23h30 às 7h, horário de Brasília)** o agente escolhe as pessoas, pesquisa notícias de cada empresa, decide se vale abordar, escreve e revisa. O e-mail aprovado vira **rascunho no seu Gmail**.
- **Meta: até 20 rascunhos de e-mail por dia, só de oportunidades reais** (notícia com fonte ou contexto no CRM). Se não houver 20, ele entrega menos e não inventa nada.
- **Nada é enviado sozinho.** Você abre o Gmail, revisa e envia. O Piloto Automático segue desligado.
- **WhatsApp a custo zero:** a mensagem fica pronta na Fila → WhatsApp. "▶ Sequência" abre uma conversa por vez já com o texto; você aperta enviar.
- **Acompanhe tudo na tela Hoje**, que agora é a tela inicial, no painel "Agente · hoje".

## O fluxo, etapa por etapa

| Hora (BRT) | O que roda | Onde fica registrado |
|---|---|---|
| 23h30 | Seleção de até 80 leads. Inclui os follow-ups vencidos e completa com o que sobrou da noite anterior. | `crm_sdr_estado`, `crm_logs` (cron:sdr-selecao) |
| 23h35–07h, a cada 3 min | Dossiê (notícias), estrategista (vale abordar? qual tese?), redação, controle de qualidade e rascunho no Gmail | `crm_dossies`, `crm_sdr_mensagens`, `crm_fila`, `crm_logs` |
| a qualquer hora | E-mail aprovado ainda sem rascunho vira rascunho assim que o Gmail estiver conectado | `crm_fila.outlook_message_id` (id do rascunho), `rascunho_criado_em`, `outlook_draft_link` |
| dias úteis, 08h–20h, a cada 15 min | Lê respostas (interesse, não agora, bounce, opt-out) e confere o que você enviou ou apagou no Gmail | `crm_sdr_respostas`, `crm_toques`, `crm_logs` (cron:sdr-respostas) |

O relógio é o pg_cron do Supabase (jobs `sdr-selecao`, `sdr-pipeline`, `sdr-respostas`, `sdr-vigia`), autenticado pelo segredo no Vault. Roda no servidor, com o navegador fechado. Prova: na noite de 23/11, a seleção das 23h30 escolheu 80 leads e processou tudo até 00h18 sem ninguém abrir o sistema.

## O que conta como oportunidade (e o que não conta)
O agente só escreve quando há um **motivo real** para falar com aquela pessoa agora:
1. **Momento:** notícia com fonte sobre a empresa (lançamento, expansão, troca de liderança…), lida de novo a cada lead. A mensagem parte dela, e o revisor confere a URL.
2. **Relacionamento e contexto (CRM):** a pessoa já conversou com o grupo (respondeu, mensagem recebida, reunião), há uma oportunidade da empresa parada em Wishlist ou Pausado há mais de 30 dias, ou ela pediu "agora não" e a pausa venceu. A mensagem retoma esse contexto, sem inventar detalhe, e aparece no painel com a etiqueta "retomada".

**Não conta:** setor e cargo sozinhos, ou um e-mail anterior que ficou sem resposta (isso seria insistência). Sem momento e sem contexto, não há mensagem.

Depois disso o **estrategista** decide se vale abordar, com qual tese e qual agência. Exige nota 8 com notícia e 7 com contexto. O **revisor** dá nota a cada texto; abaixo de 8 em qualquer critério, a mensagem fica retida. Quem respondeu nos últimos 90 dias continua com você: o agente não entra no meio de uma conversa.

**Volume realista:** com a base de hoje, isso deve dar **de 5 a 15 rascunhos bons por dia**, não 20 todos os dias. O agente não completa a meta com mensagem fraca. Para chegar a 20 com qualidade, as alavancas são:
- **aceitar os candidatos do topo de funil** na aba SDR (107 esperando, nenhum aceito);
- **cadastrar cases** das agências que não têm nenhum (Caramelo, Catalyst, Mantiqueira, GUX);
- **registrar no CRM** reuniões e conversas que acontecem fora do e-mail, porque elas viram contexto.


## Produzir agora, fila e decisões (25/11)
- **Botão "PRODUZIR RASCUNHOS AGORA" (tela Hoje):** chama a mesma RPC do relógio (`sdr_preparar_agora`), que abre uma janela de 45 min no mesmo pipeline. Não existe um segundo mecanismo. O progresso exibido é lido do banco (estado de cada lead, fila e logs): iniciando, pesquisando, elaborando, revisando, criando no Gmail, concluída. Falhas aparecem com a etapa e o erro. Se a meta do dia já foi batida, o botão avisa e não roda.
- **Meta diária e produção automática:** ficam editáveis na tela Hoje (admin). Elas mexem em `sdr_meta_rascunhos_dia` e `sdr_relogio_ativo`.
- **Fila → Oportunidades (aba padrão):** empresa, contato, cargo, e-mail, motivo, prioridade, assunto, situação no Gmail, datas e link do rascunho. Ações:
  - **Aprovar:** entra na cadência. Não envia nada.
  - **Rejeitar:** pede o motivo, encerra os follow-ups daquela pessoa e não apaga nada, nem o rascunho no Gmail. A pessoa não volta na seleção.
  - **Editar:** grava no rascunho real do Gmail (`drafts.update`). Se o Gmail recusar, nada muda no CRM.
  - **Abrir no Gmail.**
  - **Marquei como enviado:** registra a data, com a opção "aproximada". O follow-up é agendado em até 15 min.
- **Três eixos que não se misturam** (view `crm_agente_oportunidades_v`):
  - produção: rascunho no Gmail, criando ou erro;
  - decisão: aguardando, aprovado ou rejeitado;
  - envio: não enviado, enviado (confirmado ou estimado), follow-up agendado ou concluído.

  Criar o rascunho nunca conta como envio.
- **Rascunho real e idempotente:**
  - cada item da fila gera um rascunho com `Message-ID` próprio (`<fila-ID@agente.galeriaholding.crm>`), em texto e HTML;
  - antes de criar, o agente procura por esse ID no Gmail e, se achar, adota o rascunho existente;
  - só conta como produzido com o id devolvido pela API **e** gravado no banco;
  - erro 429/5xx tem uma nova tentativa; erro de autenticação não é repetido às cegas;
  - são até 3 tentativas por item, e cada uma fica registrada no `crm_logs`.

## Proteções
- **Duplicidade:** a mesma pessoa não volta por 14 dias, a mesma empresa recebe só 1 primeiro contato por semana, e empresa tocada por qualquer agência nos últimos 30 dias fica de fora. O rascunho nunca é criado duas vezes (confere `outlook_message_id`), e o registro de envio usa filtro de status (idempotente).
- **Follow-up (novo):** quando você envia o rascunho pelo próprio Gmail, o agente percebe em até 15 min, registra o toque e agenda o próximo passo da cadência (D3 WhatsApp, D7 e D14 e-mail). Se você apagar o rascunho sem enviar, o item sai da fila. "Enviei" no WhatsApp também agenda o próximo passo.
- **Custo:** teto de US$ 5 por dia no modelo (`sdr_custo_dia_max_usd`). Ao bater, a noite para e retoma no dia seguinte.
- **Falhas:** um rascunho que falha é tentado até 3 vezes. Toda execução grava início e fim em `crm_logs`, e os erros aparecem no painel e na tela Atividade.
- **Vigia da manhã (07h30, dias úteis, pg_cron):** confere se a seleção da noite rodou, se o Gmail e a chave da IA respondem, os erros das últimas 12h e os e-mails travados. Havendo problema, registra `error` no `crm_logs` e deixa **um rascunho de aviso na sua pasta Rascunhos do Gmail**, endereçado a você, sem envio e uma vez por dia. Funciona com o navegador fechado.
- **Lead sem empresa cadastrada** sai da fila na hora. Antes ele prendia o job de dossiê, chamado a cada 3 min a noite toda.
- **Pânico:** o botão vermelho "Pausar tudo", no topo.

## Ajustes sem deploy (tabela `crm_configuracoes`)

| Chave | Padrão | O que faz |
|---|---|---|
| `sdr_meta_rascunhos_dia` | 20 | Rascunhos de e-mail por dia (0 desliga a produção) |
| `sdr_custo_dia_max_usd` | 5 | Teto de gasto do modelo por dia (0 = sem teto) |
| `sdr_trilha_contexto` | true | Liga a trilha de contexto (sem notícia, com histórico no CRM) |
| `sdr_nota_encaixe_min_contexto` | 7 | Nota mínima do estrategista na trilha de contexto (com notícia: `sdr_nota_encaixe_min`, 8) |
| `sdr_lote_max` | 80 | Leads analisados por noite |
| `sdr_relogio_ativo` | true | Liga e desliga o trabalho noturno |

## WhatsApp: por que não é automático
- Na API oficial (WhatsApp Business Platform), **todo primeiro contato precisa de um modelo de marketing aprovado e é cobrado por mensagem** (na faixa de US$ 0,07 por mensagem para o Brasil em 2026). Só a resposta dentro de 24h, depois que a pessoa escreve, é grátis. Ou seja, não é custo zero.
- Automação não oficial (bibliotecas que imitam o WhatsApp Web) viola os termos, pode bloquear o seu número e exige um servidor ligado 24h. Descartada.
- **Caminho escolhido, custo zero:** o agente escreve e aprova a mensagem, e a Fila → WhatsApp abre a conversa certa com o texto (link wa.me). Você envia, e o sistema registra o toque e agenda o follow-up. O código da API oficial continua no projeto, desligado, caso um dia valha pagar.

## Custos adicionais
- Infraestrutura: **R$ 0**. Usa Vercel Hobby, Supabase, Gmail API e o pg_cron que já existiam. Nenhum serviço novo.
- Modelo (API da Anthropic, que já estava em uso): estimativa de US$ 0,05 a 0,10 por lead que chega ao modelo, ou cerca de US$ 1,5 a 3 por dia para 20 rascunhos, limitado a US$ 5 por dia pelo teto. Na conta de R$ 5,40 por dólar, fica perto de R$ 170 a 350 por mês em dias úteis.

## Limitações conhecidas
- O horário da madrugada é fixo no banco (`sdr_pipeline_tick`, 02:35–10:00 UTC). Mudar pede um ajuste no SQL, não só na configuração.
- A detecção de envio confere o destinatário na pasta Enviados depois da criação do rascunho. Se você mandar outro e-mail para a mesma pessoa por fora, ele conta como envio do rascunho.
- Lusha e reveal continuam com o teto diário de créditos de `enriquecimento_diario_max`. Sem e-mail revelado, a pessoa não entra.
- Contas Vercel e GitHub CLI sem login nesta máquina: deploy e PR passam pelo Git e pelo navegador.

## Fase 2: inteligência, Gmail como fonte de verdade e aprendizado (26/11)

### Score de oportunidade (0-100, explicável) — `lib/sdr-score.js`
São 8 fatores, cada um com os pontos e o motivo em português:

| Fator | Peso | Como é calculado |
|---|---|---|
| Aderência ao portfólio | 15 | estrelas da empresa com as agências |
| Porte | 10 | `rank` da base, usado como **aproximação**: a base não tem receita nem funcionários, e a explicação diz isso |
| Cases e clientes do mesmo setor | 10 | case do grupo ou cliente ativo no setor |
| Gatilho público | 20 | tipo e recência do sinal, com fonte, data e por que importa |
| Oportunidade identificável | 10 | solução do portfólio que casa com o setor ou com o gatilho |
| Senioridade e área do contato | 10 | nível do cargo e se a área decide comunicação |
| Acesso | 10 | e-mail válido e WhatsApp |
| Relacionamento prévio | 15 | conversa anterior, oportunidade parada ou pausa vencida |

- **Soluções:** BrandSync, CR.IA, Catalyst, Gaia Data as a Service ou Galeria. BrandSync só entra por setor de franquia ou distribuição, ou quando o próprio fato fala de rede.
- **Seleção:** ordena pelo score. O topo de funil aceito por você continua na frente.
- **Diversidade:** primeiro no máximo 30% do lote por setor; se sobrar vaga, completa com os melhores. Continua 1 empresa por semana.
- **Estrategista:** recalcula o score com o dossiê fresco e atende os maiores primeiro.
- **Teste com 500 leads reais (26/11):**
  - score médio 37; 69 leads entre 55 e 74; nenhum acima de 75;
  - 171 com gatilho para abordar agora, 9 para retomar conversa, 320 sem motivo concreto (não abordar);
  - lote de 20 distribuído em 15 setores.
- **Tela:** área **Inteligência** no topo e score, solução, gatilho e próxima ação em cada card da Fila.

### Gmail como fonte de verdade — `lib/gmail-sync.js`
- **Incremental pela History API**, a cada 15 min, dentro do `sdr-respostas`:
  - mensagem SENT associada ao agente pelo `Message-ID` (`<fila-ID@agente.galeriaholding.crm>`) ou pela conversa do rascunho vira envio **confirmado**;
  - mensagem DRAFT nova numa conversa do agente vira "editado no Gmail".
- **Reconciliação completa:**
  - roda uma vez por dia, ou quando o `historyId` expira ou falta;
  - confere rascunho por rascunho: enviado, apagado ou duplicado (duplicado só é registrado, nada é apagado).
- **Datas de envio:**
  - `enviado_real_em` só é preenchida pela API;
  - `enviado_estimado_em` guarda o que você informou à mão;
  - a data real substitui a estimada, que continua guardada; uma estimativa nunca sobrescreve uma data real.
- **Deduplicação e auditoria:** cada evento vai uma única vez para `crm_gmail_eventos` (índice único `gmail_id + tipo`). E-mail pessoal não é registrado.
- **Pub/Sub (push):** não existe tópico Google Cloud no projeto. A History API a cada 15 min cumpre o papel sem custo.
- **Envio pelo botão do CRM:** grava a data real e o id da mensagem.

### Aprendizado comercial — `lib/sdr-aprendizado.js`
- **Eventos em `crm_aprendizado_eventos`:**
  - aprovação e rejeição, com motivo;
  - edição, com a versão original do agente e a sua versão final;
  - enviado sem alteração ou com alteração, comparando o texto que saiu do Gmail com o original.
- **O que a análise da edição classifica:** encurtou ou alongou, abertura, CTA, adjetivos, linguagem artificial, troca de solução, reescrita e assunto.
- **Job `sdr-aprendizado`** (diário às 06h, ou pelo botão "Recalcular aprendizados"):
  - transforma os eventos em **propostas** na `crm_memoria_comercial`, com status `proposto` e as evidências;
  - exige amostra mínima: 5 eventos e 40% das revisões para padrões de edição, 3 rejeições iguais, 10 envios para desempenho e 10 e-mails para o perfil;
  - desempenho é sempre registrado como correlação, e e-mail sem resposta não conta como abordagem ruim.
- **Memória comercial:** só o que está **ativo** entra no estrategista e na redação, filtrado por setor e solução. Na tela você ativa, desativa, corrige, descarta (o histórico fica) e adiciona preferências. As 3 preferências que você já deu estão ativas.
