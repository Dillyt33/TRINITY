# Trinity and your Obsidian vault

With this set up, Trinity can work with your Obsidian vault in iCloud Drive:
- **Search and read your notes:** projects, journal, goals, anything.
- **See what you've been working on lately.**
- **Write to your notes:** append to your daily note, or create new notes.
- **Keep your daily notes up to date:** everything she records (sleep, food, exercise, mood, check-ins…) is copied into that day's note under a **## Trinity** heading.

This works from Trinity's chat and from the Claude app (through the connector).

## How it works
- **A small helper runs on your Mac.** It's in the `bridge/` folder of this repo: plain Node.js, with nothing extra to install. It only ever touches files inside your vault folder.
- **Trinity asks through your Trinity data.** When she needs a note, she leaves a request in your Trinity data. The helper picks it up within a few seconds and writes the answer back.
- **When your Mac is asleep:** searching and reading wait until it's back. Notes Trinity writes are queued and saved when it wakes.
- **What it signs in as:** you, with a code from the Trinity app. That code gives access to your Trinity data only, not your Google account.

## Setup (about 5 minutes, on your Mac)

You need Node.js 20 or newer (https://nodejs.org) and this repo on your Mac ([SETUP.md](SETUP.md#3-run-trinity-on-your-mac)).

### 1. Find your vault folder
iCloud vaults usually live at:
```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<Your Vault Name>
```
To get the exact path: in Obsidian, open the vault switcher, click **Open folder** (or "Reveal in Finder"), then drag that folder into Terminal, which pastes its path.

### 2. Keep the vault on your Mac
In Finder, right-click the vault folder and choose **Keep Downloaded** (macOS Sonoma or later). Otherwise iCloud may move older notes off the Mac, and Trinity can't read those.

### 3. Check your daily-note settings
In Obsidian, open **Settings → Daily notes**:
- **New file location:** for example `Daily` or `Journal`.
- **Date format:** for example `YYYY-MM-DD` or `YYYY/MM/YYYY-MM-DD`.

### 4. Get the setup code
In Trinity, go to **Settings → Obsidian on your Mac → Get the setup code**, then **Copy**. It copies a ready-made command.

### 5. Run it in Terminal
```bash
cd ~/trinity/bridge        # wherever you cloned the repo
```
Paste the command, change the vault path at the end to yours, and press Enter. If your daily notes aren't in `Daily/YYYY-MM-DD`, add your settings to the end of the command:
```
--daily-folder "Journal" --daily-format "YYYY/MM/YYYY-MM-DD"
```

Then check it and start it for good:
```bash
node trinity-bridge.mjs test     # should say it signed in and can read the vault
./install.sh                     # starts now and at every login
```
Trinity's Settings should now show **Connected to "<your vault>"**.

## If something's off
- **Log shows "Operation not permitted":** macOS is blocking access to iCloud Drive.
  1. Open System Settings → Privacy & Security → Full Disk Access → **+**.
  2. Add Node. Run `which node` to find it, then press Cmd+Shift+G in the file dialog to paste the path.
  3. Run `./install.sh` again.
- **Where to look:** the log is at `~/.trinity/bridge.log`.
- **To stop it:** `launchctl bootout gui/$(id -u)/com.trinity.bridge`
- **If the setup code leaked, or you replaced the Mac:** Trinity → Settings → Obsidian on your Mac → **Disconnect Mac**. This signs out Trinity everywhere, so sign back in and make a new code.

## What Trinity can do in your vault

| Tool | What it does |
|---|---|
| `vault_search` | Full-text search, returning the best matches with a snippet |
| `vault_read` | Read a note (up to about 30,000 characters) |
| `vault_list` | List a folder |
| `vault_recent` | Notes changed in the last few days |
| `vault_append` | Add to today's daily note (or any note) under a heading |
| `vault_create_note` | Create a new note. She asks before replacing an existing one |

The helper refuses paths outside the vault, hidden folders (like `.obsidian`), and links that lead out of the vault.
