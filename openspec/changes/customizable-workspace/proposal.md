## Why

The terminal becomes cluttered when monitoring, research, paper trading and ASK share one fixed view. Users need a personal workspace with sensible starting layouts and a reliable way back to the default.

## Behaviour

- Default shows the six market-monitoring panels; Monitor shows watchlist, chart and flags; Research shows lookup, assistant, news and sentiment; Trading shows watchlist, lookup and paper trading.
- Users show/hide panels and move them earlier/later using labelled keyboard-accessible controls. At least one panel remains visible.
- Layout and preset choice persist in this browser. Corrupt or outdated stored layouts fall back to Default. If storage is blocked, edits still work for the session with an explanatory message.
- Restore default resets the panel selection and order. A command or panel shortcut reveals its target if hidden, preserving selected ticker and other panel state.
- Visual, DOM and keyboard order agree. Desktop uses a responsive grid; mobile stacks panels. Keep the existing amber-on-black design and shared command bar.

## Verification

- Unit tests: presets, invalid storage, unique panel IDs, reordering boundaries, final-panel protection, hidden-panel reveal and save/restore.
- Browser: presets, show/hide, reorder, reload persistence, default restore, command reveal, desktop and mobile.
- Refresh the README feature gallery from the resulting UI.
