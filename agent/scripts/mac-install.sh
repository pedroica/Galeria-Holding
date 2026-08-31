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
  echo "  Copie o exemplo e preencha:  cp .env.example .env" >&2
  exit 1
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
sleep 2

if launchctl list | grep -q "$LABEL"; then
  echo
  echo "✓ worker instalado e rodando."
  echo
  echo "  ver o log:      tail -f $LOG"
  echo "  parar:          launchctl unload $PLIST"
  echo "  religar:        launchctl load $PLIST"
  echo "  desinstalar:    ./scripts/mac-install.sh --uninstall"
  echo
  echo "  ⚠  Impeça o Mac de dormir: Ajustes → Bateria/Energia →"
  echo "     'Impedir que o Mac entre em repouso automaticamente'."
else
  echo "✗ o launchd não manteve o serviço de pé. Veja: $ERRLOG" >&2
  exit 1
fi
