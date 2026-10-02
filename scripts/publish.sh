#!/usr/bin/env bash
set -euo pipefail
# Run after signing Git into koushik2002. This script does not handle credentials.
npm test
npm run build
git push origin main
printf '\nIn GitHub Settings → Pages, select GitHub Actions as the source.\nExpected website: https://koushik2002.github.io/toy-car/\n'
