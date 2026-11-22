# Connect Claude to Trinity (step 1)

When this is done, you can talk to Trinity in the Claude app on your phone (voice mode, or "Hey Siri, Ask Claude") and she can **read and change your Trinity calendar**:
- "What's on today?"
- "Move gym to 7."
- "Add dentist Tuesday at 2 for an hour."
- "What's free tomorrow afternoon?"

Changes show up in the Trinity app right away, marked with a ✦ Claude badge.

**Before you start:** do parts 2–4 of [SETUP.md](SETUP.md) (Firebase project, `.env.local`, first deploy).

**Card needed:** the connector is a small server, and Firebase only runs server code on the pay-as-you-go **Blaze** plan. Your use should stay far inside the free allowance (about $0/month). Add a $5 budget alert anyway.

## 1. Find your project ID
In the Firebase console, open **Project settings (gear icon) → General**. Copy the **Project ID**, which looks like `trinity-4f2a1`.

The long number (for example `1098631048434`) is the project *number*. It isn't the ID.

## 2. Turn on Blaze
In the Firebase console, click **Upgrade** (bottom left), choose **Blaze**, and add a card. Then create a **$5 budget alert** in Google Cloud Billing.

## 3. Configure
From the `trinity` folder on your Mac:

```bash
cp .firebaserc.example .firebaserc          # put your project ID in it
cp functions/.env.example functions/.env    # put your Google email in ALLOWED_EMAILS, and your time zone
cd functions && npm install && cd ..
```

`ALLOWED_EMAILS` means only your Google account can connect Claude to your Trinity.

## 4. Deploy
```bash
npm run build
firebase deploy
```
The first deploy turns on a few Google Cloud services and takes a few minutes. Say yes if it asks.

When it finishes, open `https://YOUR-PROJECT-ID.web.app/api/health`. You should see `{"ok":true,…}`.

## 5. Open Trinity once on your phone
Open the Trinity app from your Home Screen and sign in. It saves your time zone, so Trinity's server knows what "today" means for you.

## 6. Add the connector in Claude
This is easiest on claude.ai on your Mac. Connectors you add there appear on your phone too.

1. Go to **Settings → Connectors → Add custom connector**.
2. Name: **Trinity**. URL: `https://YOUR-PROJECT-ID.web.app/mcp`. The same address is in Trinity under **Settings → Talk to Trinity in Claude → Copy**.
3. Click **Add**, then **Connect**. A Trinity page opens asking **"Let Claude use Trinity?"**. Tap **Allow**, and you're sent back to Claude.

## 7. Try it on your iPhone
In the Claude app, open your Trinity project (or any chat) and make sure the **Trinity** connector is turned on in the tools menu. Then use voice:
- "Trinity, what's on my schedule today?"
- "I'm running late. Push everything after lunch back 30 minutes." (She'll ask first, because that changes more than two blocks.)
- "Put 'renew passport' on my to-do list."

Claude asks permission before using a connector tool. You can choose to allow it every time.

## Troubleshooting
- **"This request has expired":** start again from Claude (Settings → Connectors → Trinity → Connect).
- **"This Google account isn't allowed":** `ALLOWED_EMAILS` in `functions/.env` must match the account you signed into Trinity with. Fix it and run `firebase deploy --only functions`.
- **Claude says it can't reach the server:** the web.app address may be the problem.
  1. In the Firebase console, open **Functions → api** and copy its direct URL (ends in `run.app`).
  2. Set `APP_URL=https://YOUR-PROJECT-ID.web.app` in `functions/.env`.
  3. Redeploy functions.
  4. In Claude, use `https://…run.app/mcp` as the connector URL.
- **Disconnect:** Claude → Settings → Connectors → Trinity → Disconnect.

## What's inside (for the curious)
- **Server code:** `functions/`. It's an MCP server (the standard way Claude connects to tools) with OAuth sign-in, running as one Firebase function named `api`.
- **Tools:** `get_schedule`, `find_free_time`, `add_block`, `quick_add`, `update_block`, `delete_block`, `add_todo`, `complete_todo`, `schedule_todo`, `set_intention`.
- **Sign-in:** Claude's sign-in goes through Trinity's own `/connect` page, using the Google sign-in you already have. Only your account (`ALLOWED_EMAILS`) can approve.
- **Tests:** `cd functions && npm test` runs the tool tests plus a full sign-in flow: registration, approval, PKCE token exchange, tool calls and token refresh.
