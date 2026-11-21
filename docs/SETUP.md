# Project Trinity: setup guide

Four short parts. Part 1 is only needed for the AI coach (phase 4), so you can do it any time before then.

1. [Get an Anthropic API key](#1-get-an-anthropic-api-key) (for the coach)
2. [Create the Firebase project](#2-create-the-firebase-project) (sync between iPhone and Mac)
3. [Run Trinity on your Mac](#3-run-trinity-on-your-mac)
4. [Put it online and install it](#4-put-it-online-and-install-it-on-iphone-and-mac)

---

## 1. Get an Anthropic API key

The coach uses Claude through the Anthropic API. API usage is billed separately from a Claude.ai subscription, and you pay in advance.

1. Go to **https://platform.claude.com** and sign up, or sign in.
2. Open **Billing** and buy credits. Start small, since Trinity's coach should use roughly $5–15 a month. Leave auto-reload off for now.
3. Optional: set a monthly spend limit (for example $20) in the Console's **Limits** settings, so the bill can't surprise you.
4. Open **Settings → API keys** and click **Create key**. Name it `trinity`.
5. **Copy the key right away.** It's only shown once. Save it in your password manager (iCloud Keychain / Passwords app works).

Keep the key private. Don't paste it into chats, emails, or the code. In phase 4 we'll store it as a Firebase secret on the server, so it never ships inside the app.

---

## 2. Create the Firebase project

Firebase is Google's app backend. Trinity uses it for Google sign-in and to sync your schedule between devices. **Phase 1 works on the free Spark plan, so you don't need a card yet.** Reminders and the coach (phases 2 and 4) run small server functions, and those need the pay-as-you-go **Blaze** plan. At your usage that should cost about $0–1 a month.

1. Go to **https://console.firebase.google.com** and click **Create a project**. Name it `trinity`. You can turn Google Analytics off.
2. **Sign-in:** go to **Build → Authentication → Get started → Sign-in method**. Turn on **Google**, choose your support email, and click **Save**.
3. **Database:** go to **Build → Firestore Database → Create database**. Choose **production mode** and the location closest to you (for example `nam5 (United States)`).
4. **Web app:** go to **Project settings** (the gear icon) **→ General → Your apps** and click the **`</>`** (Web) button. Name it `Trinity` and tick **Also set up Firebase Hosting**. Firebase shows a `firebaseConfig` block. Keep that tab open.
5. *(Before phase 2)* Upgrade to Blaze: click **Upgrade** at the bottom left and add a card. Then go to **Google Cloud console → Billing → Budgets & alerts** and create a **$5 budget alert**.

---

## 3. Run Trinity on your Mac

You need Node.js 20 or newer (install from https://nodejs.org) and Git.

```bash
git clone https://github.com/Dillyt33/trinity.git
cd trinity
npm install
cp .env.example .env.local
```

Open `.env.local` and copy in the values from the `firebaseConfig` block (step 2.4):

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=trinity-xxxxx.web.app
VITE_FIREBASE_PROJECT_ID=trinity-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=trinity-xxxxx.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
```

Set `AUTH_DOMAIN` to your **`.web.app`** address, not the `firebaseapp.com` one. Sign-in on iPhone works reliably only when it matches the address you install the app from.

The Firebase web config isn't a secret: it identifies your project, and `firestore.rules` is what protects your data.

Then run:

```bash
npm run dev
```

and open http://localhost:5173. If you skip `.env.local`, Trinity runs in **demo mode**, which saves to this browser only.

Other commands: `npm test` (unit tests), `npm run check` (type check), `npm run build` (production build).

---

## 4. Put it online and install it on iPhone and Mac

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc      # then put your project ID in it
npm run build
firebase deploy --only hosting,firestore
```

The deploy prints your address, for example `https://trinity-xxxxx.web.app`. It also uploads `firestore.rules`, which only lets you read and write your own data.

**On iPhone:**
1. Open the address in **Safari** (it has to be Safari).
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open Trinity from the new icon and tap **Continue with Google**.

From phase 2, Trinity can send notifications. iPhone only allows that for apps opened from the Home Screen icon, on iOS 16.4 or later.

**On your Mac:**
- **Safari:** open the address, then choose **File → Add to Dock** (macOS Sonoma or later).
- **Chrome:** click the install icon in the address bar.

Sign in with the same Google account and your schedule syncs both ways.

**Updating:** after `git pull` or a new build, run `npm run build && firebase deploy --only hosting`. The installed app picks up the new version the next time it opens.
