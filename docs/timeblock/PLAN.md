# Timeblock: plan

A time-blocking app that keeps you on track. It has a simple, calm interface and several color schemes. It runs on your computer and your iPhone, and your schedule is stored as Markdown files in iCloud Drive. Claude can add to it from chat, from Claude Code, or from your voice.

Status: **plan and concept mockups. No app code yet.** Mockups: https://claude.ai/artifact/6Fpr2gprsuVvDJEaNj3eZr

---

## 1. What you asked for, and where it lands

| Request | How the plan covers it |
|---|---|
| Visually appealing, simple, slick and smooth | Inter type, soft tinted blocks, one accent color, 250 ms eased transitions, 15-minute snap when dragging |
| Several color schemes | Paper, Midnight, Sage, Dusk, Sunrise, plus an option to follow system light/dark |
| Daily plan sections | Day view: timeline, plus an Unscheduled list, today's intention, and where the time goes |
| Click a task to see it | Detail panel on desktop, bottom sheet on iPhone: checklist, notes, +15 min, move to tomorrow, done |
| Monthly view | Month grid with a ribbon showing each day's blocks, % done for past days, and the selected day's agenda |
| Claude can add things here, from chat, from voice | `CLAUDE.md` format guide (Claude Code), a Timeblock MCP connector (Claude Desktop / claude.ai), and a Siri Shortcut |
| Runs on my computer, syncs to my phone over iCloud | Plain `.md` files in an iCloud Drive folder; the same UI runs on both devices |
| Saved as Markdown | One file per day, readable and editable in any text editor |

---

## 2. Research findings

