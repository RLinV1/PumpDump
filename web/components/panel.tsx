// A terminal window: amber title bar, one-pixel frame, dark fill.
export function Panel({
  title,
  tag,
  children,
  className = "",
  barClassName = "bg-amber text-bg",
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div className={`border border-line bg-panel ${className}`}>
      <div
        className={`flex items-center justify-between px-3 py-1 text-xs font-bold uppercase tracking-wide ${barClassName}`}
      >
        <span>{title}</span>
        {tag ? <span>{tag}</span> : null}
      </div>
      {children}
    </div>
  );
}
