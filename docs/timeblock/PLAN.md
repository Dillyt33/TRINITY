# Timeblock: plan (v2)

A time-blocking app with an AI coach that keeps you on track. It runs on your iPhone and your Mac, stays in sync between them, and sends notifications even when the app is closed.

Status: **plan and concept mockups. No app code yet.** Mockups: https://claude.ai/artifact/6Fpr2gprsuVvDJEaNj3eZr (new: "AI coach & notifications" row)

### What changed since v1
- **Notifications are a must,** including when the app is closed.
- **New: an AI coach.** It reminds you, changes the schedule when needed, and explains why sticking to it matters.
- **iCloud is no longer required.** Sync between iPhone and Mac now goes through a cloud backend (Google Cloud / Firebase).
- **Google Calendar is an optional mirror,** so you can also see your blocks in Calendar on the Mac.
- **Markdown becomes an export/import format** instead of the storage format.

---

## 1. Your questions, answered

### Can we build a native iPhone app as a demo without the Developer Program?
Yes, but it couldn't do the part that matters most to you.

| | Native app, free Apple ID | Installable web app (recommended now) |
|---|---|---|
| Install | Xcode on your Mac, then cable or Wi-Fi to the phone | Safari → Share → Add to Home Screen |
| Expires | **Every 7 days** (reinstall from Xcode) | Never |
| Reminders you set ahead | Yes (local notifications) | Yes |
| **Coach messages and instant changes while the app is closed** | **No.** Push needs the paid program | **Yes**, via Web Push (iOS 16.4+) |
| On your Mac | Separate Mac build | Same app: Safari → File → Add to Dock, with notifications |
| Widgets, Live Activities, Siri intents | Possible | No (they come with the native wrapper later) |

Expo Go (the no-Xcode way to run React Native apps) also dropped remote push in SDK 53, so it has the same gap.

**Recommendation:** build it as an installable web app now. On the iPhone it sits on the Home Screen, opens full screen, and gets real push notifications. Build it so that when you join the Developer Program ($99/yr), we wrap the same code in a native shell (Capacitor) and add widgets, Live Activities, Siri and native push with action buttons.

### Google Calendar?
Yes, as an optional two-way mirror of a dedicated "Timeblock" calendar:
- You see your blocks in Calendar on the Mac (add your Google account) or at calendar.google.com.
- Google Calendar's own alerts act as a backup reminder channel.
- Claude's built-in Google Calendar connector can create and update events, so you could also say "add gym tomorrow at 6" in any Claude app and it shows up in Timeblock.

### App on the laptop too, synced with the phone?
Yes. The same app installs on your Mac (Safari → File → Add to Dock). Both devices read and write the same cloud database, so a change on one shows up on the other within about a second. Google Calendar is optional on top of that.

---

## 2. Recommended architecture

```
  iPhone (Home Screen app)        Mac (Dock app)            Claude apps / Siri
           │  ▲                       │  ▲                        │
     edits │  │ Web Push        edits │  │ Web Push               │ MCP connector / Shortcut
           ▼  │                       ▼  │                        ▼
  ┌──────────────────────── Google Cloud (Firebase) ────────────────────────┐
  │  Auth (Sign in with Google)   Firestore (live sync)   Cloud Functions    │
  │  Cloud Tasks (exact-time reminders)    Push sender (VAPID Web Push)      │
  │  Coach service ──► Claude API          MCP server (Cloud Run)            │
  │  Google Calendar sync (optional, two-way)                                │
  └──────────────────────────────────────────────────────────────────────────┘
```

| Piece | Choice | Why |
|---|---|---|
| App | TypeScript + Svelte 5, installable web app (PWA) | Smooth, small, one codebase for iPhone and Mac; can be wrapped in a native shell later |
| Sign-in | Firebase Auth, Sign in with Google | One tap; the same account unlocks Calendar sync |
| Data and sync | Firestore | Live sync across devices; works offline and catches up |
| Reminders | Cloud Tasks, one task per reminder | Fires at an exact time and is easy to cancel when a block moves |
| Push | Web Push (VAPID) to every device you've signed in on | Reaches you when the app is closed, on iPhone and Mac |
| AI | Claude API (`claude-opus-5-5`) | Coaching, re-planning, natural-language edits |
| Claude everywhere | Remote MCP server on Cloud Run, added as a custom connector on claude.ai | Always on, so your Mac doesn't need to be awake; works in the Claude iPhone app |
| Calendar | Google Calendar API, optional | Mac Calendar view, backup alerts, Claude's built-in connector |

---

## 3. Notifications

- **For each block,** the server queues three reminders: "Up next" 5 minutes before, "Starting now", and an end-of-block check-in. Moving or resizing a block, from any device or by the coach, cancels and re-queues them.
- **Coach messages** (morning brief, nudges, re-plan suggestions) go out the same way.
- **Controls:** quiet hours, per-category on/off, and a "gentle / direct / tough love" tone.
- **Requirements on iPhone:** iOS 16.4 or later, app added to the Home Screen, and a one-time tap on "Turn on notifications".
- **Backup channel:** with the Google Calendar mirror on, each block also carries a calendar alert.

## 4. The AI coach

**What it knows:**
- Your goals and why they matter to you (set up in a short onboarding).
- Your schedule.
- Your history: streaks, completion rates, and which blocks you tend to skip.

