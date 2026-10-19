#!/bin/bash
# Build MAG portala u dist/ (i opcionalno deploy).
#   mag/build.sh                      -> dist/
#   mag/build.sh /putanja/do/portal   -> dist/ pa rsync u tu mapu (npr. .../zMagPortal/portal)
#   mag/build.sh user@host:/putanja   -> isto, preko ssh-a
#
# - ?v=<verzija> na svim .js/.css (MAG agresivno kesira portal).
# -webkit- prefiksi su vec u css/app.css (tools/prefix-css.sh), pa se portal moze uploadati i bez builda.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIST="$ROOT/dist"
VER=$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)
[ -n "$(cd "$ROOT" && git status --porcelain 2>/dev/null)" ] && VER="$VER-$(date +%H%M%S)"

rm -rf "$DIST"
mkdir -p "$DIST/mag"
cp -r "$ROOT/css" "$ROOT/fonts" "$ROOT/images" "$ROOT/js" "$DIST/"
cp "$ROOT/mag/polyfills.js" "$DIST/mag/"
cp "$ROOT/index.html" "$ROOT/icon.png" "$DIST/"

# Cache-busting.
sed -i -E "s#(src|href)=\"((js|css|mag)/[^\"?]+\.(js|css))\"#\1=\"\2?v=$VER\"#g" "$DIST/index.html"

echo "dist/ spreman (verzija $VER)"

if [ $# -ge 1 ]; then
    # nginx radi kao korisnik nginx: datoteke moraju biti citljive svima.
    rsync -a --delete --chmod=D755,F644 "$DIST/" "${1%/}/"
    echo "Deploy: $1"
fi
