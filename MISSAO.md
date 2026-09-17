# MISSÃO — Galeria Holding CRM
*Engenheiro e operador: Claude | Head of Growth: Pedro Ica*
*Atualizado: 2026-09-17*

## Contexto
Pedro Ica é o único vendedor responsável por gerar reuniões para 13 empresas do grupo Galeria Holding:
Galeria, 404, Milà, Caramelo, GAIA, Studio GA, ateliê, Mantiqueira, a.gente, Vitrine, Fluxo, Frame, Catalyst (GUX quando tiver serviço).

**Meta:** 40 reuniões novas por semana, pelo menos 3 por agência.

O sistema existe para que Pedro acorde, aprove em lote, responda quem respondeu e vá para as reuniões. Tudo que puder ser feito sem ele, fazer. Decisão de negócio: decidir como diretor comercial experiente, anotar em DECISOES.md e seguir.

**Parar só para:** chave que só Pedro tem, ação irreversível em dados, merge na main.

## Infraestrutura
- Produção: https://galeria-holding.vercel.app
- Supabase: projeto uetltlnjmobeiunxfsqi (tabelas crm_*)
- Login: magic link
- ANTHROPIC_API_KEY e SUPABASE_SERVICE_ROLE_KEY nas variáveis da Vercel (Production e Preview)
- Lusha: ~6.200 créditos, 1/email, 5/telefone, 1.500 revelações/dia, chave no .env
- Site de filmes/cases: https://galeria-filmes-pedroica-7790s-projects.vercel.app
- Site de credenciais: https://galeria-credenciais.vercel.app (repo pedroica/galeria-credenciais)
- Base de conhecimento: galeria-holding-knowledge.json (procurar no disco)
- Regra: nunca inventar dado, lacuna vira [CONFIRMAR]

## Segurança
- .env: gitignored, nunca commitado
- SUPA_CRM_SERVICE_KEY / SUPA_AGENTE_SERVICE_KEY: server-side only
- SUPA_CRM_ANON_KEY: único credential no frontend
- backups/: gitignored, PII local only
- Repositório: privado

---

## PARTE 0 — DESTRAVAR E CORRIGIR

### 0.1 Push e merge fase1
✅ CONCLUÍDA: tag pre-fase1 no GitHub, merge --no-ff, push main, Vercel auto-deploy.

### 0.2 Investigação localStorage
✅ CONCLUÍDA: ghub_accs/gh_decisores_v3 = formato flat {galeria_XXXX}, 20.536 entradas são par empresa×agência do seed, já em Supabase. Zero delta confirmado. Ver VERIFICACAO_A.md.

### 0.3 Chip do kanban global usa agencia_id (não responsavel)
Status: responsavel vem vazio em GAIA (50 cards) e inconsistente em Holding. Fix: adicionar coluna agencia_id (text slug) e popular.

### 0.4 crm_templates: 14 agências × 4 etapas + WhatsApp + LinkedIn
14 agências × etapas: 1-primeiro_contato, 2-follow_up, 3-comunidade, 4-upsell
+ variantes: whatsapp (≤400 chars, sem link no 1º), linkedin_convite (≤300), linkedin_mensagem
Assinado "Pedro Ica, Head of Growth, Galeria Holding", 20 minutos.
Etapa 1: por que a agência é relevante + {case_titulo} {case_link}.

---

## FASE C — CONTEÚDO POR AGÊNCIA

### C1. Buckets Supabase Storage
cases, credenciais, assets, backups — leitura pública nos 3 primeiros, escrita só autenticada. Vídeo por link (YouTube/Vimeo).

### C2. Cases: import
Localizar código do site de filmes (procurar em /Users/pedro.ica/Inteligencia Holding, disco, github.com/pedroica). Se achar, importar da fonte; se não, importar do site publicado. Campos: titulo, marca, categoria_da_marca, agencia_id, tipo, url_video, url_thumb (→ bucket), url_pagina, ano, idioma, situacao, tarefa, acao, resultado, resumo, tags, permitido_em_prospeccao, destaque, ativo, raw_legacy.

### C3. Tela Cases
Grade com thumbnail, título, marca, ano, tags; filtros; player; cadastro rápido por link YouTube/Vimeo; campos STAR; editar, desativar, duplicar idioma. Site de filmes pode passar a ler crm_cases por view pública.

### C4. Serviços
nome, descrição curta e longa, sinais de encaixe, entregáveis, preço min/max opcional, cases relacionados, ativo; ticket de entrada anual em crm_agencias. Semear do que já existe + knowledge.json.

### C5. Credenciais como conteúdo estruturado
crm_credenciais_blocos: tipos (capa, manifesto, numeros, ecossistema, servicos, metodologia, case, time, clientes, premios, fechamento, livre), ordem, idioma (pt/en/es), titulo, corpo markdown, dados jsonb, midia, ativo. Semear da base de conhecimento e do site, 3 idiomas.