**What it does:**
- Morning brief: the day at a glance and the one block that matters most.
- Nudges before, during and after blocks, written around your goals ("this keeps your 4×/week streak").
- Check-ins when a block ends: Done / Need more time / Didn't start.
- Re-planning when you fall behind. It proposes the change and you tap Apply. Small changes can apply automatically if you allow it.
- Answers "why should I stick to this?" with your own goals and numbers, not generic motivation.
- Evening review and a suggested plan for tomorrow.

**Tools it gets:**
- `get_schedule`, `find_free_time`, `get_goals`, `get_stats`
- `add_block`, `move_block`, `resize_block`, `delete_block`, `mark_done`

**Guardrails:**
- It asks before changing more than two blocks at once.
- Every change is logged and undoable.
- It never deletes without asking.
- It respects quiet hours.

**How it's built:**
- Nudges and briefs are single Claude API calls.
- The coach chat is an agent with the schedule tools. The default is Claude Managed Agents: Anthropic hosts the agent loop. It's in beta, bills session runtime on top of tokens, and keeps session history until it's deleted. Alternatively we run our own loop on the Messages API in Cloud Functions, if you'd rather host it.

**Rough cost** at Opus 5.5 rates ($4 in / $20 out per million tokens; estimates):

| Usage | Per item | Per month |
|---|---|---|
| Nudge | ≈ 1.5K tokens in + 80 out ≈ $0.008 | 12 a day ≈ $3 |
| Coach chat turn | ≈ $0.03 | 10 a day ≈ $9 |

Prompt caching brings both down. This needs an Anthropic API key, which is billed separately from a Claude subscription.

## 5. Getting things in

| Source | How |
|---|---|
| In the app | Quick-add bar ("gym 6pm 1h #health") or tell the coach |
| Claude chat (desktop, web, iPhone) | Timeblock MCP connector: add, move or plan days, find free time |
| Siri | Shortcut: Dictate Text → "Get Contents of URL" (POST to the Timeblock API) → the coach schedules it → push confirmation |
| Google Calendar | With the mirror on, events you or Claude add to the Timeblock calendar import automatically |
| Markdown | Copy or export a day as Markdown, or paste Markdown to import (same line format as v1: `- [ ] 09:00-10:30 Title #tag`) |

## 6. Costs

| Item | Cost |
|---|---|
| Firebase / Google Cloud | Blaze plan (pay-as-you-go, card required); personal use likely fits the free quotas, about $0–1/mo |
| Claude API | Roughly $5–15/mo depending on how much you chat with the coach |
| Google Calendar API | Free |
| Apple | $0 now; $99/yr only if/when we go native |

For Google Calendar, the OAuth app must be set to "In production": in "Testing" mode, sign-ins expire every 7 days. For personal use you'll click through one "unverified app" screen.

## 7. Build phases

1. **Foundation.** Installable app, Sign in with Google, live sync, Day view, task detail, quick add, color schemes. Works on iPhone and Mac.
2. **Notifications.** Push sign-up, reminder scheduler, check-in flow, quiet hours.
3. **Month and Week views,** plus templates.
4. **Coach v1.** Morning brief, smart nudges, check-ins, re-plan proposals, coach chat with schedule tools.
5. **Claude everywhere.** MCP connector, Siri Shortcut, optional Google Calendar two-way mirror.
6. **Native wrapper,** once you're in the Developer Program: native push with action buttons, widgets, Live Activities.

Each phase ends with something you can use.

## 8. Risks

- **iOS web push** works when the app is closed, but some developers report it's less consistent than native push. Mitigation: the Google Calendar alert backup now, the native wrapper later.
- **Notification buttons** (Done / +15) on iOS web push aren't confirmed. The mockups assume you tap the notification to open the check-in.
- **iOS specifics:** removing the Home Screen icon removes its notification sign-up, and if you tap "Don't Allow", iOS won't ask again. The app will explain both.

## 9. Decisions for you

1. Go with an installable app now and native later?
2. Google Calendar mirror: on or off?
3. Coach tone: gentle, direct or tough love?
4. Do you have an Anthropic API key, and is roughly $5–15/mo OK?
5. OK to create a Firebase project under your Google account? (The Blaze plan needs a card on file.)
6. Still open from v1: default color scheme, and week starting Sunday or Monday.

---

## Sources
- Web Push for iOS Home Screen web apps: [WebKit](https://webkit.org/?p=13878), [Apple developer docs](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [OneSignal guide](https://documentation.onesignal.com/docs/web-push-for-ios), [MagicBell: PWA limits on iOS](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide), [Discourse thread on reliability](https://meta.discourse.org/t/-/394149/1)
- Safari web apps on Mac (Add to Dock, notifications): [Apple Support](https://support.apple.com/en-au/104996)
- Expo Go has no remote push from SDK 53: [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/)
- Free Apple ID limits (no push or iCloud, 7-day expiry): [Apple forums](https://developer.apple.com/forums/thread/818501); local notifications without a server: [Apple archive](https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/SchedulingandHandlingLocalNotifications.html)
- Google OAuth "Testing" refresh tokens expire after 7 days: [Google Ads API forum](https://groups.google.com/g/adwords-api/c/Z_kihrf6VCE)
- Claude's Google Calendar connector can create and update events: [Claude help](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors), [connector page](https://claude.com/connectors/google-calendar)
- Claude remote MCP connectors on mobile: [Claude help](https://support.claude.com/en/articles/11176164-pre-built-connectors-using-remote-mcp)
