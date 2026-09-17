# Cowork Outlook — Instruções para o Assistente

## Contexto

O assistente lê `crm_fila` (status=`aprovado`) e gera rascunhos no Outlook com assinatura
Pedro Ica. Ao fim do dia, cruza os rascunhos que sumiram da pasta Rascunhos para marcar
`enviado` e captura respostas/bounces da caixa de entrada.

---

## Tabelas relevantes

| Tabela | Papel |
|--------|-------|
| `crm_fila` | Fila de prospecção — fonte dos rascunhos |
| `crm_decisores` | Dados do destinatário (email, nome, cargo) |
| `crm_empresas` | Nome e setor da empresa |
| `crm_toques` | Log imutável de cada ação de contato |
| `crm_agencias` | Nome e assinatura da agência remetente |

Campos de `crm_fila` usados nesta rotina:

```
id, agencia_id, agencia_slug, empresa_id, decisor_id,
canal, etapa, status,           -- canal = 'email'
assunto, corpo,
thread_ref,                     -- Message-ID do email anterior (reply)
rascunho_outlook_id,            -- preenchido ao criar o rascunho
enviado_em, aberto_em, respondido_em,
contexto_para_aprovacao
```

---

## 1 — Criar rascunhos (manhã, 08h30)

### Pré-condição
- `crm_fila.status = 'aprovado'` AND `canal = 'email'` AND `rascunho_outlook_id IS NULL`

### Passos

1. **Buscar itens aprovados sem rascunho:**
   ```sql
   SELECT f.*, d.email, d.nome AS decisor_nome, d.cargo,
          e.nome AS empresa_nome, e.setor,
          a.assinatura_email
   FROM crm_fila f
   JOIN crm_decisores d ON d.id = f.decisor_id
   JOIN crm_empresas  e ON e.id = f.empresa_id
   JOIN crm_agencias  a ON a.id = f.agencia_id
   WHERE f.status = 'aprovado'
     AND f.canal  = 'email'
     AND f.rascunho_outlook_id IS NULL
   ORDER BY f.criado_em ASC
   LIMIT 30;
   ```

2. **Para cada item**, abrir Outlook → Novo email (ou Responder ao thread se `thread_ref` preenchido):
   - **Para (To):** `d.email`
   - **Assunto:** `f.assunto`  
     — se `thread_ref` não for nulo: manter assunto original, prefixar `Re: `
   - **Corpo:**
     ```
     {f.corpo}

     {a.assinatura_email}
     ```
   - **Se thread_ref preenchido:** localizar o email original pelo Message-ID e usar
     "Responder" para manter a thread — não criar novo email avulso.

3. **Salvar como rascunho** (não enviar).

4. **Capturar o Message-ID** do rascunho salvo no Outlook
   (Propriedades do email → campo `Message-ID` ou via Graph API: `GET /me/mailFolders/Drafts/messages?$filter=subject eq '...'`).

5. **Atualizar Supabase:**
   ```sql
   UPDATE crm_fila
   SET rascunho_outlook_id = '<message-id>',
       status = 'rascunho_outlook'
   WHERE id = '<fila_id>';
   ```

### Sucesso
Todos os itens aprovados têm `rascunho_outlook_id` preenchido e `status = 'rascunho_outlook'`.

---

## 2 — Marcar enviado (noite, 20h — cruzar desaparecidos)

O Outlook não notifica quando um rascunho é enviado manualmente por Pedro.
A rotina detecta pelo desaparecimento da pasta Rascunhos.

### Passos

1. **Listar rascunhos ativos no Supabase:**
   ```sql
   SELECT id, rascunho_outlook_id, decisor_id, empresa_id
   FROM crm_fila
   WHERE status = 'rascunho_outlook'
     AND canal  = 'email';
   ```

2. **Para cada `rascunho_outlook_id`**, verificar via Graph API se o rascunho ainda existe:
   ```
   GET /me/messages/{rascunho_outlook_id}
   ```
   — se retornar 404: foi enviado (ou deletado pelo Pedro).

3. **Se desapareceu:**
   ```sql
   UPDATE crm_fila
   SET status     = 'enviado',
       enviado_em = NOW()
   WHERE id = '<fila_id>';

   INSERT INTO crm_toques (decisor_id, empresa_id, agencia_id, canal, tipo, fila_id, em)
   VALUES ('<decisor_id>', '<empresa_id>', '<agencia_id>', 'email', 'enviado', '<fila_id>', NOW());
   ```

4. **Se ainda existe:** nada a fazer (Pedro ainda não enviou).

### Sucesso
Todos os rascunhos enviados têm `status = 'enviado'` e toque registrado.

---

## 3 — Ler respostas e bounces (noite, 20h15)

### Respostas
1. Buscar emails na caixa de entrada nas últimas 24h cujo `In-Reply-To` corresponda
   a `thread_ref` de algum item em `crm_fila`:
   ```
   GET /me/mailFolders/Inbox/messages?$filter=receivedDateTime ge <24h_ago>
   ```

2. Para cada resposta encontrada:
   ```sql
   UPDATE crm_fila
   SET status         = 'respondido',
       respondido_em  = '<data_email>',
       thread_ref     = '<message-id do email de resposta>'
   WHERE rascunho_outlook_id = '<in-reply-to>';

   INSERT INTO crm_toques (..., tipo = 'respondido', em = '<data_email>');
   ```

3. Mover card do kanban para coluna `Respondeu`:
   ```sql
   UPDATE crm_decisores
   SET etapa_cadencia = 'respondeu',
       ultimo_toque_em = '<data_email>'
   WHERE id = '<decisor_id>';
   ```

### Bounces (NDR)
1. Detectar emails com `subject LIKE 'Undeliverable%' OR 'Delivery failed%'` nas últimas 24h.

2. Para cada bounce:
   ```sql
   UPDATE crm_decisores
   SET email_valido = false,
       atualizado_em = NOW()
   WHERE email = '<email_bounced>';

   UPDATE crm_fila
   SET status = 'bounce'
   WHERE rascunho_outlook_id = '<message-id>';
   ```

### Sucesso
Respostas em `status = 'respondido'`; bounces com `email_valido = false`.

---

## Variáveis de ambiente necessárias (Vercel / .env)

| Variável | Valor |
|----------|-------|
| `OUTLOOK_CLIENT_ID` | App Registration Azure AD |
| `OUTLOOK_CLIENT_SECRET` | Secret do App Registration |
| `OUTLOOK_TENANT_ID` | Tenant do Pedro |
| `OUTLOOK_REFRESH_TOKEN` | Token OAuth com scope `Mail.ReadWrite` |

> **Nota:** O refresh token deve ser renovado a cada 90 dias. Salvar data de expiração
> em `crm_config` (chave `outlook_token_expira_em`).
