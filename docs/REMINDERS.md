# Reminders and check-ins (step 2)

With this on, Trinity reaches out on your iPhone (and Mac) even when every app is closed:

| When | What you get | Tapping it opens |
|---|---|---|
| A few minutes before each block (5, 10 or 15) | "Up next: Gym, starts in 5 min." | That block in Trinity |
| When a block ends | "How did Deep work go?" | A check-in: **Done** / **Need 15 more min** / **Didn't happen** (then: later today, tomorrow, or drop it) |
| Morning (default 8:00) | What matters today, and how you're feeling | "How are you feeling?" **Great / Good / Meh / Rough** + a note |
| Midday (default 1:00) | "How are you doing?" and progress so far | Same mood check-in |
| Evening (default 9:00) | "How was today?" | Same mood check-in |

**Quiet hours** (default 10 PM–7 AM) mute the block reminders. Every check-in screen has a **"Talk it through with Trinity in Claude"** link.

Check-ins are saved, so Trinity in Claude knows how you've been (`get_about_me`). If you tell her in chat that you're wiped out, she records it too (`log_checkin`).

**Trinity's own words (optional).** With an Anthropic API key, Claude writes the check-ins in Trinity's voice, using your day, your "About you" notes and recent check-ins. "Up next" reminders always use plain wording, to keep costs down. Without a key, Trinity uses built-in wording.

## Setup

**Before you start:** finish [CONNECT-CLAUDE.md](CONNECT-CLAUDE.md). Reminders run on the same server and the same Blaze plan.

### 1. Make the notification keys (once)
```bash
cd functions
npm run vapid
```
It prints two things:
1. Put the `VAPID_PUBLIC_KEY=…` line into `functions/.env`.
2. Store the private key as a secret. Run the command it shows and paste the private key when asked:
   ```bash
   firebase functions:secrets:set VAPID_PRIVATE_KEY
   ```

### 2. Optional: let Claude write the check-ins
Get your key from https://platform.claude.com (Settings → API keys; see [SETUP.md](SETUP.md#1-get-an-anthropic-api-key)), then run:
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```
Paste the key. To skip this for now, type `none` instead. You can change it later with the same command, then redeploy.

### 3. Deploy
```bash
cd ..            # back to the trinity folder
npm run build
firebase deploy
```

### 4. Turn it on for each device
- **iPhone:**
  1. Open Trinity **from the Home Screen icon**. iPhone only allows notifications for Home Screen apps, on iOS 16.4 or later.
  2. Go to **Settings → Reminders & check-ins → Turn on**, then **Allow**.
  3. Tap **Send a test**.
- **Mac:** open the Trinity Dock app (Safari "Add to Dock" or Chrome install) and do the same.

### 5. Tell Trinity about you
In **Settings → About you**, write your goals, weekly targets, usual day and how hard to push you. Trinity reads this both in Claude and when writing your check-ins.

## Good to know
- **Timing:** reminders are checked every 2 minutes, so they can be up to about 2 minutes off.
- **Focus modes:** an iPhone Focus mode can hide notifications. Allow Trinity in that Focus if you want reminders during it.
- **No buttons in notifications:** iPhone doesn't show reply buttons on web-app notifications. Tapping opens the check-in instead.
- **Reinstalling:** if you delete the Home Screen icon, notifications stop for that device. Re-add it and turn them on again.
- **Costs:**
  - The reminder job runs about 22,000 times a month, which fits in Google's free allowance.
  - Claude-written check-ins are roughly 10–12 messages a day, about $3–6 a month.
  - The API key is stored in Google Secret Manager, never in the app.

## Under the hood
- `functions/src/reminders.ts` decides what's due. It's tested in `functions/test/reminders.test.ts`.
- `functions/src/writer.ts` asks Claude (`claude-opus-5-5`, low effort) for a two-line notification in Trinity's voice, based on `assistant/trinity-instructions.md` plus your "About you".
  - If Claude declines a request, the API retries on a fallback model. This "server-side fallback" setting is on by default.
  - On any problem, the built-in wording is used instead.
- `functions/src/push.ts` sends Web Push messages signed with your VAPID keys.
- The scheduled function `reminders` runs every 2 minutes. Each reminder is recorded, so it's never sent twice.
