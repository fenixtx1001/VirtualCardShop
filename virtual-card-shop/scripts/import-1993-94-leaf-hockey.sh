#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != '--apply' ]; }; then
  echo 'Usage: bash import-1993-94-leaf-hockey.sh [--apply]' >&2
  exit 1
fi
REPO=$(git rev-parse --show-toplevel)
BRANCH=codex/set-factory-1993-94-leaf-hockey
APP="$REPO/virtual-card-shop"
if [ ! -f "$APP/.env.local" ]; then
  echo "Missing $APP/.env.local; run from your configured VCS checkout." >&2
  exit 1
fi
git -C "$REPO" fetch origin "$BRANCH"
IMPORT_COMMIT=$(git -C "$REPO" rev-parse FETCH_HEAD)
TEMP_WORKTREE=$(mktemp -d /tmp/vcs-leaf-1993-94.XXXXXX)
cleanup() {
  git -C "$REPO" worktree remove --force "$TEMP_WORKTREE" >/dev/null 2>&1 || true
}
trap cleanup EXIT
git -C "$REPO" worktree add --detach "$TEMP_WORKTREE" "$IMPORT_COMMIT"
ln -s "$APP/.env.local" "$TEMP_WORKTREE/virtual-card-shop/.env.local"
cd "$TEMP_WORKTREE/virtual-card-shop"
python3 scripts/generate-1993-94-leaf-hockey.py --check
npm ci --no-audit --no-fund
npx prisma generate
BUNDLE=data/set-factory/1993-94-leaf-hockey.bundle.json
npm run import:set-bundle -- "$BUNDLE"
if [ "${1:-}" = '--apply' ]; then
  npm run import:set-bundle -- "$BUNDLE" --apply
  echo 'Imported draft: 1993_94_Leaf_Hockey. Review in Admin; leave unreleased.'
else
  echo 'Dry run only. Rerun the helper with --apply to import the unreleased draft.'
fi
