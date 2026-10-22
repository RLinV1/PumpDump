// Shared UI constants. Kept out of "use client" files: a server component that imports a value from a
// client module receives a client reference, not the string.
export const REPO_URL = "https://github.com/RLinV1/PumpDump";

export const keyBtn =
  "inline-flex h-11 items-center border border-amber px-5 text-sm font-bold uppercase tracking-wide transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97] focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-amber";

export const heading =
  "max-w-5xl text-[clamp(1.75rem,4vw,3.5rem)] font-bold uppercase leading-[1.1] tracking-tight text-amber";
