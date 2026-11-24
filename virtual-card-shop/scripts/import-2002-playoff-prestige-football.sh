#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != '--apply' ]; }; then
  echo 'Usage: bash import-2002-playoff-prestige-football.sh [--apply]' >&2
  exit 1
fi
REPO=$(git rev-parse --show-toplevel)
BRANCH=codex/set-factory-2002-playoff-prestige-football
APP="$REPO/virtual-card-shop"
if [ ! -f "$APP/.env.local" ]; then
  echo "Missing $APP/.env.local; run from your configured VCS checkout." >&2
  exit 1
fi
git -C "$REPO" fetch origin "$BRANCH"
IMPORT_COMMIT=$(git -C "$REPO" rev-parse FETCH_HEAD)
TEMP_WORKTREE=$(mktemp -d /tmp/vcs-prestige-2002.XXXXXX)
cleanup() {
  git -C "$REPO" worktree remove --force "$TEMP_WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT
git -C "$REPO" worktree add --detach "$TEMP_WORKTREE" "$IMPORT_COMMIT"
ln -s "$APP/.env.local" "$TEMP_WORKTREE/virtual-card-shop/.env.local"
cd "$TEMP_WORKTREE/virtual-card-shop"
python3 scripts/generate-2002-playoff-prestige-football.py --check
npm ci --no-audit --no-fund
npx prisma generate
BUNDLE=data/set-factory/2002-playoff-prestige-football.bundle.json
npm run import:set-bundle -- "$BUNDLE"
if [ "${1:-}" = '--apply' ]; then
  npm run import:set-bundle -- "$BUNDLE" --apply
  echo 'Imported draft: 2002_Playoff_Prestige_Football. Review in Admin; leave unreleased.'
else
  echo 'Dry run only. Rerun the helper with --apply to import the unreleased draft.'
fi
