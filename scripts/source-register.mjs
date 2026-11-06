export function configuredSourceKeys(yamlFiles) {
  const keys = new Set();
  for (const yaml of yamlFiles) {
    const lines = yaml.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^  sources:\s*$/.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length && (/^\s*$/.test(lines[j]) || /^\s{3,}\S/.test(lines[j])); j++) {
        const match = lines[j].match(/^    ([a-z][a-z0-9-]*):/);
        if (match) keys.add(match[1]);
      }
    }
  }
  return [...keys].sort();
}

export function validateSourceRegister(sourceKeys, markdown, today, maxAgeDays = 90) {
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length >= 8 && cells[1] !== "Config key" && cells[1] !== "---") rows.set(cells[1], cells);
  }

  const now = Date.parse(`${today}T00:00:00Z`);
  const errors = [];
  for (const key of sourceKeys) {
    const row = rows.get(key);
    if (!row) {
      errors.push(`${key}: no register row`);
      continue;
    }
    const verified = Date.parse(`${row[6]}T00:00:00Z`);
    if (Number.isFinite(verified) && now - verified > maxAgeDays * 86_400_000) {
      errors.push(`${key}: verification date is stale`);
    }
  }
  return errors;
}
