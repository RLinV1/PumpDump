#!/usr/bin/env bash
# License gate: fail on non-commercial, share-alike, copyleft-network or unknown licenses.
set -uo pipefail
cd "$(dirname "$0")/.."
BAD='NC|Non[- ]?Commercial|Share[- ]?Alike|CC-BY-NC|CC-BY-SA|GPL|AGPL|SSPL|BUSL|BSL|UNKNOWN|UNLICENSED|Custom'
ALLOW=$(grep -v '^\s*#' scripts/license-allow.txt | sed 's/\s*#.*//; s/\s*$//' | grep -v '^$' || true)
fail=0
only="${1:-all}"  # all | npm | maven | python (ml) | research | cards | selftest
case "$only" in all|npm|maven|python|research|cards|selftest) ;; *) echo "usage: $0 [all|npm|maven|python|research|cards|selftest]" >&2; exit 2 ;; esac

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

# Every model card must have a "## Licenses" section with a "- model <name>: LICENSE" line for the model artifact
# itself plus "- name version: LICENSE" lines for its dependencies. Card licenses must be recognized SPDX ids
# (or allow-listed); anything unrecognized, non-commercial or share-alike fails.
KNOWN='MIT|BSD-2-Clause|BSD-3-Clause|Apache-2.0|ISC|0BSD|CC0-1.0|CC-BY-4.0|PSF-2.0|Python-2.0|Unlicense'
check_card() {
  local card="$1" lines name lic
  lines=$(sed -n '/^## Licenses/,/^## /p' "$card" | sed -nE 's/^- (.+): (.+)$/\1\t\2/p')
  if [ -z "$lines" ]; then echo "FLAGGED: model card $card has no license entries under '## Licenses'"; fail=1; return; fi
  grep -Eq '^model[[:space:]]' <<< "$lines" || { echo "FLAGGED: model card $card has no '- model <name>: LICENSE' entry"; fail=1; }
  flag <<< "$lines"
  while IFS=$'\t' read -r name lic; do
    if echo "$ALLOW" | grep -Fxq -e "$name" -e "${name%% *}"; then continue; fi
    # every id in an OR/AND expression must be recognized
    if tr -d '()' <<< "$lic" | sed -E 's/ (OR|AND) /\n/g' | grep -Evxq "$KNOWN"; then
      echo "FLAGGED: $name  [$lic] in $card is not a recognized license"; fail=1
    fi
  done <<< "$lines"
}

if [ "$only" = selftest ]; then
  d=$(mktemp -d); trap 'rm -rf "$d"' EXIT; bad=0
  t() { # expected(0=pass,1=fail) description; stdin = name<TAB>license lines
    fail=0; flag > /dev/null; [ "$fail" = "$1" ] || { echo "SELFTEST FAIL: $2"; bad=1; }
  }
  t 0 "MIT passes"            <<< $'a@1	MIT'
  t 0 "Apache OR MIT passes"  <<< $'a@1	Apache-2.0 OR MIT'
  t 0 "LGPL ignored"          <<< $'a@1	LGPL-3.0-or-later'
  t 1 "CC-BY-NC fails"        <<< $'a@1	CC-BY-NC-4.0'
  t 1 "CC-BY-SA fails"        <<< $'a@1	CC-BY-SA-4.0'
  t 1 "CC-BY-NC-SA fails"     <<< $'a@1	CC BY-NC-SA 4.0'
  t 1 "GPL fails"             <<< $'a@1	GPL-3.0'
  t 1 "AGPL fails"            <<< $'a@1	AGPL-3.0'
  t 1 "UNKNOWN fails"         <<< $'a@1	UNKNOWN'
  t 0 "allow-listed passes"   <<< $'gsap@3.12.5	Custom: https://gsap.com/standard-license'
  printf '## Licenses
- model v1: Apache-2.0
- lightgbm 4.0: MIT
' > "$d/ok.md"
  printf '## Licenses
- finbert 1: CC BY-NC-SA 4.0
' > "$d/nc.md"
  printf '## Known limits
- x
' > "$d/none.md"
  fail=0; check_card "$d/ok.md" > /dev/null;   [ $fail = 0 ] || { echo "SELFTEST FAIL: good card"; bad=1; }
  fail=0; check_card "$d/nc.md" > /dev/null;   [ $fail = 1 ] || { echo "SELFTEST FAIL: NC card"; bad=1; }
  fail=0; check_card "$d/none.md" > /dev/null; [ $fail = 1 ] || { echo "SELFTEST FAIL: card without license"; bad=1; }
  printf '## Licenses
