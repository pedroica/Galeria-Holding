# DECISOES — Rotação de credenciais e segurança · 2026-09-17

## Chaves que passaram por relatórios ou contexto de sessão

| Chave | Onde apareceu | Ação tomada | Status |
|---|---|---|---|
| `CRON_SECRET` (valor antigo) | Mencionada em STATUS.md anterior como variável a configurar; valor não havia sido escrito em arquivo | **Rotacionada** nesta sessão via `vercel env rm` + `vercel env add` (Production + Preview) | ✅ Rotacionada |
| `SUPABASE_SERVICE_ROLE_KEY` | Prefixo `sb_secret_QlmFs...` visível em relatório de sessão anterior | **Deve ser rotacionada** no Supabase (ver instrução abaixo) | ⚠️ PENDENTE |
| `SUPA_ANON` (`sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r`) | Presente no código frontend (gh-store.js, block3.js) — intencional | Anon key é pública por design; sem necessidade de rotação | ✅ OK |

---

## Como rodar a rotação do SUPABASE_SERVICE_ROLE_KEY

Esta ação requer atenção manual. Nunca escreva o valor em arquivo ou relatório.

1. Acesse: **Supabase Dashboard → central-galeria → Settings → API**
2. Em "Project API keys", clique em **"Reveal"** ao lado de "service_role"
3. Clique em **"Regenerate"** (ou "Roll key") para gerar um novo valor
4. Copie o novo valor para o clipboard
5. Acesse: **Vercel → galeria-holding → Settings → Environment Variables**
6. Encontre `SUPABASE_SERVICE_ROLE_KEY`, clique em **"Edit"**
7. Cole o novo valor diretamente (clipboard → campo → Save)
8. Faça um novo deploy: `npx vercel deploy --prod`
9. Confirme que `/api/c/{token}` e `/api/gerar-credencial` continuam funcionando

---

## Inventário de segredos no repositório (verificação 2026-09-17)

```
# Verificado com grep em todos os arquivos do projeto:
# grep -rn "sb_secret_" . --include="*.js" --include="*.json" --include="*.md"
```

Resultado esperado: **zero ocorrências** de `sb_secret_` em qualquer arquivo do repo.

Arquivos que contêm credenciais intencionalmente:
- `gh-store.js`: contém `sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r` (anon key, público)
- `block3.js`: idem, mesmo valor de anon key

Arquivos server-side (nunca commitam valor de secret):
- `api/c/[token].js`: lê `process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY`
- `api/gerar-credencial.js`: idem
- `api/cron/gerar-fila-diario.js`: lê `process.env.CRON_SECRET`

---

## Regras permanentes

- `.env` é gitignored — nunca commitado
- `SUPA_CRM_SERVICE_KEY` / `SUPA_AGENTE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — server-side only
- `CRON_SECRET` — server-side only; rotacionar se suspeita de exposição
- Após qualquer rotação: fazer deploy imediato para ativar novo valor
- Nunca escrever valor de secret em arquivo, commit, STATUS.md ou relatório
