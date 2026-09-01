#!/usr/bin/env bash
# Instalador dos agentes da Galeria — um comando, do zero ao WhatsApp.
#
#   ./install.sh
#
# Ele checa o que falta, instala o que dá, roda o assistente de configuração e
# deixa o serviço ligado. Tudo o que ele instala é gratuito.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
verde() { printf "\033[32m%s\033[0m\n" "$1"; }
verm()  { printf "\033[31m%s\033[0m\n" "$1"; }
info()  { printf "\033[1m%s\033[0m\n" "$1"; }
fraco() { printf "\033[2m%s\033[0m\n" "$1"; }

info ""
info "  Agentes da Galeria — instalação"
fraco "  Três etapas. A do meio faz perguntas; o resto é automático."
info ""

# ── 1. Dependências ────────────────────────────────────────────────────────
info "1/3  Conferindo o que falta…"

if [[ "$(uname -s)" != "Darwin" ]]; then
  verm "  Este instalador é para macOS."
  fraco "  Em outro sistema, siga agent/MAC.md na mão."
  exit 1
fi

# O Homebrew instala em lugares diferentes conforme o chip, e o instalador
# dele NÃO mexe no PATH da sessão atual — então em Mac novo o `brew` "some"
# logo depois de ser instalado. Procuramos nos dois caminhos antes de desistir.
if ! command -v brew >/dev/null 2>&1; then
  for candidato in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$candidato" ]]; then
      eval "$("$candidato" shellenv)"
      break
    fi
  done
fi

if ! command -v brew >/dev/null 2>&1; then
  verm "  Falta o Homebrew, que instala o resto."
  echo
  echo "  1) Cole esta linha e espere terminar (vai pedir sua senha do Mac):"
  echo
  echo '     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo
  echo "  2) Depois rode de novo:  ./install.sh"
  echo
  exit 1
fi

faltando=()
command -v node >/dev/null 2>&1 || faltando+=("node")
command -v cloudflared >/dev/null 2>&1 || faltando+=("cloudflared")

# Node antigo conta como faltando: o projeto roda TypeScript sem build, e isso
# só existe do 22.6 em diante.
if command -v node >/dev/null 2>&1; then
  if (( $(node -p 'process.versions.node.split(".")[0]') < 22 )); then
    fraco "  Node $(node -p 'process.versions.node') é antigo; atualizando."
    faltando+=("node")
  fi
fi

if (( ${#faltando[@]} > 0 )); then
  fraco "  Instalando: ${faltando[*]} (leva alguns minutos)"
  brew install "${faltando[@]}"
  # Recarrega o ambiente do brew: recém-instalado pode não estar no PATH desta
  # sessão, e aí o passo seguinte falharia dizendo "node não encontrado".
  eval "$(brew shellenv)"
  hash -r
else
  verde "  ✓ Node e cloudflared já estão aqui"
fi

# Última checagem antes de seguir — errar aqui dá erro confuso lá na frente.
for necessario in node npm cloudflared; do
  if ! command -v "$necessario" >/dev/null 2>&1; then
    verm "  '$necessario' não apareceu no PATH mesmo depois da instalação."
    fraco "  Feche o Terminal, abra de novo e rode ./install.sh outra vez."
    exit 1
  fi
done

fraco "  Instalando dependências do projeto…"
(cd "$RAIZ" && npm install --silent --no-audit --no-fund)
verde "  ✓ pronto"

# ── 2. Configuração ────────────────────────────────────────────────────────
info ""
info "2/3  Configuração"
if [[ -f "$RAIZ/agent/.env" ]]; then
  fraco "  Já existe um .env. Enter mantém cada valor que já estava lá."
else
  fraco "  Vou perguntar uma coisa de cada vez e dizer onde achar cada uma."
  fraco "  Deixe abertos: o painel do Supabase e o developers.facebook.com."
fi
echo
(cd "$RAIZ/agent" && npm run --silent setup)

# ── 3. Serviço ─────────────────────────────────────────────────────────────
info ""
info "3/3  Ligando o serviço"
# mac-install.sh já descarrega uma instalação anterior antes de recarregar,
# então rodar o install.sh de novo é seguro e serve como "religar".
(cd "$RAIZ/agent" && ./scripts/mac-install.sh)

info ""
verde "  Tudo no ar."
echo
echo "  Abra o WhatsApp e mande  /ajuda  para o seu número comercial."
echo
fraco "  Se não responder em 1 minuto, cole isto aqui no chat comigo:"
fraco "    tail -30 ~/Library/Logs/galeria-agentes.log"
echo
