# DECISOES.md — Galeria Holding CRM
*Engenheiro: Claude Sonnet 4.6 | Head of Growth: Pedro Ica*
*Atualizado automaticamente a cada fase. Pedro lê e corrige o que discordar.*

---

## FASE A — Virada para Supabase

### A-001 · crm_hotpipeline não é o pipeline visual
**Data:** 2026-09-16  
**Decisão:** A tabela `crm_hotpipeline` no banco tem schema de fila de prospecção (decisor_id, assunto, corpo, status), idêntica à `crm_fila`. O pipeline visual de oportunidades (GAIA e Holding) fica em `crm_kanban`. O localStorage `gh_hotpipeline_v1` é lido e gravado via `crm_kanban`.  
**Motivo:** Schema real da tabela não corresponde ao nome; `crm_kanban` já tem os 97 cards sincronizados com o formato correto (tab, col, nome, produto, nota, valor, responsavel).

### A-002 · Segurança — leitura e escrita só para authenticated
**Data:** 2026-09-16 (revisado)  
**Decisão:** TODAS as políticas RLS para role `anon` foram removidas de todas as tabelas `crm_*`. Leitura e escrita exigem sessão autenticada (`authenticated`). O auth gate foi restaurado em `block3.js`: sem login, o app exibe a tela de magic link. Nenhuma tela carrega dados antes do login.  
**Motivo:** Políticas anon abertas são vulnerabilidade. O kanban e demais telas carregam somente após login — se precisar de dado antes, a resposta é tela de carregando, não abrir o banco para anon.

### A-003 · Mapeamento completo localStorage → Supabase (A2)
**Data:** 2026-09-16 (atualizado com tabela completa)  

Estratégia: todas as chaves abaixo são interceptadas pelo monkey-patch em `gh-store.js`. No login, `hydrateFromSupabase()` popula o localStorage a partir do Supabase. Escritas são sincronizadas via `localStorage.setItem` interceptado → `pushKeyToSupabase()`.

| Chave localStorage | Tabela / coluna Supabase | Tela(s) que usa | Migrada? |
|---|---|---|---|
| `gh_alertas_v2` | `crm_shared` (key) | Lista empresas, Alertas (block3) | ✅ Sim |
| `gh_regua_v1` | `crm_shared` (key) | Régua (block_regua, block_regua_views) | ✅ Sim |
| `gh_blocklist_v1` | `crm_carteira_clientes` (tipo='cliente_ativo') | Blocklist (block_blocklist) | ✅ Sim — tabela real |
| `gh_diario_v1` | `crm_shared` (key) | Diário (block_diario) | ✅ Sim |
| `gh_bomdias_v1` | `crm_shared` (key) | Bom Dia (block_bomdias), Diário (block_diario) | ✅ Sim |
| `gh_llmbox_v2` | `crm_shared` (key) | Agente LLM (block3) | ✅ Sim |
| `gh_config_v1` | `crm_shared` (key) | KanbanDiario, Config (block3) | ✅ Sim |
| `gh_tutorial_v1` | `crm_shared` (key) | Tutorial (block3) | ✅ Sim |
| `gh_decisores_v3` | `crm_decisores` (legacy_key = accKey_normNome) | Régua, Ficha empresa (block_regua, block_regua_views, block6) | ✅ Sim — tabela real |
| `ghub_accs` | `crm_shared` (key) | App — controle de acesso (block3) | ✅ Sim |
| `gh_funil_v1` | `crm_shared` (key) | Funil (block5) | ✅ Sim |
| `gh_radar_v1` | `crm_shared` (key) | Radar (block7) | ✅ Sim |
| `gh_templates_v1` | `crm_shared` (key) | Ferramentas/Outbound (block7) | ✅ Sim |
| `gh_portfolio_v1` | `crm_shared` (key) | Portfolio (block5) | ✅ Sim |
| `gh_abordagens_v1` | `crm_shared` (key) | Outbound (block7) | ✅ Sim |
| `gh_estrelas_v1` | `crm_shared` (key) | Lista empresas / estrelas (block3) | ✅ Sim |
| `gh_kanban_v3` | `crm_shared` (key) + `crm_kanban` (fonte) | Diário, FerramentasModal (block_diario, block6) | ✅ Sim — block4 popula do crm_kanban |
| `gh_llmbox_v1` | `crm_shared` (key) | (legado) | ✅ Sim |
| `gh_kestra_v1` | `crm_shared` (key) | Kestra (block5) | ✅ Sim |
| `gh_bomdias_nav` | `crm_shared` (key) | Navegação Bom Dia (block3) | ✅ Sim |
| `ghub_custom_leads` | `crm_empresas` (onConflict='nome', fonte='custom') | FerramentasModal / MMN import (block6) | ✅ Sim — tabela real |
| `ghub_claude_key` | `crm_personal` (user_id, key) | Agente — chave pessoal Claude (block_agente) | ✅ Sim |
| `gh_hotpipeline_v1` | `crm_kanban` (tab+nome) | Script sync (scripts/) | ✅ Sim — script sync |
| `ghub_mmn_import_v1` | N/A — flag one-time | FerramentasModal (block6) | N/A — flag efêmero |
| `gh_radar_last_run` | N/A — timestamp local | Radar (block7) | N/A — dado não crítico |
| `gh_supa_cfg_v1` | **REMOVIDO** | Agente (block_agente) — era vulnerabilidade | ✅ Removido |

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

