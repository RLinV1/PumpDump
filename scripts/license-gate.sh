#!/usr/bin/env bash
# License gate: fail on non-commercial, share-alike, copyleft-network or unknown licenses.
set -uo pipefail
cd "$(dirname "$0")/.."
BAD='NC|Non[- ]?Commercial|Share[- ]?Alike|CC-BY-NC|CC-BY-SA|GPL|AGPL|SSPL|BUSL|BSL|UNKNOWN|UNLICENSED|Custom'
ALLOW=$(grep -v '^\s*#' scripts/license-allow.txt | sed 's/\s*#.*//; s/\s*$//' | grep -v '^$' || true)
fail=0

# prints "name<TAB>license" lines on stdin; flags bad ones not on the allow-list
flag() {
  while IFS=$'\t' read -r name lic; do
    # LGPL is weak copyleft (dynamic linking ok, see docs/free-use-audit.md): ignore it, keep GPL/AGPL
    echo "$lic" | sed -E 's/LGPL[-A-Za-z0-9.]*//g' | grep -Eiq "$BAD" || continue
    base="${name%@*}"; [ -z "$base" ] && base="$name"
    if echo "$ALLOW" | grep -Fxq -e "$name" -e "$base"; then continue; fi
    echo "FLAGGED: $name  [$lic]"; fail=1
  done
}

echo "== npm (web) =="
if [ -d web/node_modules ]; then
  (cd web && npx --yes license-checker@25.0.1 --production --json) > "${TMPDIR:-/tmp}/npm-lic.json" || { echo "license-checker failed"; exit 2; }
  flag < <(node -e '
    const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
    for (const [k,v] of Object.entries(d)) {
      if (k.startsWith("web@")) continue; // project own package
      console.log(k+"\t"+[].concat(v.licenses).join(" OR "));
    }' < "${TMPDIR:-/tmp}/npm-lic.json")
else
  echo "web/node_modules missing: run 'npm ci' in web/ first"; exit 2
fi

echo "== maven =="
if [ -f pom.xml ]; then
  mvn -B -q org.codehaus.mojo:license-maven-plugin:2.4.0:aggregate-add-third-party \
    -Dlicense.outputDirectory=target/license -Dlicense.excludedScopes=test,provided -Dlicense.failOnMissing=false || { echo "maven license plugin failed"; exit 2; }
  f=$(find target/license -name THIRD-PARTY.txt 2>/dev/null | head -1)
  if [ -n "$f" ]; then
    # lines look like: (License) Name (group:artifact:version - url)
    flag < <(sed -nE 's/^[[:space:]]*(\(.*\)) .*\(([^ :]+:[^ :]+):[^ ]* - .*$/\2\t\1/p' "$f") 
    grep -qi 'Unknown license' "$f" && { echo "FLAGGED: maven dependency with unknown license (see $f)"; fail=1; }
  else
    echo "no THIRD-PARTY.txt produced"; fail=1
  fi
else
  echo "pom.xml missing: skipping maven license scan"
fi

[ $fail -eq 0 ] && echo "license gate: OK" || echo "license gate: FAILED"
exit $fail
