# Project Trinity

Trinity is a personal AI assistant that runs your schedule and keeps you on track. You talk to her in Claude; this repo is her home: an installable time-blocking app for iPhone and Mac, the connector that lets Claude change your calendar, and the server that sends reminders and asks how you're doing.

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
functions/              Trinity's server: Claude connector (MCP tools + OAuth sign-in), reminders and check-ins
docs/PLAN.md            roadmap and decisions
docs/SETUP.md           API key, Firebase, deploy, install
```

Connect Claude so Trinity can manage the calendar by voice: [docs/CONNECT-CLAUDE.md](docs/CONNECT-CLAUDE.md). Reminders and "how are you doing?" check-ins: [docs/REMINDERS.md](docs/REMINDERS.md). Roadmap and build order: [docs/ASSISTANT-PLAN.md](docs/ASSISTANT-PLAN.md). Use Trinity on your iPhone today: [docs/PHONE-SETUP.md](docs/PHONE-SETUP.md).
