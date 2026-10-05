#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BRANCH="codex/analytics-portfolio-refresh-20261005"
CURRENT_BRANCH="$(git branch --show-current)"

if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
  echo "ERROR: Run this from $EXPECTED_BRANCH (currently on $CURRENT_BRANCH)."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working tree is not clean before applying the refresh."
  git status --short
  exit 1
fi

echo "=== APPLY BACKEND REFRESH ==="
python3 scripts/apply-analytics-refresh-backend.py

echo
echo "=== APPLY FRONTEND REFRESH ==="
python3 scripts/apply-analytics-refresh-frontend.py

echo
echo "=== FORMAT PRISMA ==="
npx prisma format

echo
echo "=== INSTALL DEPENDENCIES ==="
npm ci

echo
echo "=== GENERATE PRISMA CLIENT ==="
npx prisma generate

echo
echo "=== APPLY ADDITIVE DATABASE UPGRADE ==="
npx tsx scripts/install-analytics-portfolio-refresh.ts

echo
echo "=== RUN ACCOUNTING / CALENDAR TESTS ==="
node --import tsx --test tests/analytics-portfolio.test.ts

echo
echo "=== PRODUCTION BUILD ==="
npm run build

echo
echo "=== CLEAN TEMPORARY GENERATORS ==="
rm -f \
  scripts/apply-analytics-refresh-backend.py \
  scripts/apply-analytics-refresh-frontend.py \
  scripts/run-analytics-portfolio-refresh.sh

echo
echo "=== REVIEW FINAL DIFF ==="
git status --short
git diff --stat main...HEAD || true
git diff --stat

echo
echo "=== COMMIT GENERATED ANALYTICS REFRESH ==="
git add -A
git commit -m "Refresh Analytics portfolio and daily competition"

echo
echo "=== PUSH ==="
git push origin "$EXPECTED_BRANCH"

echo
echo "============================================"
echo "ANALYTICS PORTFOLIO REFRESH COMPLETE"
echo "Branch: $EXPECTED_BRANCH"
echo "Tests and production build passed before commit."
echo "============================================"
