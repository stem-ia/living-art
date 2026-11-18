#!/bin/bash
# Publish or update one gallery on the live site.
#   bash tools/add-gallery.sh ~/Downloads/art20-jan-2027.zip
# The zip is what the Gallery Builder downloads. If the gallery already exists, this replaces it.
# Needs the clone that publish-living-art.sh made at ~/Developer/living-art (or set LIVING_ART_REPO).
set -e
ZIP="$1"
REPO="${LIVING_ART_REPO:-$HOME/Developer/living-art}"
[ -f "$ZIP" ] || { echo "Usage: bash tools/add-gallery.sh <gallery.zip>"; exit 1; }
[ -d "$REPO/.git" ] || { echo "No clone at $REPO. Publish the site first, or set LIVING_ART_REPO."; exit 1; }
TMP="$(mktemp -d)"
unzip -q "$ZIP" -d "$TMP"
GJ="$(find "$TMP" -name gallery.json -not -path '*/__MACOSX/*' | head -1)"
[ -n "$GJ" ] || { echo "That zip has no gallery.json. Is it a Gallery Builder zip?"; exit 1; }
DIR="$(dirname "$GJ")"
ID="$(basename "$DIR")"
case "$ID" in *[!a-z0-9_-]*|"") echo "Unexpected gallery folder name: $ID"; exit 1;; esac
[ -f "$DIR/targets.mind" ] || { echo "The gallery is missing targets.mind."; exit 1; }
cd "$REPO"
git pull --ff-only
mkdir -p galleries
rm -rf "galleries/$ID"
cp -R "$DIR" "galleries/$ID"
find "galleries/$ID" -name .DS_Store -delete
git add -A "galleries/$ID"
if git diff --cached --quiet; then echo "No change: $ID is already published exactly like this."; exit 0; fi
git commit -q -m "Gallery: $ID ($(date +%F))"
git push
N="$(grep -c '"image"' "galleries/$ID/gallery.json" || true)"
echo
echo "Published $ID ($N artworks). Live in about a minute:"
echo "  https://stem-ia.github.io/living-art/view.html?g=$ID"
