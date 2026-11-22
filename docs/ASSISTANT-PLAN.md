# Trinity: plan

**Trinity is one assistant.** She plans and runs your schedule, reminds you, pushes you when you slip, looks things up, and gets things done on your phone and Mac. The Trinity app is her home and shows your calendar. Talking to her happens by voice, on your phone first.

What's settled:
- Claude Pro.
- The phone matters most.
- Trinity's own calendar stays.
- Her tone is direct, some tough love, some warmth.
- She has a female voice.

## One assistant, several ways to reach her

| Door | What it is | Extra cost |
|---|---|---|
| **Claude app on iPhone** (voice mode, Siri "Ask Claude", Action button) | Her voice today. Pro includes voice mode, web search, connectors and memory | $0 (part of Pro) |
| **Trinity app** (Home Screen) | The calendar, plus a "Talk to Trinity" button inside it (step 3) | Claude API, about $5–15/mo |
| **Notifications** | Trinity messages you first: reminders, check-ins, new plans | Included in the above |
| **Your Mac** | Claude Cowork + Dispatch (do things on the Mac from your phone) and Claude Code Remote Control (build things from your phone) | $0 (part of Pro; research preview) |

Her personality and rules live in one place, [`assistant/trinity-instructions.md`](../assistant/trinity-instructions.md). Every door uses the same text, so it's the same Trinity everywhere.

## Build order (phone first)

| Step | What you get | Who does it |
|---|---|---|
| **0. Today** | Trinity in the Claude app on your phone. Paste her instructions, put "Ask Claude" on the Action button, talk to her. She can plan your day and give it to you in Trinity format to paste into the app | You, about 10 min ([PHONE-SETUP.md](PHONE-SETUP.md)) |
| **1. Trinity's tools** (connector) | She can read and change the Trinity calendar herself, by voice, from the Claude app: "Move gym to 7. What's left today?" | **Built.** You deploy it: [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md). Needs Firebase on the Blaze plan |
| **2. Notifications** | Reminders before and after each block, and Trinity reaching out (morning plan, "you're behind, here's a fix") on your lock screen, even when apps are closed | Me. Needs Firebase on the Blaze plan |
| **3. Talk to Trinity inside the Trinity app** | Voice and text inside the app, her female voice, same tools plus web search. Every door is now one app | Me. Needs an Anthropic API key |
| **4. iPhone actions** | Shortcuts she can trigger: Focus on/off, timers, text someone (asks first), music, Reminders, Home | Me (I write them), you (one-time import) |
| **5. Mac and Claude Code** | Turn on Dispatch and Remote Control; later, Trinity can send build tasks to your Mac and tell you when they're done | Setup together |

## How it fits together

```
  iPhone ── Claude app (voice, Siri) ─┐
         ── Trinity app (calendar, talk) ─┤──► Trinity's tools ──► your calendar data (Firebase)
         ◄── notifications ───────────┘      (schedule, notify, later: Shortcuts, Mac tasks)
  Mac ──── Claude Cowork / Dispatch, Claude Code (Remote Control)
```

- **Trinity's tools** are one small server (an MCP connector): `get_schedule`, `find_free_time`, `add_block`, `move_block`, `resize_block`, `mark_done`, `add_todo`, `get_goals`, and later `send_notification`.
  - The Claude app uses it as a custom connector (Pro allows this).
  - The Trinity app's built-in assistant uses the same server.
  - It's protected by sign-in (OAuth), so only you can use it.
- **Brain** for the in-app assistant: Claude (`claude-opus-5-5`) through Claude Managed Agents, with Trinity's tools and web search.
  - Anthropic hosts the agent loop. It's in beta and bills session runtime on top of tokens.
  - If voice replies feel slow, we switch that path to a plain Claude API loop in a Firebase function.
- **Voice:** in the Claude app, Claude's own voices. In the Trinity app, Apple's built-in female voices (Ava or Samantha; download the "Enhanced" version for better quality), with a premium voice as a later option.

## Hard limits

| Limit | What we do instead |
|---|---|
| No assistant can tap around inside other iPhone apps | Phone actions go through Shortcuts |
| Web apps can't listen for a wake word in the background | "Hey Siri, Ask Claude" or the Action button is her wake word |
| Mac tasks need the Mac awake | Keep it plugged in |
| Notifications can't speak | They show text and play the sound; tap one to talk |

## Safety rules

- **Always ask before** sending messages or email, spending money, deleting anything, posting publicly, or moving more than two blocks.
- **Keep a log.** Every change is logged and undoable.
- **Off switch.** One switch pauses everything automatic.

## Costs

| Item | Cost |
|---|---|
| Claude Pro (you have it) | Covers the Claude app, voice, Cowork/Dispatch and Claude Code |
| Claude API (step 3 onward) | About $5–15/mo |
| Firebase | Blaze plan (card on file) from step 1, about $0–1/mo |

## Sources

- Claude voice mode with tools: [Anthropic blog](https://claude.com/blog/think-through-hard-problems-in-voice-mode), [help article](https://support.claude.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps)
- Cowork Dispatch and computer use: [Anthropic blog](https://claude.com/blog/dispatch-and-computer-use)
- Claude Code Remote Control: [docs](https://code.claude.com/docs/en/remote-control)
- Claude Agent SDK: [overview](https://code.claude.com/docs/en/agent-sdk/overview)
- Siri / Shortcuts "Ask Claude": [help article](https://support.claude.com/en/articles/10263469-using-claude-app-intents-shortcuts-and-widgets-on-ios)
- Remote MCP connectors on mobile: [help article](https://support.claude.com/en/articles/11176164-pre-built-connectors-using-remote-mcp)
