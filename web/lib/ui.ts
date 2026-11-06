// Shared UI constants. Kept out of "use client" files: a server component that imports a value from a
// client module receives a client reference, not the string.
export const REPO_URL = "https://github.com/RLinV1/PumpDump";

// Buttons are terminal keys: square, mono, uppercase. Primary is reverse video; ghost is an amber outline.
const btn =
  "inline-flex h-11 items-center justify-center px-4 font-mono text-xs font-semibold uppercase tracking-wide transition-colors duration-100 ease-out active:translate-y-px";

export const btnPrimary = `${btn} bg-accent text-bg hover:bg-yellow`;
export const btnGhost = `${btn} border border-accent text-accent hover:bg-accent hover:text-bg`;

export const heading =
  "font-display text-[clamp(2.4rem,5vw,4.25rem)] font-extrabold uppercase leading-[0.95] tracking-[0.005em] text-accent";
