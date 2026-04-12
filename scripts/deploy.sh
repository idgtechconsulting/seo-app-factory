#!/bin/bash
set -e
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

echo "=== SEO App Factory Deploy ==="
echo ""

echo "Extracting apps from Paperclip..."
node scripts/extract-apps.js

echo ""
echo "Evaluating apps..."
for f in apps/staging/*.html; do
  result=$(node scripts/evaluate-app.js "$f" 2>/dev/null)
  score=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('score',0))" 2>/dev/null || echo "0")
  name=$(basename "$f")
  if [ "$score" -ge 70 ]; then
    cp "$f" apps/approved/"$name"
    echo "  APPROVED: $name (score: $score)"
  else
    cp "$f" apps/rejected/"$name"
    echo "  REJECTED: $name (score: $score)"
  fi
done

echo ""
echo "Building site..."
node scripts/build-site.js

APP_COUNT=$(ls deployed/apps/*.html 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "Committing and pushing..."
git add -A
git commit -m "Deploy: $(date +%Y-%m-%d) - ${APP_COUNT} apps" || echo "(nothing new to commit)"
git push origin main

echo ""
echo "Done! Site will update at GitHub Pages."
echo "URL: https://idgtechconsulting.github.io/seo-app-factory/"
