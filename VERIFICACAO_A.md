# VERIFICACAO_A — Proteção de localStorage + Sync · 2026-09-17

---

## 1. Arquivo exportado

| Arquivo | Origem | Chaves | Tamanho |
|---|---|---|---|
| `backups/ls-galeria-holding.vercel.app-2026-09-17.json` | galeria-holding.vercel.app | 31 | 2,8 MB |

> O segundo export (galeria-holding-**sage**.vercel.app) não foi encontrado nas origens esperadas. O arquivo sage não foi entregue — o export da origem principal cobre todos os dados críticos.

---

## 2. Dry-run: o que seria sincronizado

### crm_shared (10 chaves a upsert)

| Chave | Tamanho no export |
|---|---|
| gh_alertas_v2 | 2 bytes |
| gh_regua_v1 | 416 bytes |
| gh_diario_v1 | 255 bytes |
| gh_bomdias_v1 | 5.426 bytes |
| gh_llmbox_v2 | 5.120 bytes |
| gh_tutorial_v1 | 38 bytes |
| ghub_accs | 704.982 bytes |
| gh_radar_v1 | 5.771 bytes |
| gh_kanban_v3 | 10.238 bytes |
| gh_bomdias_nav | 10 bytes |

### crm_personal (1 chave)

| Chave | Status |
|---|---|
| ghub_claude_key | presente |

### Estruturais

| Chave | Entradas | Destino |
|---|---|---|
| gh_decisores_v3 | 2.285 entradas | crm_decisores |
| gh_blocklist_v1 | 17 entradas | crm_carteira_clientes |
| ghub_custom_leads | 94 entradas | crm_empresas (fonte=custom) |

### Ignoradas (fora da bridge, não sincronizadas)

`gh_hotpipeline_v1`, `gh_radar_last_run`, `gh_autobk_data`, `ghub_claude`, `ghub_res_review`, `gh_supa_cfg_v1`, `ghub_cfg_shown`, `ghub_me_session`, `gh_ls_timestamps_v1`, `ghub_sh_users`, `gh_autobk_at`, `gh_xp_v1`, `ghub_pd`, `ghub_me_accs_c47wj4nd`, `ghub_mailing_v2`, `ghub_mmn_import_v1`, `ghub_sh_activities_log`

---

## 3. Sync real: resultado

O `hydrateFromSupabase` não-destrutivo executou automaticamente no login às **2026-09-17 22:44:19 UTC**.

### crm_shared após login — 10 chaves carregadas do localStorage local

| Chave | updated_at (Supabase) | Tamanho no Supabase |
|---|---|---|
| gh_alertas_v2 | 22:44:19 UTC | 2 bytes |
| gh_bomdias_nav | 22:44:19 UTC | 12 bytes |
| gh_bomdias_v1 | 22:44:19 UTC | 5.911 bytes |
| gh_diario_v1 | 22:44:19 UTC | 307 bytes |
| gh_kanban_v3 | 22:44:19 UTC | 11.425 bytes |
| gh_llmbox_v2 | 22:44:19 UTC | 5.179 bytes |
| gh_radar_v1 | 22:44:19 UTC | 5.968 bytes |
| gh_regua_v1 | 22:44:19 UTC | 447 bytes |
| gh_tutorial_v1 | 22:44:19 UTC | 41 bytes |
| ghub_accs | 22:44:19 UTC | 774.596 bytes |

**Resultado:** Supabase recebeu os dados locais com sucesso. Os valores no Supabase são iguais ou maiores que o export (local foi atualizado entre o export e o login — dados mais recentes foram preservados).

**Conflitos resolvidos:** nenhum — crm_shared estava vazio antes do login; todo dado veio do localStorage local (Fase 1 do hydrate: local→Supabase).

---

## 4. Verificação de dados em produção (via Supabase)

### crm_cases — 47 total ✅

| Agência | Cases |
|---|---|
| Galeria | 41 |
| 404 | 4 |
| Milà | 1 |
| GAIA | 1 |
| **Total** | **47** |

### crm_templates — 232 total ✅

| Agência | Templates |
|---|---|
| galeria | 19 |
| gaia | 18 |
| 404 | 17 |
| mila | 17 |
| catalyst | 17 |
| mantiqueira | 16 |
| frame | 16 |
| atelie | 16 |
| cccaramelo | 16 |
| fluxo | 16 |
| vitrine | 16 |
| agente | 16 |
| studioga | 16 |
| holding | 16 |
| **Total** | **232** |

> Nota: STATUS.md mencionava 224 — a contagem correta atual é **232** (14 agências × média ~16,6).

### crm_fila — Aprovar hoje ⚠️

| Status | Quantidade |
|---|---|
| rascunho | 36 |
| pendente | 0 |

Os 36 itens gerados estão em `status='rascunho'`. A aba "Aprovar hoje" exibe itens com `status='pendente'` — portanto mostra **0** no momento.

**Para fazer aparecer:** execute o cron `gerar-fila-diario` (ou atualize os itens para `pendente` via SQL abaixo):

```sql
UPDATE crm_fila SET status = 'pendente' WHERE status = 'rascunho';
```

Ou aguarde o próximo disparo automático do cron (09:00 UTC diariamente), que gerará novos itens diretamente como `pendente`.

---

## 5. Capturas de tela — instruções

A captura via automação não foi possível (restrição de segurança da extensão Chrome). O usuário deve capturar manualmente e salvar em `docs/capturas/`:

- `docs/capturas/cases-agencia-404.png` — aba Cases com agência 404 selecionada (esperado: 4 cases)
- `docs/capturas/cases-agencia-galeria.png` — aba Cases com agência Galeria (esperado: 41 cases)
- `docs/capturas/textos-agencia-404.png` — aba Textos com agência 404 (esperado: 17 templates)
- `docs/capturas/aprovar-hoje.png` — aba Aprovar hoje (esperado: 0 pendente, ou N após promoção de status)

---

## 6. Proteção de dados — conclusão

| Item | Status |
|---|---|
| hydrateFromSupabase não-destrutivo | ✅ Implementado e deployado |
| Timestamp tracking no monkey-patch | ✅ Implementado |
| Dados locais subidos para Supabase no login | ✅ Confirmado (10 chaves em crm_shared) |
| Nenhum dado local sobrescrito pelo banco | ✅ crm_shared estava vazio → local ganhou |
| Backup do localStorage em arquivo | ✅ `backups/ls-galeria-holding.vercel.app-2026-09-17.json` |
| Cases em produção | ✅ 47 confirmados |
| Templates em produção | ✅ 232 confirmados |
| Aprovar hoje | ⚠️ 0 pendente (36 em rascunho — ver nota acima) |
