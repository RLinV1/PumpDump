"use client";

import { PANELS } from "@/lib/commands";
import { PRESETS, movePanel, togglePanel, type Workspace } from "@/lib/workspace";

const keyClass = "min-h-11 shrink-0 border-r border-line px-3 text-xs uppercase text-accent hover:bg-accent hover:text-bg disabled:text-mute disabled:hover:bg-bg disabled:hover:text-mute lg:min-h-9";

export function WorkspaceToolbar({ workspace, onChange, error }: { workspace: Workspace; onChange: (value: Workspace) => void; error?: string }) {
  return <section aria-label="Workspace settings" className="shrink-0 border-b border-line bg-bg">
    <div className="flex flex-wrap items-center">
      <span className="px-3 py-2 text-xs text-mute">WORKSPACE</span>
      <div role="group" aria-label="Workspace presets" className="flex flex-wrap">
        {Object.entries(PRESETS).map(([id, preset]) => <button key={id} type="button" aria-pressed={workspace.name === id} onClick={() => onChange(preset)} className={`${keyClass} ${workspace.name === id ? "bg-accent text-bg" : ""}`}>{id}</button>)}
      </div>
      <span role="status" className="px-3 py-2 text-xs text-mute">{workspace.name === "custom" ? "CUSTOM · " : ""}{workspace.panels.length} panels</span>
    </div>
    <details className="group border-t border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs text-yellow hover:bg-line lg:min-h-9"><span>CUSTOMIZE WORKSPACE <span aria-hidden="true" className="group-open:hidden">+</span><span aria-hidden="true" className="hidden group-open:inline">−</span></span><span className="text-mute">Show, hide & reorder</span></summary>
      <div className="max-h-[45dvh] overflow-y-auto border-t border-line p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-[64ch] text-xs text-mute">Choose your panels, then move them earlier or later. Changes save in this browser. Commands open hidden panels when you need them.</p>
          <button type="button" className={`${keyClass} border border-line-strong`} onClick={() => onChange(PRESETS.default)}>Restore default</button>
        </div>
        <ol className="grid gap-x-6 md:grid-cols-2 lg:grid-cols-3">
          {[...workspace.panels, ...PANELS.map((p) => p.id).filter((id) => !workspace.panels.includes(id))].map((id) => {
            const panel = PANELS.find((p) => p.id === id)!;
            const index = workspace.panels.indexOf(id), visible = index !== -1;
            return <li key={id} className="flex items-center justify-between gap-2 border-t border-line">
              <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={visible} disabled={visible && workspace.panels.length === 1} onChange={() => onChange(togglePanel(workspace, id))} className="h-4 w-4 accent-accent" />{panel.title}
              </label>
              <div className="flex">
                <button type="button" aria-label={`Move ${panel.title} earlier`} disabled={!visible || index === 0} onClick={() => onChange(movePanel(workspace, id, -1))} className={`${keyClass} border-l border-line`}>Up</button>
                <button type="button" aria-label={`Move ${panel.title} later`} disabled={!visible || index === workspace.panels.length - 1} onClick={() => onChange(movePanel(workspace, id, 1))} className={keyClass}>Down</button>
              </div>
            </li>;
          })}
        </ol>
      </div>
    </details>
    {error && <p role="alert" className="px-3 py-2 text-xs text-yellow">{error}</p>}
  </section>;
}
