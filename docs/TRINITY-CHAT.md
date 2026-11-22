# Talking with Trinity (voice and chat)

Trinity checks in with you like a person would. A notification from **Trinity** ("Morning! How did you sleep?") opens a conversation in the Trinity app. She speaks in a female voice, and you answer by talking or typing. You can also open the **Trinity** tab anytime and start talking.

In a conversation she can:
- see and change your calendar and to-dos
- record sleep, diet, exercise, mood, study, projects, money, health and mental health
- spot patterns over the past week
- search, read and write your Obsidian notes ([OBSIDIAN.md](OBSIDIAN.md))
- look things up on the web

Before a risky change (removing a block, overwriting a note), she shows **Yes, do it / No** buttons.

## How it works
- **Claude Managed Agents:** Trinity's chat runs on Anthropic's hosted agent service, which is in beta. Anthropic runs her conversation; her tools are on your own Trinity server.
- **Her tools reach your server:** she uses the same connector the Claude app uses, through a private key stored in an Anthropic vault.
- **Replies stream live:** they're written into your Firestore as they arrive, so the app shows them as she answers.
- **Her voice and listening run on your phone:** Apple's built-in voices and speech recognition, free and on-device.

## Setup (after [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md) and [REMINDERS.md](REMINDERS.md))

### 1. Give Trinity's server your Anthropic API key
Get a key at https://platform.claude.com (Settings → API keys; see [SETUP.md](SETUP.md#1-get-an-anthropic-api-key)). Then, in the `trinity` folder on your Mac:
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY    # paste the key
```
If you typed `none` here earlier for reminders, run it again with the real key.

### 2. Deploy
```bash
npm run build
firebase deploy
```
This adds the `chat` function and the stricter database rules. If Firebase asks to turn on extra Google Cloud services (Eventarc, Pub/Sub), say yes.

### 3. Set up the chat (one tap)
In Trinity, go to **Settings → Trinity's chat & voice → Set up**. This creates the agent "Trinity" on your Anthropic account. You can see it, and every conversation, at platform.claude.com under Managed Agents.

### 4. Pick her voice
- **Download a good voice (iPhone):** Settings → Accessibility → Spoken Content → Voices → English. Download **Ava** or **Zoe** (Premium or Enhanced). They're free and much more natural.
- **Choose it in Trinity:** Settings → Trinity's chat & voice → Voice, then **Try it**.

## Using it
- **Talk:** in the **Trinity** tab, tap the blue **mic**. She reads her last message aloud, then listens. When you pause, she answers out loud and listens again. Tap the red button to stop.
  - If your iPhone doesn't let the app listen directly, the mic button says so. Tap the microphone on the keyboard to dictate instead.
- **Type:** use the message box like any chat.
- **Check-ins:** tap a notification to open that conversation and reply.
- **Earlier conversations:** pick one from the menu at the top. **+** starts a fresh one.
- **Mute:** the speaker icon turns her voice off; she still replies in text.

The app has to be open for voice. iPhone doesn't let web apps listen or speak in the background.

## Changing her personality
1. Edit [`assistant/trinity-instructions.md`](../assistant/trinity-instructions.md).
2. Raise `PERSONA_VERSION` in `functions/src/assistant.ts`.
3. Run `firebase deploy`.
4. Tap **Settings → Trinity's chat & voice → Update**.

Your "About you" notes in Settings are read fresh every conversation, so changing those needs no update.

## Costs and limits
All figures are estimates.

| Item | Cost |
|---|---|
| Model | Claude Opus 5.5: $4 per million tokens in, $20 per million out |
| Each reply | Usually a few cents, more if she searches your notes or the web |
| Session running time | $0.08 per hour, only while she's working |
| A short check-in conversation | About $0.05–0.15 |

- **Monthly estimate:** about **$10–20/month** with a few conversations a day, plus $3–6 for the Claude-written reminders.
- **Safety cap:** each conversation is capped at **$1** (a session budget), so a runaway conversation can't get expensive.
- **Watch your usage:** at platform.claude.com, where you can also set a monthly spend limit.

## Privacy and safety
- **Where conversations live:** in your Firebase project (`users/{you}/conversations`). Anthropic also keeps session history until you delete it in the Console. Anthropic doesn't train on API data by default.
- **Who can do what:** only the server can write Trinity's replies and setup, and only your Google account (`ALLOWED_EMAILS`) can set her up.
- **Mental health:** Trinity is supportive, not a therapist. If you talk about harming yourself, she stops planning and points you to the 988 Suicide & Crisis Lifeline (call or text 988 in the US) or your local emergency number.
