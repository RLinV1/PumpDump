import type { Panel } from "./commands";

export type Workspace = { name: string; panels: Panel[] };
export const PRESETS: Record<string, Workspace> = {
  default: { name: "default", panels: ["watchlist", "chart", "flags", "movers", "news", "sentiment"] },
  monitor: { name: "monitor", panels: ["watchlist", "chart", "flags"] },
  research: { name: "research", panels: ["lookup", "news", "sentiment"] },
};
const IDS = new Set<string>([...PRESETS.default.panels, "lookup"]);
const KEY = "pumpwatch:workspace:v1";

// Ids that are not panels any more (older saved layouts) are dropped.
export function parseWorkspace(raw: string | null): Workspace {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !Array.isArray(value.panels) || value.panels.length > 16) return PRESETS.default;
    const panels: Panel[] = value.panels.filter((p: unknown): p is Panel => typeof p === "string" && IDS.has(p));
    if (!panels.length || new Set(panels).size !== panels.length) return PRESETS.default;
    if (value.panels.some((p: unknown) => typeof p !== "string")) return PRESETS.default;
    const preset = PRESETS[value.name];
    const name = preset && JSON.stringify(preset.panels) === JSON.stringify(panels) ? preset.name : "custom";
    return { name, panels };
  } catch { return PRESETS.default; }
}

export function togglePanel(workspace: Workspace, panel: Panel): Workspace {
  if (workspace.panels.includes(panel)) {
    if (workspace.panels.length === 1) return workspace;
    return { name: "custom", panels: workspace.panels.filter((p) => p !== panel) };
  }
  return { name: "custom", panels: [...workspace.panels, panel] };
}

export function movePanel(workspace: Workspace, panel: Panel, direction: -1 | 1): Workspace {
  const index = workspace.panels.indexOf(panel), target = index + direction;
  if (index < 0 || target < 0 || target >= workspace.panels.length) return workspace;
  const panels = [...workspace.panels];
  [panels[index], panels[target]] = [panels[target], panels[index]];
  return { name: "custom", panels };
}

export function revealPanel(workspace: Workspace, panel: Panel): Workspace {
  return workspace.panels.includes(panel) ? workspace : togglePanel(workspace, panel);
}

export function readWorkspace(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function subscribeWorkspace(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(KEY, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(KEY, onChange); };
}
export function saveWorkspace(workspace: Workspace) {
  localStorage.setItem(KEY, JSON.stringify(workspace));
  window.dispatchEvent(new Event(KEY));
}
