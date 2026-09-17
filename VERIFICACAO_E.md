# VERIFICACAO_E.md — Fase E: Cockpit do Vendedor

**Data:** 2026-09-17  
**Branch:** fase-e  
**Commit base:** 14c8736 (merge D3-D4 na main)

---

## E1 — Tela Hoje

**Arquivo:** `block3.js` — função `TelaHoje()`  
**Nav:** aba "Hoje" adicionada ao topbar (primeira posição)

### O que foi implementado

| Feature | Detalhe |
|---------|---------|
| Aprovações pendentes | Conta `crm_fila.status = 'rascunho'`, decomposto por canal (email / WA / LI) |
| Enviados hoje | `crm_fila.status IN (aprovado, enviado)` com `enviado_em >= início do dia` |
| Responderam hoje | `crm_fila.status = 'respondido'` com `respondido_em >= início do dia` |
| Reuniões nesta semana | `crm_kanban.col = 'reuniao'` com `atualizado_em >= segunda da semana atual` |
| Barra de progresso do dia | Cálculo BRT horário atual → `(h - 8) / (17 - 8)` × 100% |
| Reuniões de hoje | Lista de `crm_kanban.col = 'reuniao'` com `atualizado_em >= hoje 00h` |
| Custo IA acumulado | Soma `crm_fila.custo_usd` dos rascunhos pendentes |

### Verificação

- [ ] Abrir produção → aba "Hoje" aparece no topbar
- [ ] Stats carregam sem erro no console
- [ ] Barra de progresso mostra horário BRT correto
- [ ] Contadores batem com dados reais em `crm_fila`

---

## E2 — Painel de Metas Semanal

**Arquivo:** `block3.js` — função `PainelMetas({ agencias })`  
**Localização:** Aba "Metas semanais" dentro de HoldingHome (topbar Holding → aba Metas)

### O que foi implementado

| Feature | Detalhe |
|---------|---------|
| Últimas 4 semanas | Cards semana a semana: esta semana + 3 anteriores |
| Reuniões por agência | `crm_kanban` filtrado por agencia_id × semana, meta 3/agência |
| Barra progresso 40/sem | Visual vermelho/verde conforme meta global |
| Enviados e respostas | `crm_fila` filtrado por semana: total enviados + respondidos |
| Cor por agência | Usar `color` de `ALL_AGENCIAS` para identificação |

### Verificação

- [ ] HoldingHome exibe tabs "Pipeline" e "Metas semanais"
- [ ] Aba metas mostra 4 semanas com dados corretos
- [ ] Agências com ≥ 3 reuniões aparecem em verde, < 3 em vermelho

---

## E3 — Fechamento Automático Sexta 17h

**Arquivo:** `api/cron/fechamento-sexta.js`  
**Schedule em vercel.json:** `"0 20 * * 5"` (sexta 20h UTC = 17h BRT)

### O que foi implementado

| Regra | Ação |
|-------|------|
| Cards `negociacao` sem atualização desde segunda | Movidos para `contato` com nota `[Auto]` |
| Cards `fechamento` > 14 dias sem atualização | Movidos para `negociacao` com nota `[Auto]` |
| Relatório semanal | Salvo em `crm_config.chave = 'relatorio_semanal_ultimo'` como JSON |

### Verificação

- [ ] `vercel.json` contém o cron `fechamento-sexta` com schedule `"0 20 * * 5"`
- [ ] Chamada manual na sexta retorna `ok: true` com métricas
- [ ] Cards stale movidos no Supabase após execução

---

## E4 — 5 Melhorias Autônomas em AprovacaoHoje

| # | Melhoria | Arquivo | Verificação |
|---|---------|---------|-------------|
| M1 | Estrelas no card (`★` de `contexto_para_aprovacao`) | `block3.js` | Cards com 4★ ou 5★ mostram as estrelas em âmbar |
| M2 | Botão "⏸ 7d" pausa decisor + pula item | `block3.js` | Clicar move item para fora da fila; decisor recebe `pausa_ate_em = hoje+7` |
| M3 | Auto-refresh a cada 60s | `block3.js` | Sem reload manual, fila atualiza sozinha |
| M4 | Custo USD acumulado no header | `block3.js` | Header mostra `USD 0.XXXX` somando `custo_usd` dos rascunhos |
| M5 | Keyboard nav J/K/Enter | `block3.js` | J desce, K sobe, Enter aprova item focado (fora de input/textarea) |

---

## E5 — Arquivos e Entrega

### Arquivos criados / modificados nesta fase

```
block3.js                          — TelaHoje, PainelMetas, HoldingHome tab, AprovacaoHoje M1-M5
api/cron/fechamento-sexta.js       — novo cron E3
vercel.json                        — cron fechamento-sexta adicionado
scripts/cowork_outlook.md          — Task 5: instruções Outlook para Cowork
scripts/cowork_playbook.md         — Task 5: rotinas diárias/semanais do Cowork
STATUS.md                          — Fase E marcada concluída
VERIFICACAO_E.md                   — este arquivo
```

### API modificados (Task 2-3, Fase D):

```
api/gerar-fila.js                  — CRON_SECRET + service key auth, estrelasPorEmpresa()
api/cron/gerar-fila-diario.js      — remove CRON_EMAIL/CRON_PASSWORD
api/cron/noticias-semanal.js       — usa crm_empresa_agencia_estrelas
api/cron/enriquecimento-diario.js  — usa crm_empresa_agencia_estrelas
```

### Git

| Passo | Hash |
|-------|------|
| Commit D3-D4 em fase-e | 1097ecd |
| Tag pre-fase-e | 14c8736 |
| Merge fase-e → main | 14c8736 |
| Commit Fase E (fase-e) | a definir após push |

---

## Env vars necessárias no Vercel

Para que o sistema funcione em plena capacidade:

| Variável | Status | Observação |
|---------|--------|-----------|
| `ANTHROPIC_API_KEY` | Deve existir | Necessário para gerar textos em `/api/gerar-fila` |
| `SUPA_CRM_SERVICE_KEY` | ✅ Já existe | Usado como fallback para `SUPABASE_SERVICE_ROLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Pendente Pedro | Adicionar manualmente; value = mesmo que `SUPA_CRM_SERVICE_KEY` |
| `CRON_SECRET` | Pendente Pedro | `ef3fddbce2072d7ac3893c8466d382ca352762b8357d94a3` |
| `LUSHA_API_KEY` | ✅ Já existe | Enriquecimento Lusha |

---

## Teste runtime (Task 4 — pendente)

O teste real de `/api/gerar-fila` para agência 404 com 30 emails requer:
1. Deploy em produção com código desta branch
2. Usar JWT de sessão autenticada (browser logado como Pedro)
3. Ou `CRON_SECRET` configurado no Vercel

**Como testar após deploy:**
```bash
curl -X POST https://galeria-holding.vercel.app/api/gerar-fila \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-do-browser-ou-CRON_SECRET>" \
  -d '{"agencia_slug":"14a057af-31c6-4606-8236-4c97d8067335","canais":["email"],"limite":30}'
```
Resultado esperado: `{"gerados": N, "itens": [...], "erros": [], "bloqueados": [...]}`
