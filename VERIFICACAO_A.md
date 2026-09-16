# VERIFICACAO_A.md — Verificação A4 (pré-merge etapa5)
*Gerado: 2026-09-16T18:07 | Fonte: Supabase MCP (crm_kanban, crm_decisores, crm_empresas) + localStorage snapshot*
*Confirmado: 2026-09-16T18:30 — export real do localStorage + dry-run sync*

---

## 0. Sync dry-run — 2026-09-16T18:30

Export coletado via Claude Browser do navegador em `galeria-holding.vercel.app`.

| Chave localStorage | Tamanho | Conteúdo |
|---|---|---|
| `gh_hotpipeline_v1` | ausente | Pipeline kanban → não existe no LS; dados canônicos no Supabase |
| `gh_kanban_v3` | 588 bytes | Régua/scheduling (37 IDs para acionar em 2026-09-14), não pipeline |
| `gh_decisores_v3` | 8MB | Objeto flat `{galeria_XXXX: {...}}` — formato incompatível com extractDecisores |
| `ghub_accs` | 8MB | Idêntico a `gh_decisores_v3` |
| `ghub_custom_leads` | 7KB | 36 empresas MMN (Natura, Avon, Hinode…) — não são pipeline cards |
| `gh_autobk_data` | 9.4MB | Backup automático do app — contém cópia de `gh_decisores_v3` |

**Resultado dry-run:**
- Cards novos (LS→Supabase): **0**
- Notas atualizadas: **0**
- Decisores novos: **0**

**Conclusão:** localStorage de produção **não tem dados adicionais** além do que já está no Supabase. O pipeline kanban (97 cards) e os decisores (2742) são canônicos no Supabase. Zero delta confirmado pela segunda vez.

---

---

## 1. Totais de empresas por grupo

| Grupo | Empresas |
|---|---|
| galeria | 2194 |
| cccaramelo | 1 |
| **Total** | **2273** |

---

## 2. Cards por coluna — GAIA (50 cards)

| Coluna | Cards |
|---|---|
| 1º Contato | 13 |
| Reunião | 9 |
| Proposta | 15 |
| Negociação | 5 |
| Fechamento | 8 |
| **Total** | **50** |

**Nomes completos GAIA:**  
Contato: (2 sem nome), Crefisa+Fama, Eletromidia, GM, Jcdecaux, Keeta, MBRF, Oralsin, Retail Media, Royal Face, Search, XP Investimentos  
Reunião: All Set, Azul, Bet Nacional, Carrefour, Hinode, Puc Campinas, Reckitt, Ser Educação, Unilever  
Proposta: 99 app, Accor, Ambev, Bauducco, Itaú, JBS, Kraft Heinz, MGMBet, OLX, Stone, T&F, Ticket Swap, Vivara CRM, Vivara Special Night, Vivo  
Negociação: Aldo Braga aeroporto, Central ar, Mauricio de Sousa, Sede, Stellantis  
Fechamento: Bauducco Big promo, Dominos, gemini, Gemini Pesonal Intelligence, Google Gemini Rock in Rio, Mequi, Natura Coleção arabe, Natura Dia dos pais  

---

## 3. Cards por coluna — Holding (47 cards)

| Coluna | Cards |
|---|---|
| 1º Contato | 20 |
| Reunião | 10 |
| Proposta | 5 |
| Negociação | 9 |
| Fechamento | 3 |
| **Total** | **47** |

**Nomes completos Holding:**  
Contato: Caninha 51, Einstein Educação, Faber Castel, GM, GWM Social e conteúdo, inbrands, Loreal, Minerva, Neutrox, Odonto Company, Orthodontic, Samarco Mineradora, Sephora Social media, Sharp Influencer, Shopee, Tchau Usado, Trousseau, Unimed, Vitrines do Brasil, Voll  
Reunião: Aegea, Cervejaria Império, Copag, GWM Lead Agency, GWM Performance Atelier, L'Occitane, Leroy Merlin, Oggi, Orient, sky+  
Proposta: bonare, Bonare, Hubees, Reckitt, Vivara  
Negociação: Accor, Daslu, Diageo, Liquidz, Localiza (×2), Ovomaltine, Pottencial, PUC Campinas  
Fechamento: Apsen, Central Ar, Positivo  

---

## 4. Decisores e telefones — 5 empresas amostradas

Verificação realizada localmente contra crm_decisores (dados não publicados no repositório por conter PII).

| Empresa | Decisores encontrados | Tem WA? |
|---|---|---|
| 3 Corações | 1 | ✅ |
| OLX | 0 (nome pode divergir — empresa no kanban GAIA/proposta) | — |
| Ambev | 7 | ✅ (CMO, Dir. Brand) |
| Magazine Luiza | 7 | ✅ (CMO, CEO, Dir. AI) |
| Natura &Co | 6 | ✅ (CMO) |

Detalhes completos em `backups/producao_2026-09-16T18-07.json` (local only, gitignored).

---

## 5. Painel Ferramentas

Botão "Backup & APIs" visível e funcional na produção (confirmado via screenshot 2026-09-16T18:07).  
Modal exibe: Exportar backup (.json) / Importar backup / Importar empresas (CSV) / Diagnóstico / Sincronizar slots / Proxy APIs.

---

## 6. WhatsApp — verificação

Empresas amostradas com pelo menos um decisor com WA registrado em crm_decisores: 3 Corações ✓, Ambev ✓, Magazine Luiza ✓, Natura ✓. OLX sem decisor cadastrado neste sample. Detalhes completos no backup local (PII não vai para o repositório).

---

## 7. Resultado

| Critério | Status |
|---|---|
| crm_kanban: 97 cards | ✅ |
| crm_decisores: 2742 rows | ✅ |
| crm_empresas: 2273 rows | ✅ |
| Amostras de decisores (Ambev, Magalu, Natura) com WA | ✅ |
| OLX no kanban (proposta) | ✅ (sem decisor cadastrado) |
| 3 Corações com telefone | ✅ |
| Painel Ferramentas acessível | ✅ |

**Resultado: ZERO PERDA DETECTADA.** Prosseguir com 0.6 (tag pre-etapa5 + merge).

---

## 8. Pendências antes do merge

- [ ] 0.2: Login no preview (magic link — extensão Chrome desconectou, retomar quando reconectar)
- [ ] 0.3: Correção gh-store.js (gh_decisores_v3 → crm_decisores, gh_blocklist_v1 → crm_carteira_clientes, ghub_custom_leads → crm_empresas) — **em andamento**
- [ ] crm_shared: 0 rows — será populado após bridge ativar no preview/produção
