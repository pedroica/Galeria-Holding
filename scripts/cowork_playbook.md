# Cowork Playbook — Rotinas Diárias / Semanais

## Índice de rotinas

| Rotina | Horário | Canais |
|--------|---------|--------|
| [Manhã — Rascunhos Outlook](#manhã) | 08h30 | Email |
| [Manhã — LinkedIn Convites](#linkedin-convites) | 09h00 | LinkedIn |
| [LinkedIn — Mensagens pós-aceite](#linkedin-mensagens) | Ao longo do dia | LinkedIn |
| [Noite — Respostas Outlook e WhatsApp](#noite) | 20h00 | Email + WA |
| [Agenda — Proposta de slots](#agenda) | Quando solicitado | Email/WA/LI |
| [Pré-reunião — Briefing](#pre-reuniao) | 1h antes | — |
| [Pós-reunião — Atualização de card](#pos-reuniao) | Após reunião | — |
| [Sexta — Relatório semanal para parceiros](#sexta) | 17h00 | Email |
| [Semestral — Email Boaventura](#semestral) | 1×/semestre | Email |

---

## Manhã — Rascunhos Outlook {#manhã}

**Horário:** 08h30  
**Duração estimada:** 20 min  

**Tabelas lidas:** `crm_fila`, `crm_decisores`, `crm_empresas`, `crm_agencias`  
**Tabelas escritas:** `crm_fila` (campos: `rascunho_outlook_id`, `status`)

**Passos:**
1. Buscar `crm_fila` onde `status = 'aprovado'` e `canal = 'email'` e `rascunho_outlook_id IS NULL` (máx 30).
2. Para cada item, criar rascunho no Outlook — ver instruções detalhadas em [`cowork_outlook.md`](cowork_outlook.md).
3. Se `thread_ref` preenchido: usar Responder na thread, não novo email.
4. Salvar rascunho → capturar `rascunho_outlook_id` → atualizar `crm_fila.status = 'rascunho_outlook'`.

**Critério de sucesso:** Pasta Rascunhos do Outlook tem os emails; `crm_fila` mostra `rascunho_outlook` para cada um.

---

## LinkedIn — Convites {#linkedin-convites}

**Horário:** 09h00  
**Duração estimada:** 15 min  
**Limite diário LinkedIn:** 20 convites  

**Tabelas lidas:** `crm_fila` (canal=`linkedin_convite`, status=`aprovado`)  
**Tabelas escritas:** `crm_fila` (status), `crm_toques`, `crm_decisores` (ultimo_toque_em)

**Passos:**
1. Buscar até 20 itens: `crm_fila` onde `canal = 'linkedin_convite'` e `status = 'aprovado'`.
2. Abrir LinkedIn **logado como Pedro** no browser (conta pessoal/profissional da agência).
3. Para cada decisor, buscar perfil via `crm_decisores.linkedin_url`.
4. Clicar "Conectar" → "Adicionar nota" → colar `crm_fila.corpo` (máx 300 chars).
5. Enviar.
6. Atualizar Supabase:
   ```sql
   UPDATE crm_fila SET status = 'enviado', enviado_em = NOW() WHERE id = '<id>';
   INSERT INTO crm_toques (..., canal = 'linkedin_convite', tipo = 'enviado');
   UPDATE crm_decisores SET ultimo_toque_em = NOW() WHERE id = '<decisor_id>';
   ```

**Critério de sucesso:** 20 convites enviados, `crm_fila` com `status = 'enviado'`, toques registrados.

---

## LinkedIn — Mensagens pós-aceite {#linkedin-mensagens}

**Horário:** Ao longo do dia (quando notificado que convite foi aceito)  

**Tabelas lidas:** `crm_decisores` (etapa_cadencia = 'convite_aceito'), `crm_fila` (canal=`linkedin_mensagem`)  
**Tabelas escritas:** `crm_fila`, `crm_toques`, `crm_decisores`

**Passos:**
1. Detectar novos aceites: `crm_decisores` com `etapa_cadencia = 'convite_aceito'` e sem mensagem enviada.
2. Buscar ou gerar item em `crm_fila` para `linkedin_mensagem` (etapa 2).
3. Enviar mensagem via LinkedIn Messages (browser logado).
4. Atualizar status em `crm_fila` e registrar toque.
5. Avançar decisor: `etapa_cadencia = 'mensagem_enviada'`.

**Critério de sucesso:** Toda conexão nova recebe mensagem de abertura em até 24h.

---

## Noite — Respostas Outlook e WhatsApp {#noite}

**Horário:** 20h00  
**Duração estimada:** 30 min  

### Email (Outlook)

**Tabelas escritas:** `crm_fila` (status, enviado_em, respondido_em, thread_ref), `crm_toques`, `crm_decisores`

1. Cruzar rascunhos desaparecidos → marcar `enviado` (ver [`cowork_outlook.md §2`](cowork_outlook.md)).
2. Ler respostas na caixa de entrada → marcar `respondido`, atualizar `thread_ref` (ver [`cowork_outlook.md §3`](cowork_outlook.md)).
3. Detectar bounces → marcar `email_valido = false`.

### WhatsApp

**Tabelas lidas:** `crm_fila` (canal=`whatsapp`, status=`enviado`)  
**Tabelas escritas:** `crm_fila`, `crm_toques`, `crm_decisores`

1. Abrir WhatsApp Desktop (app nativo, Pedro logado).
2. Para cada conversa com resposta recebida hoje:
   - Identificar decisor pelo número `crm_decisores.wa`.
   - Atualizar `crm_fila.status = 'respondido'`, `respondido_em = NOW()`.
   - Registrar toque.
   - Se decisor pergunta sobre reunião → ir para rotina [Agenda](#agenda).

**Critério de sucesso:** Todos os envios e respostas do dia registrados; nenhum card pendente sem status.

---

## Agenda — Proposta de slots {#agenda}

**Gatilho:** Resposta (email, WA, LinkedIn) em que o prospect demonstra interesse em conversar.

**Tabelas lidas:** `crm_decisores`, `crm_empresas`, `crm_agencias`  
**Tabelas escritas:** `crm_fila` (status), `crm_decisores` (etapa_cadencia), `crm_toques`

**Passos:**
1. Gerar 3 slots disponíveis (verificar agenda do Pedro no Outlook Calendar).
2. Propor via mesmo canal (email reply / WA / LinkedIn message):
   ```
   Ótimo! Tenho esses horários disponíveis esta semana:
   • Terça, 14h às 14h30
   • Quarta, 10h às 10h30
   • Quinta, 16h às 16h30
   Qual funciona melhor para você?
   ```
3. Atualizar `crm_decisores.etapa_cadencia = 'agendando'`.
4. **Quando prospect confirmar slot:**
   - Criar evento no Outlook Calendar com o decisor e Pedro.
   - Registrar data/hora em `crm_decisores.reuniao_em` (campo a criar se não existir).
   - Mover card para coluna **Reunião** no kanban:
     ```sql
     UPDATE crm_decisores SET etapa_cadencia = 'reuniao' WHERE id = '<id>';
     ```
   - Registrar toque `tipo = 'reuniao_agendada'`.

**Critério de sucesso:** Evento criado no calendário; card na coluna Reunião.

---

## Pré-reunião — Briefing {#pre-reuniao}

**Horário:** 1h antes da reunião  
**Duração estimada:** 10 min  

**Tabelas lidas:** `crm_empresas`, `crm_decisores`, `crm_noticias`, `crm_toques`, `crm_agencias`, `crm_cases`

**Passos:**
1. Puxar histórico completo do decisor: toques anteriores, canal, respostas, notas.
2. Buscar notícias recentes em `crm_noticias` para a empresa (últimas 4 semanas).
3. Selecionar 1-2 cases da agência mais relevantes para o setor.
4. Gerar briefing de 1 página:
   - Empresa: tamanho, setor, sinal recente
   - Decisor: cargo, histórico de contato
   - Contexto: por que entrou em contato, o que respondeu
   - Cases: 2 referências do portfólio
   - Possíveis objeções e respostas
5. Enviar briefing para Pedro via email ou salvar em `crm_decisores.notas`.

**Critério de sucesso:** Pedro tem o briefing 1h antes; nenhum dado genérico sem personalização.

---

## Pós-reunião — Atualização de card {#pos-reuniao}

**Horário:** Até 2h após a reunião  

**Tabelas escritas:** `crm_decisores`, `crm_toques`, `crm_fila`

**Passos:**
1. Pedro dita ou escreve notas da reunião (canal, resultado, próximos passos).
2. Atualizar `crm_decisores.notas` com resumo.
3. Registrar toque `tipo = 'reuniao_realizada'` com `observacao = '<resumo>'`.
4. Definir próxima etapa:
   - Interesse confirmado → `etapa_cadencia = 'proposta'`; criar tarefa de envio de proposta
   - Precisa de mais tempo → `etapa_cadencia = 'follow_up'`; agendar lembrete
   - Não tem fit → `etapa_cadencia = 'off'`; registrar motivo em `crm_decisores.notas`
5. Se acordo fechado → atualizar `crm_empresas.cliente_ativo = true`, `agencia_atendendo = '<agencia_id>'`.

**Critério de sucesso:** Card atualizado; próximo passo definido e registrado.

---

## Sexta — Relatório semanal para parceiros {#sexta}

**Horário:** 17h00 toda sexta  
**Destinatários:** Parceiros / sócios das agências (lista em `crm_agencias.email_parceiro`)

**Tabelas lidas:** `crm_fila`, `crm_toques`, `crm_decisores`, `crm_agencias`

**Passos:**
1. Agregar métricas da semana por agência:
   ```sql
   SELECT agencia_id,
     COUNT(*) FILTER (WHERE status = 'enviado')     AS enviados,
     COUNT(*) FILTER (WHERE status = 'respondido')  AS respostas,
     COUNT(*) FILTER (WHERE etapa_cadencia = 'reuniao') AS reunioes
   FROM crm_fila
   WHERE enviado_em >= date_trunc('week', NOW())
   GROUP BY agencia_id;
   ```
2. Gerar email com tabela de resultados por agência.
3. Assunto padrão: `Relatório semanal Galeria — semana de <data_seg> a <data_sex>`.
4. Salvar como rascunho no Outlook → Pedro revisa e envia.
5. Registrar envio em `crm_toques` (tipo = `relatorio_semanal`).

**Critério de sucesso:** Rascunho no Outlook até 17h; parceiros recebem relatório toda sexta.

---

## Semestral — Email Boaventura {#semestral}

**Frequência:** 2× por ano (Janeiro e Julho)  
**Destinatário:** Boaventura (contato em `crm_decisores` com tag `boaventura`)

**Tabelas lidas:** `crm_empresas`, `crm_cases`, `crm_toques` (últimos 6 meses)

**Passos:**
1. Compilar resultados dos últimos 6 meses: novas contas, receita gerada, cases de destaque.
2. Gerar email de atualização institucional — tom formal, foco em resultados concretos.
3. Incluir: top 3 cases do semestre, meta para o próximo semestre, pedido de feedback.
4. Salvar como rascunho no Outlook → Pedro revisa.
5. Registrar envio em `crm_toques`.

**Critério de sucesso:** Email enviado dentro dos meses de Janeiro e Julho; rascunho disponível 1 semana antes.

---

## Notas operacionais

- **Mailto como atalho:** links `mailto:` em `crm_fila` abrem o Outlook pre-preenchido mas **não** substituem esta rotina — o rascunho criado via mailto não tem `rascunho_outlook_id` e não será rastreado. Usar esta rotina para todos os emails rastreáveis.
- **Limite LinkedIn:** 20 convites/dia é limite seguro da plataforma. Nunca exceder.
- **WhatsApp:** usar WhatsApp Desktop (Mac app) — não WhatsApp Web — para evitar desconexões.
- **Thread continuidade:** sempre que `crm_fila.thread_ref` estiver preenchido, o email vai como Resposta na thread existente. Isso preserva contexto para o prospect.
- **LGPD:** nunca salvar em `crm_toques` conteúdo integral do email do prospect — apenas metadata (data, tipo, canal).
