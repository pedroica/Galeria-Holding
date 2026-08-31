# O Mac 24h — worker dos agentes

O Mac não recebe mensagem. Ele **trabalha**.

```
seu WhatsApp ──► Vercel /api/whatsapp ──┐
                 (URL estável, não dorme)│
                                         ├──► Supabase ◄──┐
                                         │                │
        relatórios e lotes ◄─────────────┘                │
                                                          │
              Mac 24h ─── só conexões de saída ───────────┘
              (Lusha, Anthropic/Qwen, Graph API)
```

Por que essa divisão: o webhook precisa de uma URL pública que nunca some — se
o Mac dormir, cair a luz ou a operadora trocar seu IP, você perde mensagem. Já
o trabalho pesado é o oposto: quer tempo, não disponibilidade. A Vercel mata
qualquer execução em 60s; o Mac pode passar o dia num lote.

**Nada de porta aberta, túnel, DDNS ou IP fixo.** O worker só faz chamadas de
saída. Se o Mac ficar offline por um dia, o Vercel Cron cobre a rotina daquele
dia sozinho — os dois usam a mesma marca em `settings` e não se atropelam.

## O que ele faz

| Quando | O quê |
|---|---|
| 7h30 (ou na primeira vez que ligar depois disso) | Rotina diária: lote de CMOs, lembretes do dia, relatório no seu WhatsApp |
| A cada 10 min, das 8h às 20h, dias úteis | Lote pequeno de 5 empresas, até cumprir a cota do dia |
| Todo tick | Grava um sinal de vida em `settings.worker_heartbeat` |
| Você mandar "pausa o robô" | Para no tick seguinte — o kill switch vence tudo |

A cota é a mesma `CMO_DAILY_QUOTA`. A diferença para o cron da Vercel é o
ritmo: em vez de um pico às 7h30, o trabalho se espalha pelo dia, o que é mais
gentil com o rate limit da Lusha e deixa você acompanhar o progresso ao vivo.

## Instalar

No Mac que vai ficar ligado:

```bash
# 1. Node 22+ (o código roda TypeScript direto, sem build)
brew install node

# 2. Clonar e instalar
git clone https://github.com/pedroica/Galeria-Holding.git
cd Galeria-Holding && npm install

# 3. Preencher o .env do worker
cd agent
cp .env.example .env
$EDITOR .env      # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LUSHA_API_KEY,
                  # WHATSAPP_* e ANTHROPIC_API_KEY

# 4. Conferir antes de virar serviço
npm run worker:check

# 5. Instalar como serviço do macOS
./scripts/mac-install.sh
```

O instalador recusa a instalação se o Node for antigo, se faltar `.env` ou se
o teste de conexão falhar — melhor parar aqui do que descobrir pelo log amanhã.
Ele também dá `chmod 600` no `.env`, que guarda a *service_role* do Supabase.

## Operar

```bash
tail -f ~/Library/Logs/galeria-agentes.log      # acompanhar
launchctl unload ~/Library/LaunchAgents/co.galeriaholding.agentes.plist   # parar
launchctl load   ~/Library/LaunchAgents/co.galeriaholding.agentes.plist   # religar
./scripts/mac-install.sh --uninstall            # remover o serviço
```

Rodar na mão, sem serviço, para ver o comportamento: `npm run worker`.

## Duas coisas que derrubam o worker na prática

**O Mac dormindo.** Ajustes → Bateria (ou Energia) → ligar *"Impedir que o Mac
entre em repouso automaticamente quando o monitor estiver desligado"*. Em
MacBook, isso só vale na tomada. Alternativa sem mexer em ajuste:
`caffeinate -dimsu &`.

**Atualizar o código e esquecer de reiniciar.** O launchd não recarrega sozinho
depois de um `git pull`:

```bash
git pull && launchctl unload ~/Library/LaunchAgents/co.galeriaholding.agentes.plist \
         && launchctl load ~/Library/LaunchAgents/co.galeriaholding.agentes.plist
```

## Ajustes finos

No `.env` do Mac:

| Variável | Padrão | O que muda |
|---|---|---|
| `WORKER_TICK_MIN` | `10` | Minutos entre um lote e outro |
| `WORKER_BATCH` | `5` | Empresas por lote contínuo |
| `WORKER_WINDOW_START` / `_END` | `8` / `20` | Janela de trabalho, hora local |
| `WORKER_WEEKEND` | `false` | `true` para trabalhar sábado e domingo |
| `AGENT_ENV_FILE` | `./.env` | Caminho do .env, se você guardar em outro lugar |

Para o Mac assumir mais volume que a Vercel aguentava, suba `CMO_DAILY_QUOTA` —
o limite real passa a ser o seu crédito Lusha, não o tempo de execução.

## Está funcionando?

Mande `/status` no WhatsApp: a resposta traz o último sinal de vida do worker.
Sem sinal há mais de uma hora dentro da janela de trabalho, o Mac está dormindo
ou o serviço caiu — o log diz qual dos dois.
