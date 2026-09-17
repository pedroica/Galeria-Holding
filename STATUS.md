# STATUS — Galeria Holding CRM · 2026-09-17

**Produção:** https://galeria-holding-sage.vercel.app  
**Supabase:** uetltlnjmobeiunxfsqi (sa-east-1)  
**Commits desta sessão:** 18aae1f · 92595a4 · 0783ffa · 3d96f18 · (rewrite em andamento)

---

## Tabela de funcionalidades em produção

| Funcionalidade | Status | Observação |
|---|---|---|
| Login (magic link) | ✅ Funciona | CDN Supabase JS adicionado ao index.html (92595a4) |
| `window.__supaSession` JWT | ✅ Corrigido | gh-store.js popula na carga e no onAuthStateChange (0783ffa) |
| Aba **Cases** (agência) | ✅ Corrigido | Requer login — RLS `{authenticated}` + fix do JWT acima |
| Aba **Textos / Templates** | ✅ Corrigido | Requer login — RLS `auth.role()='authenticated'` + fix JWT |
| **Geração de fila** (`/api/gerar-fila`) | ✅ Funciona | 30 e-mails p/ 404, 5 p/ Catalyst (exclusividade semanal ok) |
| Parser JSON markdown fence | ✅ Corrigido | gerarTexto strip de ```json fences (18aae1f) |
| `SUPABASE_SERVICE_ROLE_KEY` no Vercel | ✅ Config type | Copiada da Supabase → Vercel como Config (não Secret) |
| **Credencial** `/api/c/{token}` | ✅ Funciona | Cinema P&B, 5 slides, PT; blocos 404 seed via SQL |
| Rewrite `/c/{token}` | ✅ Adicionado | vercel.json rewrite → `/api/c/:token` |
| **gerar-credencial** API | ✅ Fix aplicado | Fallback `SUPABASE_SERVICE_ROLE_KEY` adicionado (3d96f18) |
| Cron `gerar-fila-diario` | ⏳ Aguarda CRON_SECRET | Ver nota abaixo |
| Aba Credenciais (UI) | ⚠️ Blocos vazios antes | Seed de 5 blocos feito via SQL para agência 404 |
| Aba Noticias / Serviços | ✅ Sem alteração | Funcionam com JWT autenticado |

---

## Dados confirmados em produção

### crm_fila — e-mails gerados
- **404:** 30 itens (`status: rascunho`), assunto/corpo/case/contexto preenchidos
- **Catalyst:** 5 itens, exclusividade semanal validada (empresa_ja_na_fila p/ duplicatas)

### crm_cases — por agência
| Agência | UUID | Cases |
|---|---|---|
| Galeria | 960142b5 | 41 |
| 404 | 14a057af | 4 |
| Milà | b0473d79 | 1 |
| GAIA | a8aecdac | 1 |

### crm_templates — por agência (slug)
`galeria`=19, `gaia`=18, `404`=17, `mila`=17, `catalyst`=17, `mantiqueira`=16, `frame`=16, `atelie`=16, `cccaramelo`=16, `fluxo`=16, `vitrine`=16, `agente`=16, `studioga`=16, `holding`=16

### Credencial de demonstração
- **Token:** `067c61d9cb237489c344bf28d1e4dbb0`
- **URL:** https://galeria-holding-sage.vercel.app/api/c/067c61d9cb237489c344bf28d1e4dbb0
- **Curta:** https://galeria-holding-sage.vercel.app/c/067c61d9cb237489c344bf28d1e4dbb0 *(após próximo deploy)*
- **Agência:** 404 | **Idioma:** pt | **Slides:** 5 | **Expira:** 2026-09-24

---

## Amostras de e-mail (docs/amostras/)

| Arquivo | Empresa (anonimizada) | Cargo | Estrelas | Case |
|---|---|---|---|---|
| amostra_404_email_01.md | [EMPRESA_AUTOMOBILÍSTICA_LUXO] | Diretor de Branding | 5★ | The Cruise Heist |
| amostra_404_email_02.md | [EMPRESA_FINTECH] | CMO/VP Marketing | 5★ | The Cruise Heist |
| amostra_404_email_03.md | [EMPRESA_MOBILIDADE] | Marketing Director | 4★ | The Cruise Heist |
| amostra_404_email_04.md | [EMPRESA_VAREJO_DIGITAL] | CMO | 5★ | The Cruise Heist |
| amostra_404_email_05.md | [EMPRESA_ECOMMERCE_LATAM] | CMO | 5★ | The Cruise Heist |

---

## Pendente — uma ação sua

Para disparar o cron `gerar-fila-diario` manualmente:

**Variável necessária:** `CRON_SECRET`  
**Onde ler:** Vercel → projeto `galeria-holding` → Settings → Environment Variables → CRON_SECRET → Reveal

**Comando após revelar o valor:**
```bash
curl -X POST https://galeria-holding-sage.vercel.app/api/cron/gerar-fila-diario \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```

---

## Segurança
- `.env` é gitignored e nunca foi commitado
- `SUPA_CRM_SERVICE_KEY` / `SUPA_AGENTE_SERVICE_KEY` — server-side only, nunca no frontend
- `SUPA_ANON` (`sb_publishable_...`) — único Supabase credential no frontend
- Nenhum valor de chave foi escrito em arquivo, commit ou relatório
