# Project Trinity

Trinity is a personal AI assistant that runs your schedule and keeps you on track. You talk to her in Claude; this repo is her home: an installable time-blocking app for iPhone and Mac, the connector that lets Claude change your calendar, and the server that sends reminders and asks how you're doing.

## What Trinity does

- **Talks with you, by voice or text.** She checks in like a person: before and after blocks, and in the morning, midday and evening. A notification from "Trinity" opens a conversation where she speaks in a female voice and listens. See [docs/TRINITY-CHAT.md](docs/TRINITY-CHAT.md).
- **Keeps your calendar.**
  - Time-block day view: drag, resize, 15-minute snap, live "now" line.
  - Block details with a checklist and notes.
  - Plain-English quick add, to-dos, month view, five color schemes.
- **Keeps track of your life.** Sleep, diet, exercise, mood, study, projects, money, health and mental health, with daily totals and patterns.
- **Knows your Obsidian vault.** She searches and reads notes and writes her log into your daily notes, through a small helper on your Mac. See [docs/OBSIDIAN.md](docs/OBSIDIAN.md).
- **Works inside Claude too.** The connector lets Claude's main chat, voice and Siri use the same calendar, log and notes. See [docs/CONNECT-CLAUDE.md](docs/CONNECT-CLAUDE.md).
- **Syncs your iPhone and Mac** through your own Firebase project, and works offline.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (demo mode: saved in this browser)
npm test           # unit tests (also: npm run test:all)
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
  sw.ts                 service worker (offline, push notifications)
tests/                  unit tests (Vitest)
functions/              Trinity's server: connector (MCP + OAuth), reminders, Trinity's chat (Managed Agents)
bridge/                 Mac helper for the Obsidian vault
assistant/              Trinity's personality and rules
docs/PLAN.md            roadmap and decisions
docs/SETUP.md           API key, Firebase, deploy, install
```

## Guides

| Guide | What it covers |
|---|---|
| [docs/ASSISTANT-PLAN.md](docs/ASSISTANT-PLAN.md) | The whole picture, and the setup checklist in order |
| [docs/SETUP.md](docs/SETUP.md) | API key, Firebase, deploy, install on iPhone and Mac |
| [docs/CONNECT-CLAUDE.md](docs/CONNECT-CLAUDE.md) | Connecting Trinity to Claude's main chat, voice and Siri |
| [docs/REMINDERS.md](docs/REMINDERS.md) | Notifications and check-ins |
| [docs/TRINITY-CHAT.md](docs/TRINITY-CHAT.md) | Talking with Trinity by voice or text |
| [docs/OBSIDIAN.md](docs/OBSIDIAN.md) | The Mac helper for your Obsidian vault |
| [docs/PHONE-SETUP.md](docs/PHONE-SETUP.md) | Using Trinity on your iPhone |
