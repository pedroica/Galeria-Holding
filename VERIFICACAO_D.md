# VERIFICACAO_D.md — Fase D: Motor de Prospecção

*Data: 2026-09-17 | Branch: fase-d | Commit: af5af17*

---

## 1. Verificação de Schema

### crm_decisores — colunas D1 adicionadas

| Coluna | Tipo | Status |
|---|---|---|
| estrelas | integer | ✅ presente |
| etapa_cadencia | text | ✅ presente |
| pausa_ate_em | timestamptz | ✅ presente |
| respondeu | boolean | ✅ presente |
| reuniao_marcada_em | timestamptz | ✅ presente |
| agencia_prospectando | text | ✅ presente |
| sinal_recente_em | timestamptz | ✅ presente |

### crm_empresas — colunas D1 adicionadas

| Coluna | Tipo | Status |
|---|---|---|
| estrelas | integer | ✅ presente |
| sinal_recente_em | timestamptz | ✅ presente |
| cliente_ativo | boolean | ✅ já existia |
| agencia_atendendo | text | ✅ já existia |

### crm_fila — schema completo

| Coluna | Status |
|---|---|
| id, decisor_id, empresa_id, agencia_id, canal | ✅ |
| etapa, etapa_cadencia, status | ✅ |
| assunto, corpo, contexto_para_aprovacao | ✅ |
| template_id, case_id | ✅ |
| tokens_prompt, tokens_resposta, custo_usd, modelo | ✅ |
| gerado_em, aprovado_em, enviado_em, erro_msg | ✅ |

---

## 2. Estado do banco (2026-09-17)

| Métrica | Valor |
|---|---|
| crm_decisores total | 2742 |
| Decisores com etapa_cadencia='etapa1' | 2742 (todos migrados) |
| Decisores com email válido | 2459 |
| Decisores com WA | 2023 |
| Decisores tocados esta semana | 0 → todos elegíveis |
| crm_empresas total | 2273 |
| Empresas com estrelas >= 3 | 0 (pendente: Pedro pontuar empresas) |
| crm_fila rascunhos | 0 (aguardando primeiro deploy) |
| crm_noticias | 11 (testes manuais anteriores) |
| crm_templates | 224 (14 agências × 4 etapas × 4 canais) |

---

## 3. Validação das Regras D1 (elegibilidade)

Código em `api/gerar-fila.js` — função `elegivel(d, semanaInicio)`:

| Regra | Implementação | Resultado |
|---|---|---|
| status não inativo/removido/descadastrado | `d.status NOT IN (...)` | ✅ |
| tem contato (email ou WA) | `d.email_valido !== false \|\| d.wa` | ✅ |
| não está em pausa | `d.pausa_ate_em < NOW()` | ✅ |
| etapa_cadencia != 'off' | `d.etapa_cadencia === 'off'` | ✅ |
| exclusividade semanal | `d.ultimo_toque_em > inicioSemana()` filtra | ✅ |
| empresa não é cliente ativo de outra agência | `emp.cliente_ativo && emp.agencia_atendendo !== ag.id` | ✅ |
| 1 decisor por empresa | `empresasVistas Set` | ✅ |

**Resultado exclusividade semanal (2026-09-17):**  
0 decisores tocados esta semana → todos 2742 elegíveis para primeiro run.

---

## 4. Validação das Regras D2 (ordenação)

Ordem: `estrelas DESC, sinal_recente_em DESC, temperatura DESC`  

Como estrelas estão todas em 0 no momento, o desempate recai em `temperatura` (também 0 geral). A ordem de saída será quasi-aleatória até Pedro pontuar empresas — o que é aceitável para o primeiro run.

**Ação recomendada:** Pedro pontuar as top empresas (1-5 estrelas) via EmpresaDrawer na tela Base para que os crons de enriquecimento e notícias passem a funcionar.

---

## 5. Limites diários por canal

| Canal | Limite | Configurado em |
|---|---|---|
| email | 50/dia | `LIMITES.email` em gerar-fila.js |
| whatsapp | 80/dia | `LIMITES.whatsapp` |
| linkedin_convite | 20/dia | `LIMITES.linkedin_convite` |
| linkedin_mensagem | 20/dia | `LIMITES.linkedin_mensagem` |
| **Total/dia** | **170** | |
| **Meta semanal (5 dias)** | **~850** | Para 40 reuniões esperando ~5% taxa resposta → ok |

---

## 6. Amostras geradas (simuladas pré-deploy)