## FASE B — Redesign (branch fase1)

### B-001 · Remoção de telas obsoletas (B2)
**Data:** 2026-09-16  
**Decisão:** As seguintes telas foram removidas da navegação em `block3.js`:

| Tela removida | viewMode | Componente | O que ela fazia | Onde a função sobreviveu |
|---|---|---|---|---|
| Bom Dia | `bomdias` | `BomDiaView` | Resumo diário de alertas e agenda de contatos | Não há substituto direto; dados em `crm_shared`. Legado em `crm_legado` |
| Diário | `diario` | `DiarioView` | Log diário de atividades e touchpoints | Histórico de toques sobrevive no `EmpresaDrawer` (aba "Histórico") |
| Régua | `regua` | `ReguaMensalView` | Calendário mensal de acionamentos (scheduling) | `gh_kanban_v3` no localStorage tinha essa lógica; migrada para `crm_shared`. Campo `ordem` em `crm_kanban` preserva prioridade |
| Agente | `agente` | `AgenteView` | Interface de IA para rascunhos de e-mail | Funcionalidade de IA deve ser retomada na Fase C integrada ao `AgTextosTab` |
| LLM box | `llm2` | `LLMBoxV2` | Caixa de entrada de prompts LLM genérica | Removida — `crm_legado` para referência |
| Mailing | `batch` | `SmartBatch` | Envio em lote de e-mails com personalização | Substituída parcialmente por `AgEnviarTab` (gera HTML do pipeline) |
| Hot Pipeline | `hotpipeline` | `KanbanDiario` | Kanban diário de contatos quentes | Substituído pelo kanban global em `HoldingHome` e pipeline por agência em `AgenciaHome` |
| Tutorial | `showTutorial` | `TutorialOverlay` | Overlay de onboarding first-time | Desativado (default `false`); conteúdo em `crm_shared` caso necessário |

**B-002 · Blocklist → Carteira**  
`BlocklistView` (viewMode `blocklist`) permanece disponível como rota legacy no viewMode chain. Acesso foi removido do menu principal — será movido para dentro de `FerramentasModal` como seção "Carteira" na Fase C.

**B-003 · Navegação principal (B1)**  
5 seções: Holding / Agências / Aprovar hoje / Base / Ferramentas. Holding → `HoldingHome` (kanban global). Agências → `AgenciaHome` com sub-nav de 13 agências + 7 abas. Base → `EmpresasView` (lista de empresas + `EmpresaDrawer`). Ferramentas → `FerramentasModal` (existente).

**B-004 · Kanban global HoldingHome**  
Carrega todos os rows de `crm_kanban` (gaia + holding). Colunas: contato / reuniao / proposta / negociacao / fechamento. Chip da agência derivado de `responsavel` (match por id do ALL_AGENCIAS). Drag-and-drop entre colunas: PATCH `col` + `atualizado_em`. Painel de metas: 40 reuniões/sem · 3/agência, últimas 5 semanas por `atualizado_em`.

**B-005 · AgenciaHome — todas as abas funcionais**  
- `pipeline`: `PipelineView` (GAIA: tab='gaia'; demais: tab='holding' + filtro `responsavel`)
- `noticias`: REST `crm_noticias` filtrado pelos `empresa_id` do pipeline da agência  
- `servicos`: CRUD `crm_servicos` por UUID da agência (de `AGENCIA_UUIDS`)  
- `cases`: CRUD `crm_cases` com extração de thumbnail YouTube via regex  
- `credenciais`: CRUD `crm_credenciais_blocos` por slug da agência  
- `textos`: CRUD `crm_templates` por slug da agência, agrupado por etapa  
- `enviar`: gera HTML branded do pipeline + preview via iframe  

**B-006 · Base mobile-ready**  
`EmpresasView` é renderizado com flex column completo em `navSection='base'`. Styling responsivo via CSS existente.

**B-007 · Aprovar hoje mobile-ready**  
`AprovacaoHoje` em `navSection='aprovar'` com `overflow:auto` no wrapper.

---

## FASE C — A implementar

*(será preenchido ao iniciar a Fase C)*

---

## FASE D — A implementar

*(será preenchido ao iniciar a Fase D)*

---

## FASE E — A implementar

*(será preenchido ao iniciar a Fase E)*
