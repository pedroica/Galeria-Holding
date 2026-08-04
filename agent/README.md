# Agente Outbound Galeria

Sistema omnichannel de prospecção (email + WhatsApp + contatos) orquestrado por
um **cadence engine** por contato. Supabase é a fonte única da verdade.

> **Status:** Fase 0 (Blocklist) concluída. Fases 1–4 em construção, com gate de
> aprovação ao final de cada fase. `DRY_RUN=true` por padrão — nada real sem OK.

## Requisitos
- Node.js ≥ 22.6 (usa `--experimental-strip-types`, roda TypeScript sem build).

## Rodar (Fase 0)
```bash
cd agent
npm test                 # todos os testes (matching, dedupe, dry run)
npm run dryrun:blocklist # simulação: 5 fictícias + 2 blocklist
```

## Estrutura
```
agent/
├─ src/
│  ├─ types.ts
│  ├─ lib/
│  │  ├─ normalize.ts        # normalização texto/domínio/telefone + validações
│  │  └─ blocklist.ts        # BlocklistMatcher (domínio, nome, grupo econômico)
│  ├─ data/blocklist.seed.ts # 16 clientes atuais da Holding
│  └─ dryrun/blocklist-sim.ts
├─ tests/                    # node:test (zero dependência)
├─ scripts/dryrun-blocklist.ts
├─ supabase/migrations/0000_init.sql
└─ .env.example              # TODAS as credenciais/env vars (todas as fases)
```

## Fonte da verdade do matching
`src/lib/blocklist.ts` (testado). A aba "Blocklist" do CRM (`../block_blocklist.js`)
tem um espelho JS das mesmas regras só para o testador de conveniência; quando o
Supabase for conectado, CRM e worker leem a mesma tabela `blocklist`.
