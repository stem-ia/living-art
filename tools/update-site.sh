#!/bin/bash
# Push a new version of the Living Art pages (viewer, builder, student page) to the live site.
# Galleries that are already online are left alone. Only the demo gallery is refreshed.
#   bash tools/update-site.sh
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${LIVING_ART_REPO:-$HOME/Developer/living-art}"
[ -d "$REPO/.git" ] || { echo "No clone at $REPO. Run publish-living-art.sh first."; exit 1; }
cd "$REPO"
git pull --ff-only
rsync -a --exclude .git --exclude galleries --exclude node_modules --exclude .DS_Store "$SRC/" "$REPO/"
rsync -a --delete --exclude .DS_Store "$SRC/galleries/demo/" "$REPO/galleries/demo/"
git add -A
git commit -q -m "Living Art site update ($(date +%F))" || { echo "Nothing changed."; exit 0; }
git push
echo "Pushed. Live in about a minute: https://stem-ia.github.io/living-art/"
