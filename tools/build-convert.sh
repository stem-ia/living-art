#!/bin/bash
# Rebuilds lib/convert.js from tools/convert.src.js. Needs Node. Run from the tools folder:  bash build-convert.sh
set -e
cd "$(dirname "$0")"
[ -d node_modules/mediabunny ] || npm install --no-save esbuild mediabunny
V=$(node -p "require('./node_modules/mediabunny/package.json').version")
npx esbuild convert.src.js --bundle --format=esm --minify --target=es2020,safari15 --legal-comments=none \
  --banner:js="/* Living Art video converter. Bundles Mediabunny $V (c) Vanilagy and contributors, MPL-2.0, source at https://github.com/Vanilagy/mediabunny . Built from tools/convert.src.js. */" \
  --outfile="${OUT:-../lib/convert.js}"
