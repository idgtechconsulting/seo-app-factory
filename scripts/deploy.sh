#!/bin/bash
set -e
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

echo "=== SEO App Factory Deploy ==="
echo "Started: $(date)"
echo ""

# Step 1: Extract apps from Paperclip (skip if Paperclip is not running)
echo "Step 1: Extracting apps from Paperclip..."
if curl -sf http://localhost:3100/api/companies > /dev/null 2>&1; then
  node scripts/extract-apps.js
else
  echo "  [skip] Paperclip not running — using existing staging apps"
fi

# Step 2: Evaluate all staging apps
echo ""
echo "Step 2: Evaluating staging apps..."
APPROVED=0
REJECTED=0
SKIPPED=0

for f in apps/staging/*.html; do
  [ -f "$f" ] || continue
  name=$(basename "$f")

  # Skip if already in approved/ or rejected/
  if [ -f "apps/approved/$name" ] || [ -f "apps/rejected/$name" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  result=$(node scripts/evaluate-app.js "$f" 2>/dev/null || echo '{"score":0}')
  score=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('score',0))" 2>/dev/null || echo "0")

  if [ "$score" -ge 75 ]; then
    cp "$f" apps/approved/"$name"
    # Copy metadata too
    meta="${f%.html}.meta.json"
    [ -f "$meta" ] && cp "$meta" apps/approved/"$(basename "$meta")"
    APPROVED=$((APPROVED + 1))
    echo "  APPROVED: $name (score: $score)"
  else
    cp "$f" apps/rejected/"$name"
    REJECTED=$((REJECTED + 1))
    echo "  REJECTED: $name (score: $score)"
  fi
done
echo "  Summary: $APPROVED approved, $REJECTED rejected, $SKIPPED already evaluated"

# Step 3: Build site
echo ""
echo "Step 3: Building site..."
node scripts/build-site.js

APP_COUNT=$(ls deployed/apps/*.html 2>/dev/null | wc -l | tr -d ' ')

# Step 4: Commit and push
echo ""
echo "Step 4: Committing and pushing..."
find .git -name "*.lock" -delete 2>/dev/null || true
git add -A
git commit -m "Deploy: $(date +%Y-%m-%d) — ${APP_COUNT} apps (${APPROVED} new)" || echo "  (nothing new to commit)"
git push origin main || echo "  [warn] Push failed — check remote"

echo ""
echo "Done! ${APP_COUNT} apps deployed."
echo "URL: https://freetoolbox.tools/"
echo "Finished: $(date)"
