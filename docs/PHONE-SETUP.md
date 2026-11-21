# Trinity on your iPhone: 10-minute setup (step 0)

This gets Trinity working in the Claude app today with Claude Pro: voice, web search, and planning your day. Once step 1 (Trinity's tools) is built, she'll also be able to change the Trinity calendar herself.

## 1. Fill in "About me"
Open [`assistant/trinity-instructions.md`](../assistant/trinity-instructions.md) and fill in the **About me** section at the bottom: your goals, weekly targets, usual day, and how hard to push you. Two minutes of real detail makes a big difference.

## 2. Make a "Trinity" project in Claude
1. On claude.ai (on your Mac is easiest), open **Projects → New project** and name it **Trinity**.
2. Open the project's instructions and paste everything below the `---` line from `trinity-instructions.md`.
3. On your iPhone, open the Claude app, go to the **Trinity** project, and start a chat there. Use the voice button to talk.

## 3. Make her the default everywhere (voice, Siri)
A Project only applies to chats started inside it. So that the plain voice button and Siri "Ask Claude" also act like Trinity, add a short version to your personal preferences in Claude's settings. In the Claude app or on claude.ai, open your profile settings and find the box asking what personal preferences Claude should consider. Paste:

> You are Trinity, my personal assistant. You run my schedule, remind me, hold me to my plans, look things up and get things done. Be direct and honest, with a little tough love and a little warmth. Keep replies short for voice, one question at a time. Always ask before sending, spending, deleting or posting. When you plan a day, give it as Trinity time blocks (`- [ ] HH:MM-HH:MM Title #category`).

## 4. One button to reach her
- **Action button** (iPhone 15 Pro and later): **Settings → Action Button → Shortcut → Ask Claude**.
- **Siri:** say "**Hey Siri, Ask Claude**", then speak.
- **Back Tap** (any recent iPhone): **Settings → Accessibility → Touch → Back Tap → Double Tap →** pick your Ask Claude shortcut.

## 5. Connect what she should see
In the Claude app, go to **Settings → Connectors**. Make sure web search is on. Add the tools you use (Gmail, Google Drive, and so on). Claude asks before using a connected tool.

## 6. Try it
- "Trinity, plan my day. I have a call at 2 and I want to hit the gym."
- "I don't feel like going to the gym." (expect a little tough love)
- "What's the weather this afternoon? Should I run before or after lunch?"
- "Give me today's blocks so I can paste them into Trinity." Then in the Trinity app: **Settings → Markdown → Import a day**.

## Optional: your Mac, driven from your phone (Pro)
- **Claude Cowork + Dispatch:** in the Claude desktop app on your Mac, turn on Dispatch (Settings → Cowork) and pair your phone with the QR code. Then from your phone: "Rename the photos in Downloads by date." The Mac must stay awake. This is a research preview.
- **Claude Code Remote Control:** in Terminal on your Mac, run `claude --remote-control` inside a project folder. Then continue the session from the Claude app on your phone.