- lightgbm 4.0: MIT
' > "$d/nomodel.md"
  fail=0; check_card "$d/nomodel.md" > /dev/null; [ $fail = 1 ] || { echo "SELFTEST FAIL: card without model license"; bad=1; }
  printf '## Licenses
- model 1: Proprietary
' > "$d/unknown.md"
  fail=0; check_card "$d/unknown.md" > /dev/null; [ $fail = 1 ] || { echo "SELFTEST FAIL: unrecognized card license"; bad=1; }
  [ $bad = 0 ] && echo "license gate selftest: OK"; exit $bad
fi

echo "== model cards =="
if [ "$only" != all ] && [ "$only" != cards ]; then echo "skipped"
else
  # shipped cards are written to ml/models/<version>/model-card.md by 'pumpml evaluate'
  n=0
  while IFS= read -r card; do check_card "$card"; n=$((n+1)); done < <(find ml research -name 'model-card*.md' -not -path '*/node_modules/*' -not -path '*/.venv/*' 2>/dev/null)
  echo "$n model card(s) checked"
fi

echo "== npm (web) =="
if [ "$only" != all ] && [ "$only" != npm ]; then echo "skipped"
elif [ -d web/node_modules ]; then
  (cd web && npx --yes license-checker@25.0.1 --production --json) > "${TMPDIR:-/tmp}/npm-lic.json" || { echo "license-checker failed"; exit 2; }
  node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")),c={};for(const [k,v] of Object.entries(d)){if(k.startsWith("web@"))continue;const l=[].concat(v.licenses).join(" OR ");c[l]=(c[l]||0)+1}console.log(Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([l,n])=>n+" "+l).join(", "))' < "${TMPDIR:-/tmp}/npm-lic.json"
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
if [ "$only" != all ] && [ "$only" != maven ]; then echo "skipped"
elif [ -f pom.xml ]; then
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

echo "== python (ml) =="
if [ "$only" != all ] && [ "$only" != python ]; then echo "skipped"
elif [ -f ml/requirements.txt ]; then
  # reads license metadata of the installed packages named in ml/requirements.txt (pip install -r it first)
  PY=$(command -v python3 || command -v python) || { echo "python missing"; exit 2; }
  flag < <("$PY" - <<'PY'
import re, sys
from importlib.metadata import metadata, PackageNotFoundError
for line in open("ml/requirements.txt"):
    name = re.split(r"[=<>~ #]", line.strip(), maxsplit=1)[0]
    if not name:
        continue
    try:
        m = metadata(name)
    except PackageNotFoundError:
        print(name + chr(9) + "UNKNOWN (not installed)"); continue
    lic = m.get("License-Expression") or " OR ".join(c.split(" :: ")[-1] for c in m.get_all("Classifier", []) if c.startswith("License ::"))
    lic = lic or (m.get("License") or "")[:60].split(chr(10))[0] or "UNKNOWN"
    print(name + chr(9) + lic)
PY
  )
else
  echo "ml/requirements.txt missing: skipping python license scan"
fi

echo "== python (research, with transitive dependencies) =="
if [ "$only" != all ] && [ "$only" != research ]; then echo "skipped"
elif [ -f research/pyproject.toml ]; then
  # walks research/pyproject.toml dependencies and everything they pull in (pip install ./research first)
  PY=$(command -v python3 || command -v python) || { echo "python missing"; exit 2; }
  flag < <("$PY" - <<'PY'
import re, tomllib
from importlib.metadata import metadata, requires, PackageNotFoundError
from packaging.requirements import Requirement
norm = lambda n: re.sub(r"[-_.]+", "-", n).lower()
todo = [norm(re.split(r"[\[=<>~ ;]", d, maxsplit=1)[0]) for d in tomllib.load(open("research/pyproject.toml", "rb"))["project"]["dependencies"]]
seen = set()
while todo:
    name = todo.pop()
    if name in seen:
        continue
    seen.add(name)
    try:
        m = metadata(name)
    except PackageNotFoundError:
        print(name + chr(9) + "UNKNOWN (not installed)"); continue
    lic = m.get("License-Expression") or " OR ".join(c.split(" :: ")[-1] for c in m.get_all("Classifier", []) if c.startswith("License ::"))
    lic = lic or (m.get("License") or "")[:60].split(chr(10))[0] or "UNKNOWN"
    print(name + chr(9) + lic)
    for r in requires(name) or []:
        req = Requirement(r)
        if not req.marker or req.marker.evaluate({"extra": ""}):  # skip extras and other platforms
            todo.append(norm(req.name))
PY
  )
else
  echo "research/pyproject.toml missing: skipping"
fi

[ $fail -eq 0 ] && echo "license gate: OK" || echo "license gate: FAILED"
exit $fail
