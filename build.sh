#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  Schulungs-App Build-Script
#  Verwendung: ./build.sh [--no-commit]
#
#  Was es tut:
#  1. SW-Version automatisch inkrementieren (schulung-vXXX)
#  2. app.src.js → app.js kopieren (Konsistenz-Check)
#  3. Git commit + push (GitHub Pages Deploy)
#  4. Kurze Zusammenfassung ausgeben
# ══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

NO_COMMIT=false
if [[ "${1:-}" == "--no-commit" ]]; then
  NO_COMMIT=true
fi

# ─── Farben ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step() { echo -e "\n${CYAN}▶ $*${RESET}"; }
ok()   { echo -e "  ${GREEN}✅ $*${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠️  $*${RESET}"; }
err()  { echo -e "  ${RED}❌ $*${RESET}"; exit 1; }

echo -e "\n${BOLD}════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Schulungs-App Build  $(date '+%Y-%m-%d %H:%M:%S')${RESET}"
echo -e "${BOLD}════════════════════════════════════════${RESET}"

# ─── 1. SW-Version inkrementieren ─────────────────────────────
step "SW-Version inkrementieren"

SW_FILE="sw.js"
CURRENT=$(grep -oP "schulung-v\K[0-9]+" "$SW_FILE" | head -1)
if [[ -z "$CURRENT" ]]; then
  err "Keine 'schulung-vXXX' Version in $SW_FILE gefunden!"
fi
NEW=$((CURRENT + 1))

sed -i "s/schulung-v${CURRENT}/schulung-v${NEW}/g" "$SW_FILE"
echo "  schulung-v${CURRENT} → schulung-v${NEW}"
ok "sw.js aktualisiert"

# Auch in app.src.js synchronisieren (falls dort hartcodiert)
if grep -q "schulung-v${CURRENT}" app.src.js 2>/dev/null; then
  sed -i "s/schulung-v${CURRENT}/schulung-v${NEW}/g" app.src.js
  warn "app.src.js: Version auch aktualisiert (war noch v${CURRENT})"
fi

# ─── 2. app.src.js → app.js kopieren ─────────────────────────
step "app.src.js → app.js kopieren"

cp app.src.js app.js
ok "app.js = app.src.js (synchron)"

# Größe prüfen
SRC_SIZE=$(wc -c < app.src.js)
OUT_SIZE=$(wc -c < app.js)
if [[ "$SRC_SIZE" != "$OUT_SIZE" ]]; then
  err "Größenunterschied! src=${SRC_SIZE}B out=${OUT_SIZE}B — Abbruch"
fi
echo "  Dateigröße: $(numfmt --to=iec --suffix=B $SRC_SIZE)"

# ─── 3. Git Status ────────────────────────────────────────────
step "Git Status"

CHANGED=$(git diff --name-only | tr '\n' ' ')
if [[ -z "$CHANGED" ]]; then
  warn "Keine Änderungen erkannt — Build trotzdem ausgeführt (SW-Version)"
  CHANGED="sw.js app.js"
fi
echo "  Geänderte Dateien: ${CHANGED}"

# ─── 4. Commit + Push ─────────────────────────────────────────
if [[ "$NO_COMMIT" == "true" ]]; then
  warn "--no-commit: Kein Git-Commit ausgeführt"
else
  step "Git Commit + Push"
  git add -A
  git commit -m "build: v${NEW} — $(date '+%Y-%m-%d')"
  git push
  COMMIT=$(git rev-parse --short HEAD)
  ok "Deployed: commit ${COMMIT} → GitHub Pages"
fi

# ─── 5. Zusammenfassung ───────────────────────────────────────
echo -e "\n${BOLD}════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✅ Build erfolgreich${RESET}"
echo -e "  ServiceWorker : schulung-v${NEW}"
echo -e "  app.js        : synchron mit app.src.js"
if [[ "$NO_COMMIT" != "true" ]]; then
  echo -e "  Git Commit    : ${COMMIT:-n/a}"
  echo -e "  URL           : https://schulung.csc-hannover.de"
fi
echo -e "${BOLD}════════════════════════════════════════${RESET}\n"
