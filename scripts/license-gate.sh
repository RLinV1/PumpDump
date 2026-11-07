#!/usr/bin/env bash
# License gate: fail on non-commercial, share-alike, copyleft-network or unknown licenses.
set -uo pipefail
cd "$(dirname "$0")/.."
BAD='NC|Non[- ]?Commercial|Share[- ]?Alike|CC-BY-NC|CC-BY-SA|GPL|AGPL|SSPL|BUSL|BSL|UNKNOWN|UNLICENSED|Custom'
ALLOW=$(grep -v '^\s*#' scripts/license-allow.txt | sed 's/\s*#.*//; s/\s*$//' | grep -v '^$' || true)
fail=0
only="${1:-all}"  # all | npm | maven | python (ml) | research
case "$only" in all|npm|maven|python|research) ;; *) echo "usage: $0 [all|npm|maven|python|research]" >&2; exit 2 ;; esac

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
if [ "$only" != all ] && [ "$only" != npm ]; then echo "skipped"
elif [ -d web/node_modules ]; then
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
