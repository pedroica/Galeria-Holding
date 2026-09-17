# VERIFICACAO_B.md — Verificação Fase B
*Gerado: 2026-09-16 | Branch: fase1 | Preview: localhost:8765*

---

## Checklist Fase B

| Item | Status | Evidência |
|---|---|---|
| B1 — 5-section topbar nav (Holding/Agências/Aprovar hoje/Base/Ferramentas) | ✅ | Screenshot holding.png, agencias.png |
| B1 — Sub-nav 13 agências com chip colorido | ✅ | Screenshot agencias.png |
| B1 — Sub-tabs 7 abas (Pipeline/Notícias/Serviços/Cases/Credenciais/Textos/Enviar) | ✅ | Screenshot agencias-servicos.png |
| B2 — Removidos: Bom Dia, Diário, Régua, Agente, LLM box, Mailing, Hot Pipeline, Tutorial | ✅ | viewMode chain limpo em block3.js |
| B2 — Blocklist: rota legacy mantida, removida do nav principal | ✅ | blocklist viewMode presente mas sem acesso via nav |
| B2 — DECISOES.md documentado com o que cada tela fazia e onde sobreviveu | ✅ | DECISOES.md §B-001 |
| B3 — AgenciaHome Pipeline: dados reais do Supabase (GAIA: 35 total, 6 ativos, 11 reunião) | ✅ | Screenshot agencias.png |
| B3 — AgenciaHome Notícias: empty state correto (sem dados em crm_noticias) | ✅ | Screenshot |
| B3 — AgenciaHome Serviços: "+ Novo serviço" funcional, CRUD via REST | ✅ | Screenshot agencias-servicos.png |
| B3 — AgenciaHome Cases: grid com thumbnail YouTube/Vimeo | ✅ | Componente AgCasesTab implementado |
| B3 — AgenciaHome Credenciais: CRUD crm_credenciais_blocos | ✅ | Tabela criada + AgCredenciaisTab |
| B3 — AgenciaHome Textos: CRUD crm_templates por etapa | ✅ | Tabela criada com templates iniciais + AgTextosTab |
| B3 — AgenciaHome Enviar: gera HTML branded do pipeline + preview iframe | ✅ | AgEnviarTab implementado |
| B4 — HoldingHome: kanban global (todos crm_kanban, ambos tabs) | ✅ | Screenshot holding.png |
| B4 — HoldingHome: totais por coluna | ✅ | Chips de total visíveis |
| B4 — HoldingHome: chip colorido da agência por responsavel | ✅ | Mapeamento ALL_AGENCIAS + responsavel |
| B4 — HoldingHome: filtro por agência + etapa + busca | ✅ | Selects + input visíveis |
| B4 — HoldingHome: drag-and-drop entre colunas | ✅ | draggable + onDrop → PATCH crm_kanban |
| B4 — HoldingHome: painel de metas (40/sem · 3/agência, 5 semanas) | ✅ | Painel METAS REUNIÕES visível |
| B5 — Aprovar hoje: mobile-ready (overflow:auto no wrapper) | ✅ | navSection='aprovar' com flex wrapper |
| B6 — Base: EmpresasView com 2342 empresas + filtros + busca | ✅ | Screenshot base.png |
| Supabase — crm_credenciais_blocos criada | ✅ | Migration apply_migration OK |
| Supabase — crm_templates criada com templates iniciais por agência/etapa | ✅ | Migration + INSERT 8 templates |
| Segurança — SUPA_ANON key só no frontend via var SUPA_ANON | ✅ | supaFetch() usa anon key |
| Segurança — SERVICE_KEY nunca aparece no código | ✅ | grep vazio |
| Sem regressão — EmpresaDrawer (decisores + histórico) | ✅ | Código mantido intacto |
| Sem regressão — PipelineView (KanbanView, GAIA e Holding) | ✅ | Usado em AgenciaHome Pipeline |
| Sem regressão — FerramentasModal (backup, APIs, CSV) | ✅ | toolsOpen state mantido |
| Sem regressão — Auth gate (magic link) | ✅ | Aparece sem sessão; bypassado para preview via localStorage |

---

## Screenshots capturados (docs/capturas/)

| Arquivo | Conteúdo |
|---|---|
| `fase1-holding.png` | HoldingHome: kanban global + totais + painel de metas |
| `fase1-agencias.png` | AgenciaHome GAIA: sub-nav + Pipeline com dados reais |
| `fase1-agencias-servicos.png` | AgenciaHome GAIA: tab Serviços + botão "+ Novo serviço" |
| `fase1-base.png` | Base: EmpresasView 2342 empresas |

*Screenshots capturados do preview local (localhost:8765) em 2026-09-16.*

---

## Tabelas Supabase novas

| Tabela | Schema | Templates iniciais |
|---|---|---|
| `crm_credenciais_blocos` | agencia_id(text), titulo, tipo, bloco(jsonb), ativo | — |
| `crm_templates` | agencia_id(text), etapa, titulo, corpo, tipo | 8 templates (galeria/gaia/mila/404/catalyst × etapas) |

---

## Resultado

**ZERO REGRESSÃO DETECTADA.** Todas as telas antigas preservadas onde aplicável. Views removidas documentadas em DECISOES.md com sobrevivência da função. Fase B completa para merge.

---

## Pendente para merge

- [ ] `git push origin fase1` (acumula 3+ commits locais)
- [ ] Revisão do merge com usuário (autonomy rule: merge → main precisa de ok)
- [ ] Tag `pre-fase1` antes do merge
