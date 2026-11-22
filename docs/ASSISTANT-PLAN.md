# Trinity: plan

**Trinity is one assistant.**
- **You talk to her in Claude's main chat:** typed, voice mode, or "Hey Siri, Ask Claude".
- **She keeps your calendar in the Trinity app.**
- **She reaches out on her own:** reminders, and asking how you're doing.
- **Siri handles phone actions** (timers, messages, music, Home), so Trinity doesn't duplicate them.

What's settled:
- Claude Pro, and the phone comes first.
- Trinity's own calendar stays.
- Her tone is direct, some tough love, some warmth.
- No separate voice app inside Trinity, and no Shortcuts pack.

## The pieces

| Piece | What it does | Status |
|---|---|---|
| **Claude chat + Trinity's instructions** | Her personality and rules, in a Claude Project plus your Claude settings | Ready. [PHONE-SETUP.md](PHONE-SETUP.md) |
| **Trinity app** (iPhone Home Screen, Mac Dock) | The calendar: day and month views, blocks, to-dos, check-ins, settings, "About you" | Built |
| **Trinity's tools in Claude** (connector) | Claude chat can read and change the calendar: "Move gym to 7", "What's free tomorrow?" | Built. [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md) |
| **Reminders and check-ins** | Before each block, after each block ("how did it go?"), and morning, midday and evening "how are you doing?". Optionally written by Claude in her voice | Built. [REMINDERS.md](REMINDERS.md) |
| **Your Mac from your phone** (optional) | Claude Cowork Dispatch and Claude Code Remote Control, both included in Pro | Setup only |

```
  You ──► Claude chat (typed, voice, Siri) ──► Trinity's tools ──┐
                                                                 ├──► your calendar + check-ins (Firebase)
  You ──► Trinity app (calendar, check-ins) ─────────────────────┘
  You ◄── reminders and check-ins ◄── Trinity's server (every 2 min; Claude writes the wording)
```

## What you do next

| # | What you do | Guide |
|---|---|---|
| 1 | Fill in "About you" and set up the Trinity project in Claude | [PHONE-SETUP.md](PHONE-SETUP.md) |
| 2 | Firebase on Blaze, then deploy the app and server | [SETUP.md](SETUP.md), [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md) |
| 3 | Add the connector in Claude, then Allow | [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md) |
| 4 | Make the notification keys, optionally add your Anthropic API key, redeploy, turn on notifications on your iPhone | [REMINDERS.md](REMINDERS.md) |

## Hard limits

| Limit | What to do |
|---|---|
| Claude can't start a conversation by itself | Trinity's notifications are her way of reaching out; tap one to check in |
| iPhone web-app notifications have no reply buttons | Tapping opens a one-tap check-in screen |
| A notification can't open Claude with a message already typed (iPhone only allows that for Claude Code) | Check-ins link to the Claude app; just start talking |

## Safety rules

- **Ask first.** Trinity asks before deleting, or before changing more than two blocks. Deletes in the app can be undone.
- **Only you can connect.** Only your Google account can connect Claude to your calendar (`ALLOWED_EMAILS`).
- **Keys stay on the server.** The Anthropic API key lives in Google Secret Manager, never in the app.

## Costs

| Item | Cost |
|---|---|
| Claude Pro (you have it) | Chat, voice, connectors |
| Firebase Blaze | About $0–1/mo at your usage |
| Claude API (optional, for check-ins in her voice) | About $3–6/mo |

## Sources

- Claude voice mode with tools: [Anthropic blog](https://claude.com/blog/think-through-hard-problems-in-voice-mode)
- Remote MCP connectors on mobile: [help article](https://support.claude.com/en/articles/11176164-pre-built-connectors-using-remote-mcp)
- Siri / Shortcuts "Ask Claude": [help article](https://support.claude.com/en/articles/10263469-using-claude-app-intents-shortcuts-and-widgets-on-ios)
- Opening the Claude apps with a link: [mobile](https://support.claude.com/en/articles/14898120-open-the-claude-mobile-app-with-a-link), [desktop](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link)
- Web push on iPhone: [WebKit](https://webkit.org/?p=13878); no action buttons: [Apple forums](https://developer.apple.com/forums/thread/726793)
- Dispatch and computer use: [Anthropic blog](https://claude.com/blog/dispatch-and-computer-use); Claude Code Remote Control: [docs](https://code.claude.com/docs/en/remote-control)
