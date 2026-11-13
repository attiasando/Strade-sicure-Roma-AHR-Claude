#!/usr/bin/env bash
# Da lanciare una volta dopo ogni clone: attiva gli hook versionati in scripts/hooks.
set -e
cd "$(git rev-parse --show-toplevel)"
chmod +x scripts/hooks/pre-commit salva.sh
git config core.hooksPath scripts/hooks
echo "Hook attivati (core.hooksPath = scripts/hooks)."
