# Design System: Pumpwatch

## 1. Visual Theme & Atmosphere
A dark, instrument-like market screen. Density is balanced (about 5): one chart and one evidence panel carry the first view, and the rest of the page is spacious, ruled sections. Variance is moderate: a left-aligned headline over a wide two-pane screen, hairline dividers instead of cards. Motion is calm and purposeful (about 5): the simulated market redraws only when something changes, scroll-driven reveals use CSS, and the page scrolls smoothly. The mood is a trading desk at night, without the clutter of one.

All figures on the page are simulated and labelled as such. No third-party brand names appear anywhere.

## 2. Color Palette & Roles
- **Night Screen** (#0B0B0A) — page background, never pure black
- **Panel Ink** (#121210) — pane and surface fill
- **Warm Paper** (#F1EDE2) — primary text
- **Dusk Grey** (#9A9486) — secondary text, axis labels, metadata
- **Hairline** (rgba(241,237,226,0.12)) — 1px structure; **Strong Hairline** (rgba(241,237,226,0.24)) for ghost buttons and scrollbar
- **Signal Amber** (#FFA028) — the single accent: flags, verdicts, chatter line, primary CTA, focus ring
- **Uptick Green** (#3DDC84) and **Downtick Red** (#FF5D5D) — price direction only, never verdicts or decoration

## 3. Typography Rules
- **UI and display:** Instrument Sans (`--font-ui`), tight tracking (-0.04em on the hero), hierarchy by size and colour.
- **Data:** JetBrains Mono (`--font-data`) for every number, ticker and axis label, with tabular figures.
- **Body:** about 1.1rem, relaxed leading, 50 to 65 characters per line.
- **Banned:** Inter, serif faces, gradient text.

## 4. Component Stylings
- **Buttons:** flat rectangles, 44px tall. Primary is amber fill with dark text; ghost is a strong-hairline outline. Press scales to 0.97 over 150ms ease-out. Hover changes colour only, and only on devices that hover.
- **Panes:** a 1px hairline grid on a panel fill, no shadows, no rounded corners. Each pane has a 36px header with a title and a small grey tag.
- **Chart:** canvas candlesticks in green and red, a volume strip, an amber chatter line against a dashed "normal" baseline, a dashed amber FLAG marker, a last-price tag on the right scale, and a crosshair readout on hover.
- **Score bar:** 20 segments that fill amber, with a 150ms colour ease.
- **Inputs:** thin range sliders with an amber thumb, labels above, a checkbox for the catalyst factor.

## 5. Layout Principles
- A 1400px container with 16px gutters on mobile and 32px from the md breakpoint.
- The hero is a left-aligned headline, then a subtext and actions row, then a 12-column screen (8 chart, 4 evidence) that stacks to one column below 768px.
- Short landscape screens (height under 560px) tighten padding, shrink the headline with viewport height and shorten the chart so the headline and chart start share the first view.
- Lower sections use ruled dividers and a ridge-line motif instead of cards.

## 6. Motion & Interaction
- The headline and actions enter with a CSS-only rise, so text paints before any script runs.
- The market screen is client-only canvas: ticks every 100ms, a new candle every 400ms, redraw on change only, paused when the tab is hidden, a held static frame under reduced motion.
- Scroll reveals use `animation-timeline: view()` with a plain static fallback. The pinned story and the smooth scroll use GSAP and Lenis.
- Animate transform and opacity only. No blur over canvas, no shadow blur.

## 7. Anti-Patterns (Banned)
- No emojis, no Inter, no serif, no pure black, no neon glows, no purple or blue gradients.
- Verdicts are never green or red. Colour direction means price only.
- No watchlist, filings feed or extra panes in the hero. One chart, one evidence panel.
- No real brand names, no fake precision. Every number is labelled simulated.
- No overlapping text, no bouncing scroll arrows, no "Scroll to explore".
- No AI copy clichés ("Elevate", "Seamless", "Unleash", "Next-Gen"), no em dashes.
