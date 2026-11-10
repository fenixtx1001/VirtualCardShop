#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != '--apply' ]; }; then
  echo 'Usage: bash import-1997-score-baseball.sh [--apply]' >&2
  exit 1
fi
REPO=$(git rev-parse --show-toplevel)
BRANCH=codex/set-factory-1997-score-baseball
APP="$REPO/virtual-card-shop"
if [ ! -f "$APP/.env.local" ]; then
  echo "Missing $APP/.env.local; run from your configured VCS checkout." >&2
  exit 1
fi
git -C "$REPO" fetch origin "$BRANCH"
IMPORT_COMMIT=$(git -C "$REPO" rev-parse FETCH_HEAD)
TEMP_WORKTREE=$(mktemp -d /tmp/vcs-score-1997.XXXXXX)
cleanup() {
  git -C "$REPO" worktree remove --force "$TEMP_WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT
git -C "$REPO" worktree add --detach "$TEMP_WORKTREE" "$IMPORT_COMMIT"
ln -s "$APP/.env.local" "$TEMP_WORKTREE/virtual-card-shop/.env.local"
cd "$TEMP_WORKTREE/virtual-card-shop"
python3 scripts/generate-1997-score-baseball.py --check
npm ci --no-audit --no-fund
npx prisma generate
BUNDLE=data/set-factory/1997-score-baseball.bundle.json
npm run import:set-bundle -- "$BUNDLE"
if [ "${1:-}" = '--apply' ]; then
  npm run import:set-bundle -- "$BUNDLE" --apply
  echo 'Imported draft: 1997_Score_Baseball. Review in Admin; leave unreleased.'
else
  echo 'Dry run only. Rerun the helper with --apply to import the unreleased draft.'
fi
