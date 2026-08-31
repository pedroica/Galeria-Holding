# Tudo no Mac

Um computador, um comando de configuração, um serviço, um log. O Mac recebe
suas mensagens e faz o trabalho pesado.

```
   seu WhatsApp
        │
        ▼
   Meta (Cloud API)
        │  webhook assinado
        ▼
   túnel HTTPS ──► 127.0.0.1:8787 ──► agentes ──► Supabase
   (cloudflared)     servidor local              Lusha
                                                 Claude / Qwen
```

O servidor escuta **só em 127.0.0.1**. Quem alcança de fora é o túnel — a
máquina continua fechada, sem porta aberta no roteador, sem IP fixo, sem DDNS.

## Instalar

No Mac que vai ficar ligado:

```bash
# 1. Node 22+ e o túnel
brew install node cloudflared

# 2. Clonar
git clone https://github.com/pedroica/Galeria-Holding.git
cd Galeria-Holding && npm install && cd agent

# 3. Responder as perguntas (uma por vez, com dica de onde achar cada valor)
npm run setup

# 4. Instalar o serviço
./scripts/mac-install.sh
```

O `setup` escreve o `.env` com permissão 600, testa a conexão com o Supabase e
só termina quando ela funciona. O `mac-install.sh` recusa a instalação se o Node
for antigo, se faltar `.env` ou `cloudflared`, ou se o teste falhar — melhor
parar aqui do que descobrir pelo log amanhã.

**Você não abre o painel da Meta.** Ao subir, o serviço abre o túnel, descobre a
URL pública e registra o webhook pela Graph API. Como o túnel gratuito troca de
endereço a cada reinício, ele registra de novo sempre que muda.

Confirme no log:

```bash
tail -f ~/Library/Logs/galeria-agentes.log
# túnel: https://algo-assim.trycloudflare.com
# ✓ webhook registrado na Meta: https://algo-assim.trycloudflare.com/webhook
```

Depois disso, mande `/ajuda` no WhatsApp para o número comercial.

## O que ele faz sozinho

| Quando | O quê |
|---|---|
| Ao subir, e sempre que a URL mudar | Registra o webhook na Meta |
| Mensagem sua chegando | Responde na hora, sem limite de tempo de execução |
| 7h30 (ou na primeira vez que ligar depois) | Lote de CMOs, lembretes, relatório |
| A cada 10 min, 8h–20h, dias úteis | Lote de 5 empresas, até cumprir a cota |
| Todo tick | Sinal de vida, que aparece no `/status` |

## Operar

```bash
tail -f ~/Library/Logs/galeria-agentes.log     # acompanhar
curl localhost:8787/health                     # URL pública e último registro
launchctl unload ~/Library/LaunchAgents/co.galeriaholding.agentes.plist  # parar
launchctl load   ~/Library/LaunchAgents/co.galeriaholding.agentes.plist  # religar
./scripts/mac-install.sh --uninstall           # remover
```

Rodar na mão para ver tudo acontecendo: `npm run worker`.

## As três coisas que quebram na prática

**O Mac dormindo.** É a causa número um. Ajustes → Bateria (ou Energia) →
*"Impedir que o Mac entre em repouso automaticamente quando o monitor estiver
desligado"*. Em MacBook isso só vale na tomada. Alternativa: `caffeinate -dimsu &`.

**Endereço do túnel mudando.** Acontece a cada reinício do serviço, e é
tratado sozinho — mas há uma janela de alguns segundos entre a URL nova e o
registro em que uma mensagem se perde. Se incomodar, use uma URL fixa: crie uma
conta no ngrok ou no Tailscale, pegue o endereço estático e ponha em
`PUBLIC_URL` no `.env`. Aí o endereço nunca muda.

**`git pull` sem recarregar.** O launchd não recarrega sozinho:

```bash
git pull && launchctl unload ~/Library/LaunchAgents/co.galeriaholding.agentes.plist \
         && launchctl load ~/Library/LaunchAgents/co.galeriaholding.agentes.plist
```

## Ajustes

| Variável | Padrão | O que muda |
|---|---|---|
| `DRY_RUN` | `true` | `false` libera gasto de crédito e gravação de contato |
| `CMO_DAILY_QUOTA` | `40` | Empresas por dia |
| `WORKER_TICK_MIN` | `10` | Minutos entre lotes |
| `WORKER_BATCH` | `5` | Empresas por lote |
| `WORKER_WINDOW_START` / `_END` | `8` / `20` | Janela de trabalho |
| `WORKER_WEEKEND` | `false` | `true` trabalha sábado e domingo |
| `PUBLIC_URL` | vazio | URL fixa própria, no lugar do túnel gratuito |
| `WORKER_MODE` | `all` | `worker` desliga o webhook (se hospedar em outro lugar) |
| `PORT` | `8787` | Porta local |

Mudou o `.env`? Recarregue o serviço (as duas linhas do `launchctl` acima).

## Está funcionando?

Mande `/status` no WhatsApp: a resposta traz o último sinal de vida. Sem sinal
há mais de uma hora dentro da janela de trabalho, o Mac está dormindo ou o
serviço caiu — `curl localhost:8787/health` e o log dizem qual dos dois.