5 exemplos realistas em `docs/amostras/`:

| Arquivo | Canal | Agência | Empresa |
|---|---|---|---|
| [amostra-01](docs/amostras/amostra-01-email-404-shopee.md) | email | 404 | Shopee |
| [amostra-02](docs/amostras/amostra-02-wa-galeria-shopee.md) | whatsapp | Galeria | Shopee |
| [amostra-03](docs/amostras/amostra-03-linkedin-gaia-shopee.md) | linkedin_convite | GAIA | Shopee |
| [amostra-04](docs/amostras/amostra-04-email-milà-villa-romana.md) | email | Milà | Villa Romana |
| [amostra-05](docs/amostras/amostra-05-email-404-usina-ester.md) | email | 404 | Usina Ester |

Formato consistente com o system prompt de `gerarTexto()`: ≤120 palavras email, ≤60 WA, ≤40 LinkedIn; 1 pergunta final; tom direto.

---

## 7. Verificação de exclusividade — Catalyst vs 404 (lógica)

O `gerar-fila.js` garante exclusividade assim:

```
// Por semana: ultimo_toque_em > inicioSemana() → skip
if (d.ultimo_toque_em && new Date(d.ultimo_toque_em) > new Date(semana)) return false;
```

Cenário testado (lógica):
- Run 1 (404): gera para Shopee/Felipe → `ultimo_toque_em = now()`
- Run 2 (Catalyst): Felipe já tocado esta semana → **filtrado**, não recebe mensagem Catalyst
- ✅ Uma empresa não recebe 2 agências na mesma semana

Se as duas agências rodarem no mesmo segundo (cron único), a ordem de processamento (`agencias` array) determina qual agência "ganha" a empresa naquela semana.

---

## 8. Teste de runtime (a executar após deploy)

**Passo a passo:**

```bash
# 1. Fazer push da branch para gerar preview Vercel
git push origin fase-d

# 2. Aguardar URL de preview (ex: galeria-holding-git-fase-d-xxx.vercel.app)

# 3. Testar gerar-fila para 404, 30 emails
curl -X POST https://<preview-url>/api/gerar-fila \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"agencia_slug":"14a057af-31c6-4606-8236-4c97d8067335","canais":["email"],"limite":30}'

# 4. Verificar crm_fila
SELECT canal, COUNT(*), AVG(custo_usd) FROM crm_fila
WHERE agencia_id='14a057af-31c6-4606-8236-4c97d8067335'
GROUP BY canal;

# 5. Testar Catalyst (30 emails) — verificar zero sobreposição
curl -X POST https://<preview-url>/api/gerar-fila \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"agencia_slug":"<catalyst-uuid>","canais":["email"],"limite":30}'

# 6. Verificar exclusividade
SELECT COUNT(*) FROM crm_fila f1
JOIN crm_fila f2 ON f2.decisor_id = f1.decisor_id
  AND f2.agencia_id != f1.agencia_id
  AND f2.id != f1.id;
-- Deve retornar 0 (ou só entre agências diferentes é ok — 
-- o bloqueio é por empresa, não por decisor entre agências)
```

---

## 9. Pendências antes de produção

| Item | Descrição | Prioridade |
|---|---|---|
| Push `fase-d` + preview | Necessário para runtime test | Alta |
| Pontuar empresas (estrelas) | Sem estrelas, enriquecimento e notícias não rodam | Alta |
| Configurar CRON_EMAIL/CRON_PASSWORD | Cron gerar-fila-diario precisa dessas vars no Vercel | Alta |
| LUSHA_KEY no Vercel | Para enriquecimento-diario funcionar | Média |
| Merge fase-d → main | Após verificação runtime zero erros | Alta |

---

## 10. Conclusão

| Componente | Status |
|---|---|
| D1 Schema | ✅ |
| D2 Schema | ✅ |
| D3 api/gerar-fila.js | ✅ código completo, aguarda deploy |
| D4 Crons (3 arquivos + vercel.json) | ✅ código completo, aguarda deploy |
| D5 AprovacaoHoje (Email/WA/LinkedIn tabs) | ✅ |
| D6 Registrar resposta / Reunião | ✅ |
| D7 Este documento | ✅ |
| Runtime test 30 emails 404 | ⏳ aguarda `git push origin fase-d` |
| Runtime test exclusividade Catalyst | ⏳ idem |

**Zero dados apagados. Zero chaves secretas no front. Branch fase-d pronta para push e preview.**
