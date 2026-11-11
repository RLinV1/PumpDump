# Design System: Pumpwatch

## 1. Visual Theme & Atmosphere
A market terminal: pure black ground, amber labels, white values, 1px rules and square corners. There are no shadows, gradients, blur, glass or rounded shapes anywhere.

Two surfaces share one world:
- **`/live` is the terminal (Operate).** A command line, a ticker strip, numbered panels in a grid that fills the viewport, and a status line. Density is high (about 8): small mono type, tight rows, panels that scroll inside themselves. On a phone it becomes one stacked column and keeps the command line.
- **`/` is the landing page (Persuade).** The same palette and type at poster scale: an uneven 7/5 split hero (headline left, live terminal panel right), then sections with deliberately different padding and layouts. No equal-card grids.

Amber is the terminal's text and label colour, not a button colour on a soft page. That is what keeps it from reading as a generic orange SaaS theme.

Every figure carries its data mode. Mock data is labelled MOCK (status line, panel tags, ticker strip). Live data that is missing is shown as unavailable, never filled in.

## 2. Color Palette & Roles
All tokens live in `app/globals.css`.
- **Black** `#000000` (`--bg`, `--surface`): the ground.
- **Amber** `#FFA028` (`--accent`): labels, field names, headings, selection, reverse-video rows, primary key. 10.3:1 on black.
- **White** `#FFFFFF` (`--text`): values and body copy.
- **Gray** `#A6A6A6` (`--mute`): secondary text and metadata. 8.6:1 on black.
- **Yellow** `#FFE14D` (`--yellow`): the command line, panel numbers, highlights, flag markers, the "Watch" verdict.
- **Cyan** `#5CC8FF` (`--cyan`): links and secondary data series. 11:1 on black.
- **Panel blue** `#0A3278` (`--bar`): panel title bars with white text (12:1). The panel a command just jumped to turns amber.
- **Green** `#19E06B` (`--up`) and **Red** `#FF4D4D` (`--down`): price direction only (up, down, and the words "pump" and "dumps" in the landing headline). Never verdicts, flags, connection state or decoration.
- **Rules**: `#2B2B2B` (`--line`) and `#5C5C5C` (`--line-strong`, 3.1:1 for borders of controls).

Verdicts: "Pump likely" is amber reverse video, "Watch" is a yellow outline, "Low risk" is a gray outline.

## 3. Typography Rules
- **Display:** Big Shoulders (`--font-display`, weights 700 to 900), uppercase, tight leading. Headlines, the brand, panel scores. Chosen because it is condensed and industrial, not a stock UI sans.
- **Data and body:** IBM Plex Mono (`--font-data`), 14px base, tabular and slashed-zero figures. Everything else: values, labels, buttons, paragraphs.
- Labels are amber, values are white. Paragraphs stay under about 62 characters per line.
- **Banned:** Inter, Space Grotesk, Instrument Sans, serif faces, gradient text, em dashes.

## 4. Component Stylings
- **Buttons:** square, mono, uppercase, 44px tall. Primary is amber reverse video (yellow on hover). Ghost is a 1px amber outline that fills amber on hover. Commands are shown as `<GO>`.
- **Panels:** 1px rule border on black, a 32px title bar with a yellow number and a white title, and an uppercase data-mode tag (MOCK, LIVE). The body scrolls inside the panel.
- **Selection:** reverse video (amber fill, black text) for the selected watchlist row and the active tab.
- **Command line:** amber `PW>` prompt, yellow input with a yellow underline and caret, a `<GO>` key. Outputs appear in a status line under it: `OK ...` or `ERR: ...`. Typing opens a palette under it (a combobox with a listbox): Tickers (with score badge), Commands and an "Ask the assistant" row, matched letters in yellow, the active row in reverse video, and a key-hint row. Up and Down pick, Enter runs, Esc clears, `/` focuses from anywhere outside a field.
- **Key bar:** one button per panel (`1 WL`, `2 GR`, ...), `HELP` and `RF Refresh all`.
- **Ticker strip:** quotes for the watchlist, then the session movers. It scrolls only when motion is allowed. Otherwise it is a static, scrollable row.
- **Status line:** data mode, clock, link state (STREAMING, RECONNECTING, OFFLINE), watchlist count and the notice "Risk signal only. Not investment advice."
- **Inputs:** 1px outline on black, labels above, never placeholder-only.

## 5. Layout Principles
- Terminal workspace: Default shows the six monitoring panels in a three-column grid; Monitor shows watchlist, chart and flags; Research shows lookup, news and sentiment. Paper trading is not a panel: it is the Paper tab (`/paper`) beside Terminal in the header, labelled "Paper money, not real" and MOCK or LIVE. The assistant is not a panel either: a floating chat at the bottom right (an amber "Ask" launcher, a 360px window up to 60vh tall, a full-width bottom sheet below 640px). Saved layouts that still list `paper` or `assistant` load with those ids dropped. One or two panels use one or two columns. Below lg the chosen panels stack in the user's order. Panel rows are at least 300px and the workspace scrolls when needed.
- Workspace controls: an always-visible preset bar and an inline Customize workspace disclosure. Checkboxes show/hide panels; labelled Up/Down buttons reorder them; Restore default resets the layout. Selection and order save in this browser. Commands reveal hidden panels and preserve their state. DOM and visual order match.
- Landing: 1500px container, 16px gutters on mobile and 32px from md. Hero is 7fr / 5fr. Sections vary on purpose: a sticky heading beside a numbered list, a pinned scroll story, a 5fr / 7fr detector, an unequal 7fr / 5fr comparison and a ruled status table.
- Section padding is varied (about 40px to 112px), not one rhythm.
- No grid of identical cards anywhere.

## 6. Motion & Interaction
- The terminal is mostly still. The ticker strip scrolls slowly (60s per loop), pauses on hover or focus, and is static under `prefers-reduced-motion`.
- The hero rises in with CSS only. The scroll story pins and scrubs with GSAP and is skipped under reduced motion. Reveals use `animation-timeline: view()` with a static fallback.
- No smooth-scroll library, no parallax, no blur.
- Animate transform and opacity only.

## 7. Rules That Still Apply
- Green and red mean price direction only. Verdicts, flags and status are amber or yellow.
- The notice "Risk signal only. Not investment advice." stays visible on every page.
- No third-party brand names, logos or wordmarks. The product is PUMPWATCH.
- No emojis, no purple, no gradients, no shadows, no rounded corners, no glass.
- Text contrast at least 4.5:1, visible 2px yellow focus ring, 44px touch targets on phones, labelled controls, honest empty, loading and error states.
- No fake precision. Simulated figures are labelled simulated, mock figures are labelled MOCK.