### C6. Renderizador HTML com identidade Galeria
Cinema P&B: fundo #000000, texto branco, Helvetica Neue, números hero UltraLight gigante, azul #1F6FE5 #002F6C e vermelho #F02000 só em gráficos. Donuts brancos sem borda. Proibido: bullets, ícones, sombras, gradientes, fundos claros. Páginas 16:9, navegação por teclado, responsivo, modo apresentação.

### C7. Montador "Gerar credencial"
crm_credenciais_geradas (empresa_id, agencia_ids, idioma, blocos, cases, token, html_url, pdf_url, criado_em), rota /c/{token} pública, PDF serverless ou CSS impressão.

### C8. "Enviar pipeline" com identidade Galeria + PDF + link por token 7 dias

---

## FASE D — MOTOR DE PROSPECÇÃO

### D1. Elegibilidade
Exclusividade semanal (seg–dom BRT), 1 tema/decisor/dia, status ativo, email_valido≠false, conflito de case e carteira, cadência etapa1→etapa2 (7 dias na thread)→etapa3 (7 dias)→pausa 60 dias. Card em Reunião/Proposta/Negociação/Fechado = não recebe prospecção fria.

### D2. Seleção e rodízio
Ordena por estrelas, sinal recente, temperatura; 1 decisor/empresa. 13 agências toda semana dentro dos limites (50 emails, 80 WA, 20 LinkedIn/dia). 2–3 agências/dia, 15–25 emails cada. Abaixo de 3 reuniões/semana = prioridade.

### D3. Geração serverless
api/gerar-fila — valida JWT Supabase, usa SERVICE_ROLE_KEY e ANTHROPIC_API_KEY, modelo claude-sonnet-4-6. Por par empresa+decisor: prompt com template, serviços, empresa, decisor, case, credencial + regras (≤120 palavras, sem travessão, sem lista, sem jargão, 1 pergunta clara, assunto ≤8 palavras). Grava em crm_fila (status rascunho). Custo em tokens em crm_configuracoes.

### D4. Rotinas automáticas (Vercel Cron)
- 6h diário: gerar fila (email, WA, LinkedIn) sem click
- Semanal: Google News RSS para empresas 3+ estrelas → crm_noticias
- Diário: enriquecimento Lusha (1.400 revelações), 1 decisor+email em empresas 3+ estrelas, 2+telefone nas 5 estrelas

### D5. Aprovar hoje (polegar-first)
Abas Email/WhatsApp/LinkedIn. Cards: agência, empresa, decisor, contexto, texto, case. Editar/Aprovar/Pular/seleção múltipla. Email→rascunho Outlook (Cowork). WA→wa.me/?text= + marca enviado com desfazer. LinkedIn→copia nota + abre perfil.

### D6. Respostas
"Registrar resposta" muda decisor→respondeu, sobe temperatura, cria card em Contato se não existir. Mover→Reunião registra reuniao_marcada_em, agencia_id, origem.

### D7. Teste real
30 emails 404 no preview, 5 completos em docs/amostras/, depois 30 Catalyst com verificação de exclusividade em VERIFICACAO_D.md.

---

## FASE E — COCKPIT DO VENDEDOR

### E1. Tela "Hoje" (primeira tela)
Reuniões de hoje, respostas a tratar, follow-ups vencidos, fila para aprovar, agência do rodízio. 3 cliques max para qualquer ação.

### E2. Painel de metas
40/semana, 3/agência, semana atual + 4 anteriores. Funil por canal e agência. Taxa de resposta. Projeção honesta. Agências abaixo da meta em vermelho com ação sugerida.

### E3. Fechamento automático sexta 17h
crm_relatorios com HTML da semana, link por token, card "Semana fechada" na tela Hoje com botão por agência para copiar e colar no WhatsApp do sócio.

### E4. Melhorias autônomas (≥5)
Sugestões: 2º decisor automático em 5 estrelas, A/B de assunto por agência, alerta de decisor que trocou de empresa, resumo diário de respostas, pré-preenchimento de reunião no calendário, sugestão de próxima ação por card.

### E5. README, export semanal para bucket backups, VERIFICACAO_E.md, tag, merge, produção.

---

## Regras gerais
- Código limpo em português
- Nunca inventar número, preço ou fato de credencial
- Se contradizer o descrito, decidir pelo mais seguro para os dados, anotar e seguir
- Commit e push a cada arquivo (permissão em .claude/settings.json; se bloquear, acumular e dar o comando)
- Trabalhar até o fim: terminou uma fase, começa a próxima
- STATUS.md a cada fase: o que foi feito, o que vem, o que precisa de Pedro
