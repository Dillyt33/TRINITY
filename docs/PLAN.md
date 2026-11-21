# Project Trinity: plan (v3)

A time-blocking app with an AI coach that keeps you on track. It's one installable app on your iPhone and your Mac, kept in sync through your own Firebase project.

Concept mockups: https://claude.ai/artifact/6Fpr2gprsuVvDJEaNj3eZr

## Decisions so far

| Topic | Decision |
|---|---|
| App type | Installable web app (PWA): iPhone Home Screen and Mac Dock. Native wrapper later if wanted |
| Sync | Firebase (Google sign-in + Firestore), under your Google account |
| Google Calendar | Not needed |
| Coach tone | Direct, some tough love, some warmth |
| Coach voice | Female |
| Budget | About $5–15/mo for the Claude API |
| Color scheme | Any default; switchable (Paper, Midnight, Sage, Dusk, Sunrise, or Auto) |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | **Foundation.** Installable app, Google sign-in, live sync, day timeline (drag, resize, 15-min snap), block details (checklist, notes, done, +15, tomorrow), quick add in plain English, Unscheduled to-dos (drag onto the day), month view, five color schemes, Markdown copy/import, offline support | **Built** |
| 2 | **Notifications.** Push sign-up on each device, a reminder before each block, at start and at end (check-in), quiet hours. Server: Cloud Functions + Cloud Tasks + Web Push | Next |
| 3 | **Week view and templates.** "Weekday" and "weekend" day templates, repeat blocks | |
| 4 | **Coach v1.** Morning brief, nudges, check-ins, re-plans, chat with schedule tools, spoken replies in a female voice | |
| 5 | **Claude everywhere.** Timeblock MCP connector for Claude apps; Siri Shortcut | |
| 6 | **Native wrapper** (optional, $99/yr Apple Developer). Notification buttons, widgets, Live Activities | |

## How the pieces fit

```
 iPhone (Home Screen app) ──┐                 ┌── Claude apps (MCP connector, phase 5)
                            ├── Firebase ─────┤
 Mac (Dock app) ────────────┘   Auth          └── Siri Shortcut (phase 5)
                                Firestore  users/{uid}/blocks | tasks | days | meta/settings
                                Functions  reminders (phase 2), coach (phase 4)
                                Web Push   to every device you've signed in on
```

- **Data model.** One Firestore document per block (`date`, `start`/`end` in minutes, `title`, `cat`, `done`, `notes`, `subtasks`, `source`). Writing a block is the trigger that phase 2 uses to (re)schedule its reminders.
- **Demo mode.** Without Firebase settings the app saves to the browser only. That's handy for trying it out.
- **Security.** `firestore.rules` lets each signed-in person read and write only `users/{their uid}`.

## Notifications (phase 2)

- When a block is created or changes, a Cloud Function queues Cloud Tasks for "Up next" 5 minutes before, "Starting" and the end-of-block check-in. Moving a block cancels and re-queues them.
- Delivery uses Web Push. It reaches the iPhone app installed on the Home Screen (iOS 16.4+) and the Mac Dock app, even when Trinity is closed.
- Settings will cover quiet hours, per-category on/off and lead time.

## The coach (phase 4)

**Personality:** direct and honest, with some tough love, but never harsh; warm when you're struggling. She refers to your own goals and numbers, not generic motivation. Suggestion: call her **Trinity**.

**Voice:** spoken replies use Apple's built-in female voices through the browser's speech API (for example Ava or Samantha). It's free and works offline. Downloading the "Enhanced" version in iOS Settings → Accessibility → Spoken Content → Voices sounds much better. A premium neural voice service is an option later, at extra cost.

Notifications themselves are silent text with the system sound, because iOS doesn't let web apps speak from the background.

**Model and tools:**
- Model: Claude API, `claude-opus-5-5`.
- Read tools: `get_schedule`, `find_free_time`, `get_goals`, `get_stats`.
- Write tools: `add_block`, `move_block`, `resize_block`, `delete_block`, `mark_done`.

**Guardrails:**
- She asks before changing more than two blocks.
- Every change can be undone.
- She never deletes without asking.
- She respects quiet hours.

**Hosting:** nudges are single API calls. The chat is an agent loop: by default Claude Managed Agents (Anthropic-hosted; beta; bills session runtime on top of tokens), or our own loop in Cloud Functions.

**Cost** (estimates, at $4 / $20 per million input/output tokens):

| Usage | Per item | Per month |
|---|---|---|
| Nudge | ≈ $0.008 | 12 a day ≈ $3 |
| Coach chat turn | ≈ $0.03 | 10 a day ≈ $9 |

**Key:** the Anthropic API key lives in Firebase Secret Manager, never in the app.

## Risks

- **iOS web push** works when the app is closed, but some developers report it's less consistent than native push. The native wrapper (phase 6) is the fallback.
- **iOS specifics:** removing the Home Screen icon removes its notification sign-up, and tapping "Don't Allow" is permanent unless changed in iOS Settings.
