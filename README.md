# 脱稿 Offbook 2.0

Phone-first PWA for speaking practice: **watch a short episode → steal 3 lines → take a call from Maya → recap**. Chinese UI, no account, no server. Batch 1 ships Season 1, chapter 1 (episodes 1–7).

**Live:** https://jay-12201018.github.io/offbook/

## How it works

| Tab | What it does |
| --- | --- |
| 今天 | Today's episode card (full / 8-minute / talk-only) and the season path map |
| 句库 | Phrases collected from "偷 3 句" and calls, plus a listen-and-say review |
| 我 | Progress, pace, call voices, **AI 对话 (DeepSeek key)**, backup |

Practice screens are full-screen: `Watch` (chat-bubble episode player with blurred text, per-line replay / slow / Chinese / optional AI explanation, one-tap gist question) → `Steal` (3 chunk cards, speech-recognition word lighting, or record-and-compare fallback) → `Call` → `Recap`.

### AI calls (user's own DeepSeek key)

- The key is entered in 我 → AI 对话, stored only in this device's IndexedDB (`offbook2` → `secrets`), never exported in backups, and sent only to `https://api.deepseek.com`.
- `api.deepseek.com` answers CORS preflights for any origin (checked from headless Chromium on localhost and with the `https://jay-12201018.github.io` origin), so the browser calls it directly — no proxy.
- Calls use streaming Chat Completions with `thinking: {type: "disabled"}` for low latency. Default model `deepseek-flash` (DeepSeek retired `deepseek-chat` / `deepseek-reasoner` on 2026-07-24; a stored legacy name is migrated automatically). `deepseek-v4-pro` or any custom model name can be chosen.
- The partner's reply is spoken with the device's `speechSynthesis` sentence by sentence while it streams. The learner answers with the Web Speech API (`src/lib/asr.ts` handles iOS quirks: a fresh recognizer per attempt, delayed start after audio, one automatic retry, interim-as-final fallback) or by typing.
- Hints (Chinese intent → first words → full line), the recap ("you said" vs "more natural", 3 phrases saved to 句库, praise) and the line explainer are JSON / text completions.
- Without a key, calls run scripted branching dialogues from `src/content/season1.ts` (keyword intents, one "sorry, what was that?" retry, tap-to-answer chips).

## Content

- Scene text and pre-rendered Piper audio: `public/content/` (unchanged from v1; audio is not precached, it is cached at runtime when heard).
- Episode layer for batch 1 (line translations, gist question, call scripts, hooks): `src/content/season1.ts`. All dialogue is original.
- Avatars: `public/avatars/*.webp`.

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173/offbook/
npm run build && npm run preview   # http://localhost:4173/offbook/
node qa/e2e.cjs    # headless iPhone-like walkthrough: fake recognizer reproducing the iOS "deaf after a cut session" bug, mocked DeepSeek (needs Playwright; BASE=... OUT=... CLEAN=1)
```

## Deploy

Pushes to `main` run [`.github/workflows/pages.yml`](.github/workflows/pages.yml): `npm ci && npm run build`, then deploy to GitHub Pages. Vite `base` is `/offbook/`; content fetches go through `publicUrl()`, and the manifest `start_url` / `scope` are `/offbook/`.

## iOS speech notes

Safari on iOS 27 has a bug (WebKit 321436): once a speech-recognition session is cut
with `stop()`/`abort()`, later sessions hear nothing until the app is relaunched.
Offbook therefore speaks a short cue with `speechSynthesis` before every listening
session, creates a new recognizer each time, never cuts a session on iOS (✓ just stops
waiting), and keeps every result until the session ends. 「我 → debug 语音」 shows the
recognizer / TTS / DeepSeek request events on screen.