**Time-blocking apps (what to borrow).**
- Reviewers rate Sunsama highest for polish and its guided daily ritual, Structured for a simple visual timeline, and Akiflow for pulling tasks together and for its AI planning. Several reviews call Structured's design utilitarian. ([Zapier](https://zapier.com/blog/best-time-blocking-app), [Akiflow: Amie vs Structured](https://akiflow.com/blog/amie-vs-structured), [Routine: apps like Structured](https://routine.co/blog/posts/apps-like-structured))
- Common interaction patterns: click to create, drag to move, drag an edge to resize, a 15-minute snap by default (Sunsama allows 5-minute steps), and a live current-time line. ([Obsidian Time Blocks](https://community.obsidian.md/plugins/time-blocks), [Sunsama changelog](https://roadmap.sunsama.com/changelog/calendar-and-timeboxing-upgrades))
- A known gap: most phone apps make you open an event to change its length. Akiflow users have asked for drag-to-resize on mobile. We'll add it. ([Akiflow request](https://akiflow.featurebase.app/p/mobile-drag-to-resize-for-time-blocks-on-mobile))
- What to take: Structured's timeline clarity, Sunsama's calm and its "intention for the day", and a "Now" card on the phone so you always know what you should be doing.

**Markdown format.**
- The Obsidian Day Planner ecosystem already uses a `- [ ] 09:00 - 10:30 Task` style inside notes. We'll use a compatible format, so the files also work with those tools. ([Obsidian Day Planner](https://community.obsidian.md/plugins/obsidian-day-planner))

**Getting iCloud files onto the iPhone (the hard part).**
- A plain web app on an iPhone cannot read or write an iCloud Drive folder. Safari on iOS doesn't support `showDirectoryPicker`, and WebKit has said it won't add it. ([caniuse](https://caniuse.com/mdn-api_window_showdirectorypicker), [Apple forums](https://developer.apple.com/forums/thread/816515))
- A native iPhone app built with a free Apple account can't use iCloud, and it stops launching after 7 days unless you reinstall it. The $99/yr Apple Developer Program removes both limits. ([Apple forums](https://developer.apple.com/forums/thread/818501), [Tauri free-team signing notes](https://takazudo-zudo-tauri.pages.dev/pj/zudo-tauri/docs/mobile/ios-signing-free-team))
- Obsidian (free) runs on Mac, Windows and iPhone, keeps its vault in iCloud Drive, and runs community plugins on iOS. So a Timeblock plugin gets file access and iCloud sync on both devices with no Apple developer account.
- Caveat: iCloud on iOS only syncs while the app is open, and Obsidian's forum has reports of lag. Keeping one file per day means small writes and few conflicts. ([Obsidian forum: iCloud](https://forum.obsidian.md/t/icloud-drive-ios-and-macos-sync-inconsistencies-serious/34542/4))

**Claude integration.**
- Claude Code can read and edit the folder directly. A `CLAUDE.md` in the folder teaches it the format.
- Claude Desktop runs local MCP servers, so a small Timeblock MCP server gives it `add_block`, `find_free_time` and similar tools.
- The Claude iPhone app can use custom connectors, but only remote ones that you set up on web or desktop and that are reachable from the public internet. Local servers don't work on mobile. ([Claude help: remote MCP](https://support.claude.com/en/articles/11176164-pre-built-connectors-using-remote-mcp))
- The Claude iOS app has an **Ask Claude** action for Siri and Shortcuts (iOS 18+). Shortcuts can **Dictate Text** and **Append to Text File** in iCloud Drive. That gives you hands-free capture: Siri → Claude formats the line → saved to `Inbox.md`. ([Claude help: App Intents](https://support.claude.com/en/articles/10263469-using-claude-app-intents-shortcuts-and-widgets-on-ios), [AppleVis: Shortcuts append](https://applevis.com/blog/getting-it-done-shortcut-ios-12))

---

## 3. Recommended architecture

```
              ┌──────────────── iCloud Drive / Timeblock ────────────────┐
              │  Days/2026/2026-11-21.md   Inbox.md   Templates/         │
              │  Settings.md               CLAUDE.md                     │
              └───────▲───────────────▲───────────────▲──────────▲───────┘
                      │               │               │          │
        Timeblock UI (Mac)   Timeblock UI (iPhone)   MCP server   Siri Shortcut
        Obsidian plugin      same plugin, mobile     (Claude      (Dictate → Ask
                                                      Desktop/Code) Claude → Append)
```

**One shared codebase (TypeScript):**

| Package | What it is |
|---|---|
| `core` | Markdown parser and serializer (lossless: lines it doesn't understand are kept exactly as they were), time maths, free-slot finder, conflict detection, natural-language quick-add ("gym 6pm 1h #health") |
| `ui` | Svelte 5 components: Day, Week, Month, Task detail, Quick add, Themes (CSS variables) |
| `obsidian-plugin` | Host for Mac and iPhone: full-screen Timeblock view, file I/O through Obsidian's vault API, live refresh when files change |
| `mcp-server` | Node MCP server using the same `core`: `get_day`, `get_range`, `add_block`, `update_block`, `move_block`, `complete_block`, `delete_block`, `find_free_time`, `add_unscheduled`, `process_inbox` |
| `shortcuts/` | Step-by-step Siri Shortcut setup, plus the prompt for the Ask Claude step |

### Phone host: options

| Option | Cost to you | Pros | Cons |
|---|---|---|---|
| **A. Obsidian plugin (recommended for v1)** | Free | One app on Mac, Windows and iPhone; real iCloud files; no Xcode or signing | You open Obsidian to reach it (it can open straight into Timeblock); no lock-screen notifications |
| B. Native app (Capacitor wrapping the same UI) | $99/yr Apple Developer + Xcode on a Mac | Home-screen widget, notifications, native Siri "Add to Timeblock" | More setup; App Store/TestFlight steps |
| C. Mac-hosted web app + phone over Tailscale | Free | No Obsidian | Not iCloud; phone only works while the Mac is awake |

The UI stays separate from the host, so we can move from A to B later without rewriting it.

### File format (v1)

```markdown
---
date: 2026-11-21
intention: Ship the proposal draft before lunch
---

## Plan
- [x] 07:00-07:45 Morning routine #health
- [ ] 08:30-10:30 Deep work: proposal draft #deep
    - [x] Outline sections 1–3
    - [ ] Send to Alex for review
    > Use last year's deck as the skeleton.
- [ ] 11:00-12:00 Call with Sam #meet ✦

## Unscheduled
- [ ] Reply to landlord ~15m #admin

## Notes
Anything here is yours; the app leaves it alone.
```

Rules:
- One block per line: `- [ ] HH:MM-HH:MM Title #category`.
- Times are 24-hour. `09:00 - 10:30`, with spaces, is also accepted.
- `~30m` gives an estimate for unscheduled items.
- `✦` marks a block that Claude added.
- An indented `- [ ]` line is a checklist item. An indented `>` line is a note.
- Categories (`#deep #meet #health #personal #admin`) and their colors live in `Settings.md`, and you can add your own.
- `Inbox.md` holds lines like `2026-11-24 - [ ] 14:00-15:00 Dentist #health`. The app files each one into its day and removes only the lines it processed.

### Sync and safety
- Every write re-reads the file first and merges, so an edit made on the phone a minute ago isn't overwritten.
- If iCloud creates a conflict copy (`2026-11-21 2.md`), the app shows it and offers a one-tap merge.
- The parser round-trips files without loss and has unit tests, so Claude and you can edit the same file safely.

---

## 4. Build phases

1. **Format and core.** Write `CLAUDE.md`, build the parser and serializer, and test them. From here, Claude Code can already plan your days.
2. **Day view.** Timeline, drag/resize with snapping, task detail, quick add, the five color schemes, and the Now card on the phone. Ships as the Obsidian plugin on Mac and iPhone.
3. **Month and Week views.** Plus templates ("weekday", "weekend") and Inbox processing.
4. **Claude.** MCP server for Claude Desktop and Claude Code, and the Siri Shortcut.
5. **Optional.** A remote connector so the Claude iPhone app can edit your schedule (the Mac serves it through a private tunnel, so the Mac must be awake). Reminders, and a native wrapper with widgets.

Each phase ends with something you can use.

## 5. Risks

- **iCloud on iOS** syncs while the app is open, so changes can lag by seconds to minutes. One-file-per-day keeps writes small.
- **Notifications.** An Obsidian plugin can't send reminders while the app is closed. Option B (native) fixes this.
- **Claude from the iPhone app** needs a server reachable from the internet. Siri plus Ask Claude covers most phone capture without one.

## 6. Decisions for you

1. Phone host: **A (Obsidian)**, or B (native, $99/yr)?
2. Keep all five color schemes? Which should be the default?
3. Should the week start on Sunday or Monday? Default visible hours are 7 AM–7 PM.
4. Is your computer a Mac or a Windows PC? (Both work with A.)
5. For v1, is Siri capture enough, or do you want the Claude iPhone app connector too?
