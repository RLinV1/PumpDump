"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// Primary actions lean toward the pointer, which tells the user the control is live before the click.
export function MagneticLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !window.matchMedia("(hover: hover)").matches
    )
      return;

    const toX = gsap.quickTo(el, "x", { duration: 0.7, ease: "elastic.out(1, 0.45)" });
    const toY = gsap.quickTo(el, "y", { duration: 0.7, ease: "elastic.out(1, 0.45)" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      toX((e.clientX - (r.left + r.width / 2)) * 0.25);
      toY((e.clientY - (r.top + r.height / 2)) * 0.25);
    };
    const leave = () => {
      toX(0);
      toY(0);
    };

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, []);

  return (
    <a ref={ref} href={href} className={className}>
      {children}
    </a>
  );
}
