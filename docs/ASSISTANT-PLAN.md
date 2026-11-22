# Trinity: plan

**Trinity is one assistant.**
- **She keeps your calendar.**
- **She checks in on you like a person:** by voice or chat.
- **She keeps track of your life:** sleep, diet, exercise, mood, study, projects, money, health and mental health.
- **She knows your Obsidian vault.**

You reach her in two places with one memory:
- **Trinity's own chat**, where she starts conversations.
- **Claude's main chat**, where you start them: typed, voice, or "Hey Siri, Ask Claude".

Siri handles phone actions.

What's settled:
- Claude Pro, and the phone comes first.
- Trinity's own calendar.
- Direct, warm, a bit of tough love, female voice.
- Check-ins happen in Trinity's chat.
- The Obsidian vault is in iCloud Drive, and the Mac is mostly on.

## The pieces

| Piece | What it does | Status | Guide |
|---|---|---|---|
| **Trinity app** (iPhone Home Screen, Mac Dock) | Calendar, to-dos, settings, "About you", and the **Trinity** tab | Built | [SETUP.md](SETUP.md) |
| **Trinity's tools** (connector) | Calendar, to-dos, life log, check-ins and Obsidian, for Claude and for her own chat | Built | [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md) |
| **Reminders and check-ins** | Texts from "Trinity" before and after blocks, and morning, midday and evening. Tapping one opens a conversation | Built | [REMINDERS.md](REMINDERS.md) |
| **Trinity's chat** | Voice or text conversations (female voice, hands-free mode, Yes/No before risky changes), on Claude Managed Agents | Built | [TRINITY-CHAT.md](TRINITY-CHAT.md) |
| **Life log** | Records sleep, diet, exercise, mood, study, projects, money, health, mental health; daily totals and patterns | Built | (part of the tools) |
| **Obsidian helper on your Mac** | Search, read and write the vault; copies the life log and check-ins into daily notes | Built | [OBSIDIAN.md](OBSIDIAN.md) |
| **Claude's main chat** | The same Trinity through the connector, plus Apple Health in the Claude iPhone app | Ready | [PHONE-SETUP.md](PHONE-SETUP.md) |

```
  Notification ("Morning! How did you sleep?") ──► Trinity's chat (voice or text) ──┐
  Claude app (typed, voice, Siri) ──────────────────────────────────────────────────┤
                                                                                     ▼
                                          Trinity's server (Firebase): calendar, life log, check-ins
                                                                                     │ jobs
                                                                                     ▼
                                          Mac helper ──► Obsidian vault (iCloud Drive), daily notes
```

## Your setup checklist

| # | Do this | Guide |
|---|---|---|
| 1 | Firebase project on Blaze; `.env.local`; first deploy | [SETUP.md](SETUP.md) |
| 2 | Connector settings (`ALLOWED_EMAILS`), deploy, add the connector in Claude | [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md) |
| 3 | Notification keys, turn on notifications on the iPhone | [REMINDERS.md](REMINDERS.md) |
| 4 | Anthropic API key, deploy, then Settings → Trinity's chat → Set up; download the Ava voice | [TRINITY-CHAT.md](TRINITY-CHAT.md) |
| 5 | Mac helper: setup code, test, install | [OBSIDIAN.md](OBSIDIAN.md) |
| 6 | Fill in Settings → About you | |

## Where the data comes from

| Area | How Trinity learns it |
|---|---|
| Sleep, exercise | You tell her. In the Claude iPhone app, Claude can also read Apple Health (US, Pro) |
| Diet | You tell her what you ate; she estimates calories and protein |
| Mood, mental health | Check-ins, and what you say in conversation |
| Study, projects | Finished calendar blocks, what you tell her, your Obsidian notes |
| Money | You tell her ("spent $40 on groceries"). No bank connection |
| Health | What you tell her; Apple Health through the Claude app |

## Possible next steps
- **Apple Health into Trinity's own log:** a nightly Shortcuts automation that sends sleep, steps and workouts to Trinity's server.
- **A "Life" screen in the app:** charts of sleep, mood and exercise over time.
- **Weekly review:** Trinity looks back on the week with you on Sunday evening.

## Safety rules
- **Ask first.** Trinity asks before deleting, overwriting, or changing more than two blocks. In her chat, risky actions show Yes/No buttons.
- **Off switch.** Settings → Disconnect Mac signs out Trinity everywhere.
- **Keys stay on the server.** The API key is in Google Secret Manager.
- **Spending cap.** Each conversation is capped at $1.
- **Mental health.** She's supportive, not a therapist. In a crisis she points to 988 or local emergency services.

## Costs (estimates)

| Item | Cost |
|---|---|
| Claude Pro (you have it) | Claude app, voice, connectors |
| Firebase Blaze | About $0–1/mo |
| Claude API (Trinity's chat and her check-in wording) | About $13–26/mo with a few conversations a day |

That's above your original $5–15. To come in under it, use fewer daily check-ins, or switch her chat to Claude Sonnet 5.5, which costs about half as much, if you'd like.

## Sources
- Claude Managed Agents and pricing: [Claude Platform docs](https://platform.claude.com/docs)
- Apple Health in the Claude iPhone app: [MacRumors](https://www.macrumors.com/2026/01/22/claude-ai-adds-apple-health-connectivity/), [Claude help](https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps)
- Obsidian remote-access approaches compared: [Vault Cortex](https://forum.obsidian.md/t/vault-cortex-an-open-source-mcp-server-that-gives-ai-tools-read-and-write-access-to-your-obsidian-vault-from-any-device-without-obsidian-running/117995), [Obsidian MCP Server plugin](https://community.obsidian.md/plugins/mcp-server)
- Claude voice mode with tools: [Anthropic blog](https://claude.com/blog/think-through-hard-problems-in-voice-mode)
- Web push on iPhone: [WebKit](https://webkit.org/?p=13878)
