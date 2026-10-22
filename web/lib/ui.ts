// Shared UI constants. Kept out of "use client" files: a server component that imports a value from a
// client module receives a client reference, not the string.
export const REPO_URL = "https://github.com/RLinV1/PumpDump";

const btn =
  "inline-flex h-11 items-center px-5 text-sm font-medium transition-[background-color,color,border-color,scale] duration-100 ease-out active:scale-[0.97] focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-accent";

export const btnPrimary = `${btn} bg-accent text-bg hover:bg-text`;
export const btnGhost = `${btn} border border-line-strong text-text hover:border-text`;

export const heading =
  "text-[clamp(1.9rem,4.2vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]";
