# CONTRATO_CRM_FILA.md

Documento de referência para qualquer sistema que leia ou grave em `crm_fila`.
Atualizar sempre que uma nova coluna, status ou canal for adicionado.

---

## Colunas obrigatórias no INSERT

| Coluna | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `empresa_id` | uuid | Sim | FK → crm_empresas.id |
| `decisor_id` | uuid | Sim | FK → crm_decisores.id |
| `canal` | text | Sim | Ver valores válidos abaixo |
| `etapa` | text | Sim | Ver valores válidos abaixo |
| `corpo` | text | Sim (email/wa/li) | Texto da mensagem |
| `status` | text | Sim | Sempre `'rascunho'` no insert |
| `gerado_em` | timestamptz | Sim | Em UTC; exibir convertido para America/Sao_Paulo |
| `agencia_id` | uuid | Recomendado | FK → crm_agencias.id — obrigatório para aparecer na aba correta |
| `agencia_slug` | text | Recomendado | Slug textual da agência (ex: `'404'`, `'holding'`) |

## Valores válidos: status

| Valor | Significado |
|---|---|
| `rascunho` | Gerado pelo Cowork ou cron, aguarda aprovação |
| `aprovado` | Aprovado pelo usuário, pronto para enviar |
| `enviado` | Usuário clicou "Enviei" |
| `pulado` | Usuário pulou (motivo_pulo opcional) |
| `erro` | Falha ao gerar ou enviar |

## Valores válidos: canal

| Valor | Aba na tela |
|---|---|
| `email` | Email |
| `whatsapp` | WhatsApp |
| `linkedin` | LinkedIn |
| `linkedin_convite` | LinkedIn (alias legado) |
| `linkedin_mensagem` | LinkedIn (alias legado) |

Qualquer outro valor aparece no aviso "X itens fora dos filtros" e NÃO é exibido nas abas.

## Valores válidos: etapa

| Valor | Significado |
|---|---|
| `etapa1` | Primeira abordagem |
| `etapa2` | Follow-up (5 a 10 dias sem resposta) |
| `etapa3` | Segundo follow-up |

## Exemplo de INSERT mínimo válido

```json
{
  "empresa_id": "uuid-da-empresa",
  "decisor_id": "uuid-do-decisor",
  "agencia_id": "uuid-da-agencia",
  "agencia_slug": "holding",
  "canal": "email",
  "etapa": "etapa1",
  "assunto": "Assunto do e-mail",
  "corpo": "Corpo do e-mail...",
  "status": "rascunho",
  "gerado_em": "2026-09-23T09:00:00Z"
}
```

## Regras de negócio (resumo)

- Uma empresa recebe abordagem de uma única agência por semana.
- Máximo 2 decisores por empresa por semana.
- Nunca criar item em `rascunho` para decisor que já tem um item em `rascunho` ou `aprovado`.
- Clientes da carteira (`crm_carteira_clientes`) nunca entram no frio, só em upsell.
- Texto: email etapa1 até 90 palavras, follow-up até 50, WhatsApp até 40, LinkedIn até 280 caracteres.

## Histórico de correções

| Data | Problema | Correção |
|---|---|---|
| 2026-09-23 | `agencia_id` sem FK → join PostgREST retornava erro 400 → fila vazia na tela | Adicionada FK `crm_fila_agencia_id_fkey` |
| 2026-09-23 | canal `'linkedin'` não aparecia na aba LinkedIn (código filtrava só `linkedin_convite`/`linkedin_mensagem`) | Filtro atualizado para incluir `'linkedin'` |
