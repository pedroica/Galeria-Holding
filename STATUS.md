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

## E-mails gerados — 5 amostras (texto puro)

---

### Amostra 1 — [EMPRESA_AUTOMOBILÍSTICA_LUXO] | Director of Branding | 5★

**Assunto:** [EMPRESA_A] e uma ideia que vale conversa

[DECISOR_A], a [EMPRESA_A] está em um momento em que toda marca sonha: crescimento real, produto forte e atenção do mercado. O desafio agora é transformar esse momentum em narrativa que fique na cabeça das pessoas, não só nos números de venda.

Na 404, desenvolvemos o The Cruise Heist para a Netflix: uma ideia de ruptura que saiu rápido e gerou conversa global. Não foi sorte, foi método.

Acredito que existe um projeto relevante para fazer com a [EMPRESA_A] nesse mesmo nível, pensando em como a marca se posiciona culturalmente no Brasil além do produto.

Faz sentido marcarmos 30 minutos para eu entender melhor o que você está priorizando em comunicação agora?

---

### Amostra 2 — [EMPRESA_FINTECH] | CMO / VP of Marketing and Growth | 5★

**Assunto:** [DECISOR_B], uma ideia para [EMPRESA_B] crescer mais

[DECISOR_B], acompanho a [EMPRESA_B] há um tempo e fica evidente que vocês não querem só crescer: querem mudar como as pessoas se relacionam com dinheiro.

Na 404, a gente trabalha com ideias que rompem o óbvio e escalam rápido. O case The Cruise Heist, que fizemos para a Netflix, chegou a uma conversa global em poucos dias, sem fórmula de sempre.

Acho que existe espaço para construir algo parecido com a [EMPRESA_B], algo que só faz sentido vindo de vocês.

Faz sentido conversar 20 minutos essa semana para eu entender onde vocês querem chegar agora?

---

### Amostra 3 — [EMPRESA_MOBILIDADE] | Marketing Director | 4★

**Assunto:** [EMPRESA_C] e uma ideia que gera conversa

[DECISOR_C], trabalho na 404 e queria te mostrar algo que fizemos para a Netflix — o The Cruise Heist virou o case mais premiado do grupo esse ano, com execução rápida e alcance global a partir de uma ideia simples de ruptura.

A [EMPRESA_C] opera num setor onde a disputa por atenção é constante e as marcas tendem a se comunicar de formas muito parecidas. Acreditamos que há espaço para uma abordagem diferente — e esse tipo de trabalho é exatamente o que a 404 faz.

Faz sentido marcarmos 30 minutos para eu te mostrar como pensamos isso na prática?

---

### Amostra 4 — [EMPRESA_VAREJO_DIGITAL] | CMO | 5★

**Assunto:** [DECISOR_D], uma ideia para o [EMPRESA_D]

[DECISOR_D], trabalho na 404 e queria te mostrar algo que fizemos para a Netflix.

O The Cruise Heist começou como uma ideia de ruptura e virou o case mais comentado do grupo esse ano — alcance global, execução rápida, sem depender de mídia pesada.

O [EMPRESA_D] tem um ecossistema que poucos têm: presença física, digital e uma base de clientes fiel. O que falta muitas vezes é uma ideia que faça isso ganhar narrativa cultural.

Faz sentido marcarmos 30 minutos para eu te mostrar o que estamos pensando para marcas nesse momento?

---

### Amostra 5 — [EMPRESA_ECOMMERCE_LATAM] | CMO | 5★

**Assunto:** 404 e [EMPRESA_E]: uma ideia para conversar

[DECISOR_E], o [EMPRESA_E] construiu em poucos anos o que muitas marcas tentam por décadas: relevância real no dia a dia das pessoas. O desafio agora é manter esse espaço cultural em meio a uma concorrência que copia rápido.

Na 404, fizemos o The Cruise Heist para a Netflix: uma campanha que saiu de ideia para repercussão global em menos de uma semana. Sem fórmula, com método.

Acredito que existe um projeto parecido para o [EMPRESA_E] nesse momento — algo que reforce o posicionamento sem depender só de mídia de performance.

Você teria 20 minutos essa semana para eu te mostrar como pensamos isso?

---

## Blocos da credencial 404 — 3 melhores (texto puro)

---

### Bloco 1 — Capa (tipo: capa)

**404**
Cultura que vende. Criatividade com resultado.

---

### Bloco 2 — Case (tipo: case)

**The Cruise Heist**
*Netflix*

Uma campanha que começou como ideia de ruptura e virou repercussão global em menos de uma semana. Briefing recebido na segunda, aprovado na quarta, no ar na quinta — e viral na sexta.

**Resultado:** #1 trending em 12 países na semana de lançamento

---

### Bloco 3 — Fechamento (tipo: fechamento)

**Vamos conversar?**

Acreditamos que existe um projeto para a sua marca neste momento. Vamos descobrir juntos?

contato@404.ag

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
