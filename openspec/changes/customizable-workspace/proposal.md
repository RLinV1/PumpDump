## Why

The terminal becomes cluttered when monitoring and research share one fixed view. Paper trading is its own tab and the assistant is a small floating chat, so neither takes a workspace panel. Users need a personal workspace with sensible starting layouts and a reliable way back to the default.

## Behaviour

- Default shows the six market-monitoring panels; Monitor shows watchlist, chart and flags; Research shows lookup, news and sentiment. The assistant is not a panel: it is a floating chat widget at the bottom right of the terminal (launcher button, small window, bottom sheet below 640px). Paper trading is not a panel either: it lives on the `/paper` tab beside the terminal.
- Users show/hide panels and move them earlier/later using labelled keyboard-accessible controls. At least one panel remains visible.
- Layout and preset choice persist in this browser. Corrupt stored layouts fall back to Default. Stored layouts that still list the retired `paper` or `assistant` ids load with those ids dropped (Default if nothing is left). If storage is blocked, edits still work for the session with an explanatory message.
- Restore default resets the panel selection and order. A command or panel shortcut reveals its target if hidden, preserving selected ticker and other panel state.
- Visual, DOM and keyboard order agree. Desktop uses a responsive grid; mobile stacks panels. Keep the existing amber-on-black design and shared command bar.

## Verification

- Unit tests: presets, invalid storage, unique panel IDs, reordering boundaries, final-panel protection, hidden-panel reveal and save/restore.
- Browser: presets, show/hide, reorder, reload persistence, default restore, command reveal, desktop and mobile.
- Refresh the README feature gallery from the resulting UI.
