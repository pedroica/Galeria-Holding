#!/usr/bin/env bash
# Instala o worker dos agentes como serviço do macOS (launchd).
#
#   cd agent && ./scripts/mac-install.sh
#
# Depois disso o worker sobe sozinho no boot, reinicia se cair, e escreve log
# em ~/Library/Logs/galeria-agentes.log.
#
# Para desinstalar:  ./scripts/mac-install.sh --uninstall

set -euo pipefail

LABEL="co.galeriaholding.agentes"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/galeria-agentes.log"
ERRLOG="$HOME/Library/Logs/galeria-agentes.error.log"

# Diretório do pacote agent/, resolvido a partir deste script.
AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

descarregar() {
  if launchctl list | grep -q "$LABEL"; then
    launchctl unload "$PLIST" 2>/dev/null || true
  fi
}

if [[ "${1:-}" == "--uninstall" ]]; then
  descarregar
  rm -f "$PLIST"
  echo "✓ worker removido. Os logs continuam em $LOG"
  exit 0
fi

# ── Checagens antes de instalar ────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node não encontrado. Instale o Node 22+ (brew install node) e rode de novo." >&2
  exit 1
fi

NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 22 )); then
  echo "✗ Node $NODE_MAJOR encontrado; o worker precisa do 22 ou maior." >&2
  echo "  O código roda TypeScript direto, sem build, e isso exige 22.6+." >&2
  exit 1
fi

if [[ ! -f "$AGENT_DIR/.env" ]]; then
  echo "✗ Falta $AGENT_DIR/.env" >&2
  echo "  Rode o assistente, que pergunta cada valor e diz onde achar:" >&2
  echo "    npm run setup" >&2
  exit 1
fi

# O túnel dá a URL pública que a Meta chama. Só é dispensável se você já tem
# uma URL fixa própria (ngrok, Tailscale Funnel, domínio) em PUBLIC_URL.
if ! grep -qE "^\s*(export\s+)?PUBLIC_URL=..*" "$AGENT_DIR/.env"; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "✗ cloudflared não encontrado — é ele que expõe o webhook para a Meta." >&2
    echo "  Instale:  brew install cloudflared" >&2
    echo "  (ou defina PUBLIC_URL no .env, se já tiver uma URL pública própria)" >&2
    exit 1
  fi
  echo "→ Túnel: $(command -v cloudflared)"
fi

for obrigatoria in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if ! grep -qE "^\s*(export\s+)?$obrigatoria=..*" "$AGENT_DIR/.env"; then
    echo "✗ $obrigatoria não está preenchida no .env" >&2
    exit 1
  fi
done

# Permissão do .env: ele guarda a service_role key do Supabase.
chmod 600 "$AGENT_DIR/.env"

echo "→ Node:  $NODE_BIN (v$(node -p 'process.versions.node'))"
echo "→ Agent: $AGENT_DIR"

# ── Teste de fumaça: conecta antes de virar serviço ────────────────────────
echo "→ testando conexão com o Supabase…"
if ! (cd "$AGENT_DIR" && node --experimental-strip-types scripts/worker-check.ts); then
  echo "✗ o teste falhou — corrija o .env antes de instalar o serviço." >&2
  exit 1
fi

# ── plist ──────────────────────────────────────────────────────────────────
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
descarregar

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--experimental-strip-types</string>
    <string>$AGENT_DIR/src/worker/daemon.ts</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$AGENT_DIR</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENT_ENV_FILE</key>
    <string>$AGENT_DIR/.env</string>
    <key>NODE_NO_WARNINGS</key>
    <string>1</string>
  </dict>

  <!-- Sobe no login e reinicia se cair. -->
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Espera 30s antes de reiniciar: erro de config não vira loop quente. -->
  <key>ThrottleInterval</key>
  <integer>30</integer>

  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$ERRLOG</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLISTEOF

launchctl load "$PLIST"

# O primeiro start pode demorar: o daemon conecta no Supabase e abre o túnel
# antes de responder. Conferir em 2s dizia "falhou" num serviço saudável —
# então esperamos ele atender de verdade, com uma janela generosa.
PORTA="$(grep -E '^\s*(export\s+)?PORT=' "$AGENT_DIR/.env" | tail -1 | sed 's/.*=//' | tr -d '[:space:]')"
PORTA="${PORTA:-8787}"

printf "→ aguardando o serviço responder"
subiu=0
for _ in $(seq 1 30); do
  sleep 2
  printf "."
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1; then
    subiu=1
    break
  fi
done
echo

if (( subiu == 1 )); then
  echo
  echo "✓ worker instalado e rodando."
  echo
  echo "  ver o log:      tail -f $LOG"
  echo "  parar:          launchctl unload $PLIST"
  echo "  religar:        launchctl load $PLIST"
  echo "  desinstalar:    ./scripts/mac-install.sh --uninstall"
  echo
  echo "  Em ~30s ele abre o túnel e registra o webhook na Meta sozinho."
  echo "  Confirme no log a linha '✓ webhook registrado na Meta'."
  echo
  echo "  ⚠  Impeça o Mac de dormir: Ajustes → Bateria/Energia →"
  echo "     'Impedir que o Mac entre em repouso automaticamente'."
  echo "     Sem isso, o Mac dormindo = mensagens não respondidas."
elif launchctl list | grep -q "$LABEL"; then
  echo
  echo "⚠ o serviço está carregado, mas ainda não respondeu na porta $PORTA."
  echo "  Costuma ser o túnel demorando. Acompanhe:"
  echo "    tail -f $LOG"
  exit 0
else
  echo "✗ o launchd não manteve o serviço de pé." >&2
  echo "  Erro em: $ERRLOG" >&2
  echo "  Para ver na hora:  cd $AGENT_DIR && npm run worker" >&2
  exit 1
fi
