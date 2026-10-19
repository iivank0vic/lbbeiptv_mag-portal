#!/bin/bash
# Dodaje -webkit- prefikse u css/app.css (stari WebKit: MAG 250/254, stari Tizen/webOS).
# Pokreni nakon SVAKE promjene CSS-a; idempotentno (postojeci prefiksi se ne dupliraju).
#   tools/prefix-css.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEPS="${TMPDIR:-/tmp}/lbbe-prefix-css"
[ -d "$DEPS/node_modules/autoprefixer" ] || npm install --silent --no-audit --no-fund --prefix "$DEPS" postcss@8.4.47 autoprefixer@10.4.20 >/dev/null
NODE_PATH="$DEPS/node_modules" node -e '
var fs = require("fs"), postcss = require("postcss"), ap = require("autoprefixer");
var f = process.argv[1], css = fs.readFileSync(f, "utf8");
postcss([ap({ overrideBrowserslist: ["safari >= 5", "chrome >= 30"], flexbox: true, grid: false })])
  .process(css, { from: f, to: f })
  .then(function (r) { r.warnings().forEach(function (w) { console.warn(String(w)); }); fs.writeFileSync(f, r.css); });
' "$ROOT/css/app.css"
echo "Prefiksi dodani: css/app.css"
