# Project Trinity

A time-blocking app that keeps you on track. It runs as one installable app on your iPhone and your Mac, and syncs between them. An AI coach is on the way.

## What works today (phase 1)

- **Day timeline.**
  - Blocks colored by category, with a live "now" line.
  - Drag to move. Drag the bottom edge to resize (15-minute snap).
  - Drag across empty space (or long-press on iPhone) to create a block.
- **Block details.** Category, times, checklist, notes, plus **Mark done**, **+15 min**, **Tomorrow** and **Delete**, with Undo.
- **Quick add in plain English.**
  - "gym tomorrow 6pm 1h #health"
  - "call mom fri 3-3:30pm"
  - "renew passport ~20m" (no time, so it goes to Unscheduled)
  - Press ⌘K to open it on Mac, or the mic button to dictate.
- **Unscheduled to-dos.** Drag one onto the day, or send it to the next free slot.
- **Now card.** What you should be doing, how long is left, and Done / +15.
- **Month view.** A strip per day showing its blocks, % done for past days, and the selected day's agenda.
- **Color schemes.** Paper, Midnight, Sage, Dusk, Sunrise, or Auto (follows light/dark).
- **Markdown.** Copy a day as Markdown, or paste Markdown to import.
- **Sync and offline.** Google sign-in syncs iPhone and Mac through Firebase, and the app works offline.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (demo mode: saved in this browser)
npm test           # unit tests
npm run build      # production build in dist/
```

To sync between devices, set up Firebase and install the app on your phone and Mac. See **[docs/SETUP.md](docs/SETUP.md)**.

## Keyboard (Mac)

| Key | Action |
|---|---|
| ⌘K | Add |
| ← / → | Previous / next day |
| T | Today |
| M | Day / month |
| Esc | Deselect |
| Delete | Delete the selected block |
| ↑ / ↓ | Move the selected block |
| Shift ↑ / ↓ | Resize the selected block |

## Project layout

```
src/
  App.svelte            layouts for Mac and iPhone
  components/           Timeline, Detail, Sidebar, MonthView, QuickAdd, NowCard, Sheet, ...
  lib/
    app.svelte.ts       app state and actions
    backend.ts          storage interface + this-device-only storage
    firebase.ts         Google sign-in + Firestore sync
    parse.ts            plain-English quick add
    markdown.ts         Markdown export/import
    layout.ts           overlapping blocks, free-slot finder
    themes.ts           color schemes
  sw.ts                 service worker (offline; push notifications in phase 2)
tests/                  unit tests (Vitest)
docs/PLAN.md            roadmap and decisions
docs/SETUP.md           API key, Firebase, deploy, install
```

Roadmap: notifications (phase 2), week view and templates (phase 3), the AI coach (phase 4), Claude/Siri integration (phase 5). Details in [docs/PLAN.md](docs/PLAN.md).
