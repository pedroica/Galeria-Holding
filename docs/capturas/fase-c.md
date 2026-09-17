# Capturas — Fase C
*Gerado: 2026-09-17*

## Tela Cases (C3)
- Grade responsiva com thumbnail YouTube automático
- Filtros: busca livre, tipo (filme/star/internacional), destaque ★, prospecção ✓
- Player modal inline ao clicar no thumbnail
- Quick-add: colar URL YouTube/Vimeo → preenche form automaticamente
- Form completo: STAR (tarefa, ação, resultado, resumo), tags, ano, idioma, flags
- Ações por card: Editar · × desativar · EN↗ / ES↗ duplicar idioma
- 47 cases em crm_cases

## Credencial gerada (exemplo — token real gerado em produção)
- Rota: https://galeria-holding.vercel.app/c/{token_32hex}
- Estilo: Cinema P&B — fundo #000000, texto branco, Helvetica Neue
- Números hero: font-weight 100, clamp(56px, 10vw, 130px)
- Azul #1F6FE5 · Azul-escuro #002F6C · Vermelho #F02000
- 16:9 por página, navegação ← → / Space / Home / End
- Touch swipe, F = fullscreen
- Tipos disponíveis: capa, manifesto, numeros, ecossistema, servicos,
  metodologia, case, time, clientes, premios, fechamento, livre
- Expira em 7 dias — rota /api/gerar-credencial (POST, auth JWT)

## Counts Supabase (2026-09-17)
- crm_cases: 47
- crm_templates: 224
- crm_agencias: 14 (13 agências + holding)
- crm_servicos: seeded
- crm_credenciais_blocos: seeded (3 idiomas)
- Storage buckets: cases, credenciais, assets, backups
