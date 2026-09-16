# DECISOES.md — Galeria Holding CRM
*Engenheiro: Claude Sonnet 4.6 | Head of Growth: Pedro Ica*
*Atualizado automaticamente a cada fase. Pedro lê e corrige o que discordar.*

---

## FASE A — Virada para Supabase

### A-001 · crm_hotpipeline não é o pipeline visual
**Data:** 2026-09-16  
**Decisão:** A tabela `crm_hotpipeline` no banco tem schema de fila de prospecção (decisor_id, assunto, corpo, status), idêntica à `crm_fila`. O pipeline visual de oportunidades (GAIA e Holding) fica em `crm_kanban`. O localStorage `gh_hotpipeline_v1` é lido e gravado via `crm_kanban`.  
**Motivo:** Schema real da tabela não corresponde ao nome; `crm_kanban` já tem os 97 cards sincronizados com o formato correto (tab, col, nome, produto, nota, valor, responsavel).

### A-002 · Leituras do kanban sem sessão (anon key)
**Data:** 2026-09-16  
**Decisão:** Funções de LEITURA do `crm_kanban` (kanbanLoadAll, getEmpresaIdByNome) não exigem sessão de auth — funcionam com a anon key pública. Funções de ESCRITA (upsert, delete) continuam exigindo sessão.  
**Motivo:** O auth gate foi temporariamente removido para desbloquear o acesso ao preview (rate limit de magic link); sem session, o app precisa carregar os dados para funcionar. A anon key é segura para leitura de dados não-pessoais.

### A-003 · gh_hotpipeline_v1 mapeado para crm_kanban
**Data:** 2026-09-16  
**Mapeamento de chaves localStorage → Supabase:**

| localStorage key | Tabela Supabase | Campo-chave |
|---|---|---|
| `gh_hotpipeline_v1` | `crm_kanban` | tab + nome (estrutura gaia/holding) |
| `gh_kanban_v3` | `crm_kanban` | tab + nome (formato legado, obsoleto) |
| `gh_decisores_v3` | `crm_decisores` | empresa_id + nome |
| `ghub_accs` | `crm_decisores` + `crm_toques` | empresa_id |
| `ghub_sh_*` | `crm_shared` | key |
| `ghub_me_*` | `crm_personal` | user_id + key |
| `gh_regua_v1` | `crm_configuracoes` (key='regua') | — |
| `gh_blocklist_v1` | `crm_configuracoes` (key='blocklist') | — |
| `gh_diario_v1` | `crm_toques` (canal='diario') | — |
| `ghub_sh_activities_log` | `crm_toques` | empresa_id |
| `gh_alertas_v2` | `crm_configuracoes` (key='alertas') | — |

### A-004 · crm_kanban agencia_id inferida por produto/nota (Fase B)
**Data:** 2026-09-16  
**Decisão (antecipando B1):** Para cards da aba gaia, agencia_id = GAIA. Para holding, inferir por produto/responsavel:
- BrandSync, CR.IA → GAIA
- Performance, app → Catalyst  
- OOH, mídia exterior → Vitrine  
- Influência, influencer → a.gente  
- Branded content → Mantiqueira  
- Galeria, sem produto → Galeria Holding  
Cards com dúvida ficam com agencia_id = holding (Galeria) e são listados abaixo:
- Minerva (sem produto) → **Galeria**
- GM Holding (sem produto) → **Galeria**  
- Trousseau (sem produto, galeria=GAIA) → **GAIA**  
- L'Occitane (sem produto) → **Galeria**  
- Cervejaria Império (galeria=Galeria) → **Galeria**
- Vivara (galeria=Catalyst) → **Catalyst**
- Apsen (galeria=404) → **404**
- Sky+ (galeria=Milà) → **Milà**

---

## FASE B — A implementar

*(será preenchido ao iniciar a Fase B)*

---

## FASE C — A implementar

*(será preenchido ao iniciar a Fase C)*

---

## FASE D — A implementar

*(será preenchido ao iniciar a Fase D)*

---

## FASE E — A implementar

*(será preenchido ao iniciar a Fase E)*
