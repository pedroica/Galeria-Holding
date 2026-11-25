# Agente comercial: como funciona (atualizado em 25/11/2026)

## Resumo de 30 segundos
- **De madrugada (23h30 às 7h, horário de Brasília)** o agente escolhe as pessoas, pesquisa notícias de cada empresa, decide se vale abordar, escreve e revisa. O e-mail aprovado vira **rascunho no seu Gmail**.
- **Meta: 20 rascunhos de e-mail por dia.** Se não houver 20 contatos qualificados, ele entrega menos e não inventa destinatário. Os que sobrarem passam na frente na noite seguinte.
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

O relógio é o pg_cron do Supabase (jobs `sdr-selecao`, `sdr-pipeline`, `sdr-respostas`), autenticado pelo segredo no Vault. Não depende de você abrir o sistema.

## As duas trilhas de mensagem
1. **Com fato:** há notícia com fonte sobre a empresa. A mensagem parte dela ("vi que a X anunciou…") e o controle de qualidade confere a URL.
2. **Sem fato (nova):** não há notícia, mas a empresa tem encaixe com o grupo (3 ou mais estrelas) e a pessoa tem cargo de decisão (marketing, marca, CEO, diretoria, comercial…). A mensagem parte do desafio do cargo naquele setor. Ela **não pode afirmar nada específico sobre a empresa**: o revisor e uma checagem por código reprovam "vi que", "li que", "anunciou", "lançou", "notícia" etc. No painel essas aparecem com a etiqueta "setor".

Lead sem fato e sem encaixe não gasta modelo e fica de fora.

## Proteções
- **Duplicidade:** a mesma pessoa não volta por 14 dias, a mesma empresa recebe só 1 primeiro contato por semana, e empresa tocada por qualquer agência nos últimos 30 dias fica de fora. O rascunho nunca é criado duas vezes (confere `outlook_message_id`), e o registro de envio usa filtro de status (idempotente).
- **Follow-up (novo):** quando você envia o rascunho pelo próprio Gmail, o agente percebe em até 15 min, registra o toque e agenda o próximo passo da cadência (D3 WhatsApp, D7 e D14 e-mail). Se você apagar o rascunho sem enviar, o item sai da fila. "Enviei" no WhatsApp também agenda o próximo passo.
- **Custo:** teto de US$ 5 por dia no modelo (`sdr_custo_dia_max_usd`). Ao bater, a noite para e retoma no dia seguinte.
- **Falhas:** um rascunho que falha é tentado até 3 vezes. Toda execução grava início e fim em `crm_logs`, e os erros aparecem no painel e na tela Atividade.
- **Pânico:** o botão vermelho "Pausar tudo", no topo.

## Ajustes sem deploy (tabela `crm_configuracoes`)

| Chave | Padrão | O que faz |
|---|---|---|
| `sdr_meta_rascunhos_dia` | 20 | Rascunhos de e-mail por dia (0 desliga a produção) |
| `sdr_custo_dia_max_usd` | 5 | Teto de gasto do modelo por dia (0 = sem teto) |
| `sdr_sem_fato` | true | Liga a trilha sem fato |
| `sdr_sem_fato_min_estrelas` | 3 | Encaixe mínimo para a trilha sem fato |
| `sdr_nota_encaixe_min_sem_fato` | 6 | Nota mínima do estrategista na trilha sem fato (com fato: `sdr_nota_encaixe_min`, 8) |
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
