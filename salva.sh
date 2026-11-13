#!/usr/bin/env bash
# Riepilogo → conferma → commit → (conferma) → push. Mai --force, mai --no-verify.
# Uso: ./salva.sh "feat(area): messaggio breve"
set -e
cd "$(git rev-parse --show-toplevel)"
msg="${1:-}"
[ -n "$msg" ] || { echo "Uso: ./salva.sh \"titolo del commit\""; exit 1; }
git add -A
echo "=== git status ==="; git status --short
echo "=== git diff --stat ==="; git diff --cached --stat | tail -20
read -r -p "Committo con il titolo \"$msg\"? [s/N] " r
[ "$r" = "s" ] || { echo "Annullato (le modifiche restano in staging)."; exit 0; }
git commit -m "$msg"
read -r -p "Faccio il push su origin/$(git branch --show-current)? Il repo è PUBBLICO [s/N] " p
[ "$p" = "s" ] && git push || echo "Commit fatto, push non eseguito."
