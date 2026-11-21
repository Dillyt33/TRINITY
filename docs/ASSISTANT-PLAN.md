# Trinity assistant: plan

The goal: a voice assistant that can do much more than manage the schedule. It should coach you, look things up, use apps on your Mac and phone, build things with Claude Code, and act for you.

## Short answer

Mostly yes. Much of it already exists in Claude's own apps, so the plan is to **plug into Claude rather than rebuild it**. We build only what's missing: Trinity's schedule, the proactive coach, and the glue.

**The hard limits:**

| Limit | Why | What we do instead |
|---|---|---|
| No assistant can tap around inside other iPhone apps | iOS doesn't allow it | iPhone actions go through **Shortcuts** that you set up once |
| Laptop work only happens while the Mac is awake | The work runs on the Mac | Keep it plugged in with "keep awake" on |
| No always-listening wake word in our own app | iOS doesn't let web apps listen in the background | Use **"Hey Siri, Ask Claude"**, the Action button, or a tap |

## What already exists (use it, don't rebuild it)

| You want | Already available | Where it runs | Notes |
|---|---|---|---|
| Talk to it | **Claude voice mode** (mobile, desktop, web) | Cloud | Since July 2026 it runs on Opus/Sonnet/Haiku and can use your connected tools. Beta. |
| Look things up, email, calendar, docs | Web search + **connectors** (Gmail, Google Calendar, Docs, Slack, …) | Cloud | Works inside voice mode; Claude asks before using a tool |
| Hands-free start | **"Hey Siri, Ask Claude"** (Claude App Intents, iOS 18+) | iPhone | Also usable as a Shortcuts action |
| Do things on the Mac (files, apps, browser) | **Claude Cowork + Dispatch + computer use** | Your Mac | Send a task from your phone; Claude does it on the Mac; the result shows up in the same chat. Research preview on paid plans. Mac must stay awake |
| Build software, write code | **Claude Code**, plus **Remote Control** to drive it from your phone | Your Mac | Start with `claude --remote-control`; it notifies your phone when it needs you or is done |
| Remember your goals and the coach personality | A Claude **Project** with instructions + memory | Cloud | We write the coach instructions once |

## What we build

### 1. Trinity connector (MCP server)
A small server that gives Claude these tools:
- `get_schedule`, `find_free_time`, `get_goals`
- `add_block`, `move_block`, `resize_block`, `mark_done`

You add it once as a custom connector on claude.ai. From then on, every Claude app, voice mode included, can read and change your Trinity schedule: "Move gym to 7 and tell me what's left today."

- **Hosting:** Firebase / Cloud Run, so it's always on and doesn't need the Mac.
- **Security:** sign-in (OAuth) so only you can use it.

### 2. Proactive coach (Trinity phases 2 and 4)
Claude's apps mostly wait for you to talk. Trinity's coach reaches out first:
- morning brief and evening review
- a nudge before each block, a check-in when it ends
- "you're behind, here's a re-plan, tap Apply"

These arrive as notifications on your iPhone and Mac even when the app is closed. Tone: direct, some tough love, some warmth.

- **Model:** Claude API, `claude-opus-5-5`.
- **Cost:** roughly $5–15 a month.
- **Hand-off:** tapping a notification opens Trinity, or hands the conversation to Claude voice mode.

### 3. iPhone actions pack (Shortcuts)
A set of shortcuts the assistant can trigger by name, for example:
- Focus mode on/off
- Start timer
- Text someone (with confirmation)
- Play playlist
- Add to Reminders
- Log workout
- Home scenes

They run from Siri, from Trinity (the app opens `shortcuts://run-shortcut?name=…`, which needs the screen on), or from Claude via the "Ask Claude" action chained inside a shortcut.

### 4. Optional, later: Trinity's own voice app with a Mac "bridge"
Only if Claude's apps don't feel like *one* assistant to you.

**Front end.** Push-to-talk voice in the Trinity app, with her own female voice and personality.
- Voice output: Apple's built-in voices, which are free, or a premium neural voice service.
- Speech-to-text: on-device dictation.

