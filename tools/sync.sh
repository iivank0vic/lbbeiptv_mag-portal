#!/bin/bash
# Prenosi zajednicki kod iz OVOG repozitorija u drugi (LG <-> Samsung <-> MAG).
# Ne dira js/platform.js, manifeste, ikone ni SDK blok u index.html.
#   tools/sync.sh ../lbbeiptv_samsung-app
set -e
SRC=$(cd "$(dirname "$0")/.." && pwd)
DST=${1:?"Putanja do drugog repozitorija (npr. ../lbbeiptv_samsung-app)"}
DST=$(cd "$DST" && pwd)
[ "$SRC" = "$DST" ] && { echo "Isti repozitorij."; exit 1; }

for d in css fonts images tools; do
  rm -rf "$DST/$d"
  cp -r "$SRC/$d" "$DST/$d"
done
# js/ bez platform.js
PLATFORM_BACKUP=$(mktemp)
cp "$DST/js/platform.js" "$PLATFORM_BACKUP"
rm -rf "$DST/js"
cp -r "$SRC/js" "$DST/js"
cp "$PLATFORM_BACKUP" "$DST/js/platform.js"
rm -f "$PLATFORM_BACKUP"
cp "$SRC/README.md" "$SRC/AGENTS.md" "$DST/"

# index.html: zadrzi SDK liniju odredista (jedina linija s webOSTV.js / $WEBAPIS / mag/polyfills.js).
DST_SDK=$(grep -E 'webOSTV\.js|\$WEBAPIS|mag/polyfills\.js' "$DST/index.html" | head -1)
SRC_SDK=$(grep -E 'webOSTV\.js|\$WEBAPIS|mag/polyfills\.js' "$SRC/index.html" | head -1)
cp "$SRC/index.html" "$DST/index.html"
if [ -n "$DST_SDK" ] && [ -n "$SRC_SDK" ]; then
  python3 - "$DST/index.html" "$SRC_SDK" "$DST_SDK" <<'PY' 2>/dev/null || node -e "const fs=require('fs');const [p,a,b]=process.argv.slice(1);fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(a,b));" "$DST/index.html" "$SRC_SDK" "$DST_SDK"
import sys
p, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding='utf-8').read().replace(a, b)
open(p, 'w', encoding='utf-8').write(s)
PY
fi
echo "Sinkronizirano: $SRC -> $DST"