**Brain.** A Claude agent with:
- Trinity schedule tools
- web search and fetch
- your connectors over MCP
- memory of your goals and preferences

**Mac bridge.** A small background app on the Mac, built on the **Claude Agent SDK** (the same engine as Claude Code). The phone puts a task in a queue; the bridge picks it up and does it:
- edit files and run commands
- create and deploy projects
- run Mac Shortcuts (`shortcuts run "Name"`) and AppleScript
- control apps with computer use

It then reports back with a push notification and a link.

```
                    ┌────────────── Claude (cloud) ──────────────┐
   iPhone           │ voice mode · web search · connectors        │
   ├ Claude app ───►│ Trinity connector (MCP) ──► Firestore       │◄── Trinity coach
   ├ Siri "Ask Claude"                                            │    (scheduled nudges,
   ├ Trinity app ──►│ Trinity agent (optional, phase 4)           │     Web Push)
   └ Shortcuts      └───────────────┬────────────────────────────┘
                                    │ tasks queue
   Mac (awake) ◄────────────────────┘
   ├ Claude Cowork + Dispatch + computer use
   ├ Claude Code (Remote Control)
   └ Trinity bridge (Agent SDK, optional)
```

## Safety rules (from day one)

- **Always ask before** sending a message or email, spending money, deleting anything, posting publicly, or changing more than two blocks.
- **Keep a log.** An activity log you can read, plus undo where possible.
- **Limit file access.** The Mac bridge only works in folders you allow. Secrets stay in the Keychain or Secret Manager, never in prompts.
- **Kill switch.** One tap pauses all automation.

## Costs

| Item | Cost |
|---|---|
| Claude Pro or Max subscription | Covers voice mode, connectors, Cowork/Dispatch, and Claude Code. Agent SDK use on a subscription draws from a separate monthly Agent SDK credit |
| Claude API (Trinity coach) | About $5–15/mo at moderate use |
| Firebase | About $0–1/mo |

Heavy work (coding, computer use) goes through the subscription tools, not the API, so the API bill stays small. If the optional bridge used the API instead, a big coding task could cost a few dollars each.

## Order of work

1. **One evening of setup, no code.**
   - Install the Claude desktop app on the Mac and turn on Cowork Dispatch and computer use.
   - Install Claude Code and try Remote Control.
   - Add connectors (Calendar, Gmail, …).
   - Create a "Trinity" Project with the coach instructions; I'll write them.
   - Add "Ask Claude" to your Action button or Siri.
2. **Trinity connector (MCP).** Claude can see and change your Trinity schedule by voice.
3. **Notifications and proactive coach** (Trinity phases 2 and 4).
4. **iPhone Shortcuts pack.**
5. **Optional:** Trinity's own voice app and Mac bridge.

## Open questions

- Which Claude plan are you on (Pro or Max)? Some features (Dispatch, computer use) are research previews on paid plans.
- Which apps matter most to you on the phone and on the Mac? That decides the Shortcuts pack and the first connectors.
- Do you want to keep Trinity as the schedule, or switch to Google Calendar? The assistant can work with either.

## Sources

- Claude voice mode with tools: [Anthropic blog](https://claude.com/blog/think-through-hard-problems-in-voice-mode), [help article](https://support.claude.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps)
- Cowork Dispatch and computer use: [Anthropic blog](https://claude.com/blog/dispatch-and-computer-use), [MacStories hands-on](https://www.macstories.net/stories/hands-on-with-claude-dispatch-for-cowork/)
- Claude Code Remote Control: [docs](https://code.claude.com/docs/en/remote-control)
- Claude Agent SDK: [overview](https://code.claude.com/docs/en/agent-sdk/overview)
- Siri / Shortcuts "Ask Claude": [help article](https://support.claude.com/en/articles/10263469-using-claude-app-intents-shortcuts-and-widgets-on-ios)
- Running shortcuts by URL: [Apple Shortcuts guide](https://support.apple.com/guide/shortcuts/apdcd7f20a6f/)
- Remote MCP connectors on mobile: [help article](https://support.claude.com/en/articles/11176164-pre-built-connectors-using-remote-mcp)
