# Offbook / 脱稿 — v1 build notes

Phone-first PWA. Chinese UI. No login, no API keys. Local-first (IndexedDB `offbook`).

## Develop

```bash
cd /workspace/english-app/app
npm install          # already done on this box
npm run dev          # http://localhost:5173  (syncs content first)
```

`npm run predev` / `prebuild` run `scripts/sync-content.mjs`: official scenes in `content/scenes/` win; fallbacks fill missing ids only. Official `packs.json`, `sequence.json`, and `skill-tree.json` are copied as-is into `app/public/content/`. Authoring JSON in `content/scenes/` is never rewritten.

## Preview the production build

```bash
cd /workspace/english-app/app
npm run build        # tsc + vite + PWA service worker
npm run preview      # http://localhost:4173
```

Service worker caching is only reliable in the preview/build, not the Vite dev server. Mic, install, and persistent storage need HTTPS or localhost.

To put it on a phone: serve `app/dist` over HTTPS (or a tunnel), open Safari/Chrome, go through first-run, then Add to Home Screen. Tab storage and the Home Screen app do not share IndexedDB; export/import is in Settings.

## Render audio

Piper voices live in `/workspace/english-app/tools/voices/`:

- `en_US-kristin-medium` — Maya (and some other women)
- `en_US-joe-medium` — Chris and other men (needs Piper 1.5+)
- `en_US-ljspeech-high` — Jordan / Jess / Anita / Keisha / narration

Never use Lessac or libritts_r.

```bash
# Prefers tools/piper-venv (piper-tts 1.8.0) so joe works.
# Falls back to the bundled 1.2 CLI only for kristin/ljspeech.
python3 /workspace/english-app/scripts/tts-render.py
python3 /workspace/english-app/scripts/tts-render.py --scene pack01-01-i-got-this
python3 /workspace/english-app/scripts/tts-render.py --force   # regenerate everything
```

Output: `content/audio/<sceneId>/*.m4a` plus `cues.json` with `durationMs`. A *copy* of each scene is stamped into `app/public/content/scenes/` (source JSON is left alone). Missing files fall back to `speechSynthesis` in the app.

**Silence trim:** an early batch used `silenceremove stop_periods=1`, which treated the first mid-line pause as the end of the utterance and cut pack 1 / fallbacks short. The script now trims only leading and trailing silence (reverse-trim). Re-run `--force` on already-clipped scenes after the in-flight packs 2–4 / diagnostic render finishes — do not launch a second full render in parallel.

## Product path

- **Today** follows official `sequence.json` (30 sessions). Session 0 is the diagnostic (three listens at ~120/150/180 wpm + a 45s talk, no fail). Later days use the session’s `mode` and `warmupFrom`.
- **Scenes** lists official packs by life area. Fallback scenes sit under “其他”.
- **Progress** is the ear log (first-listen catch / reveal rate by week, chunks, TTFW trend) plus the skill tree from `skill-tree.json`. Nodes mark ability, not streaks. Later phases are visible as the long path, not locked with icons.
- **Settings**: speed, theme (auto uses 21:00 / `prefers-color-scheme`), install guide, export/import, licenses (Piper, voices, Source Serif 4).

Session lengths: full (~22 min, cuts 4/3/2 first if time runs long, never cuts Speak the Scene or the recap), micro (“我只有 8 分钟”), review (when trouble data exists). Record-and-compare is the speaking product (MediaRecorder mime fallback; TTFW via energy VAD, not ASR). ASR is an optional hint only.

## Known gaps

- Official Month-1 audio is rendered (unclipped). Fallbacks are shorter because those scenes were authored shorter, not because of trim. The service worker does **not** precache `content/audio/**`; audio is cached at runtime (CacheFirst) as it is heard or prefetched for today/next.
- Diagnostic placement is implemented; it does not rewrite the official 30-session sequence by comfortable wpm — it stores `comfortableWpm` and sets default playback speed, with a short Today note.
- No live AI free-talk (out of scope). “Your turn” is guided, with one model reply as a natural option.
- iOS Home Screen storage is isolated; users who practiced in a tab should export, then import after install.
- Landscape is blocked on short screens so the thumb dock is not crushed.

## Polish pass (2026-11-18)

Code-only. Official scene JSON and `content/audio` were not touched. A parent `--force` render (`python3 scripts/tts-render.py --force`, log `/tmp/tts-force.log`) was already running; this pass did not start another renderer and did not write into `content/audio`. `tsc -b` and `vite build` were run **without** `prebuild` sync so in-flight audio was not copied to `public/`. After the force pass finishes, run `npm run build` (or `npm run sync` then build) so `app/public/content` and the service-worker precache pick up the unclipped m4a files.

### Path fixes

- Today primary no longer starts cold listen when the label is “我大概听懂了”. Play is “开始播放”; “我大概听懂了” only advances after audio has started or finished. Resume hint is “从停下的地方继续”, and Continue uses the saved session kind.
- Leaving the first-run beats writes `firstRunComplete`, so a refresh mid-diagnostic returns to Today’s diagnostic card instead of replaying the three onboarding beats. Mid-diagnostic step, answers, and chosen speed are persisted (see later addendum).
- Cut rule: only fluency / 4-3-2 is skippable after 20 minutes in a full session. tv-shadow, easy-listen, and dictogloss stay. Recap can note “今天时长够了，限时说留到下次。”
- Gist all-miss: one retry with slower / first-20s help, plus “还是继续逐句”. It no longer loops forever back to cold listen.
- Unused chunks are written onto `SceneRollup` at session complete and feed review troubles. Review starts on a scene that actually has trouble data.
- Micro prefers the last completed official scene (`pickMicroScene`). Long absence (≥15 days) offers “先热热耳朵，8 分钟”; 4–14 days gets a short warm-reopen note. Warmup plays `warmupFrom` (or last completed scene) lines, not a bogus recording keyed `lineId: 'full'`.
- Fluency last-vs-first now keeps blob URLs from the 60s / 30s takes.
- Record-and-compare is on line-work as well as chunks / Speak the Scene. After the model ends, energy-VAD TTFW is clocked from that moment and the mic auto-arms (unless listening-only). ComparePlayer can auto-play 样子 then 我的 after a new take.
- Recap for micro/review is shorter and still ends on “这就够了。”
- Settings spells out Safari vs Home Screen storage isolation and the HTTPS mic constraint. Progress labels used chunks by form (not line ids), and the A-reduce-basic skill node no longer marks “in-reach” after it should already be reached.
- Visibility listener no longer leaks; object URLs are revoked on unmount / advance. Auto theme follows `prefers-color-scheme` and the 21:00 clock while the app is open.

### Still open (historical; later addenda supersede)

- Diagnostic placement still does not reshape the month sequence by `comfortableWpm`. Mid-diagnostic progress and per-kind resume slots were added in the following pass. Official audio was later synced and is no longer expected to be clipped.
- No live AI free-talk (out of scope).

## Resume slots and diagnostic persistence (2026-11-18)

- Mid-diagnostic progress (listen/talk step, gist answers, TTFW, chosen speed, comfortableWpm, remaining prep time) is saved in the IndexedDB `resume` store under the `diagnostic` key. Leaving and returning continues placement. Refresh mid-diagnostic still lands on Today’s diagnostic card (firstRunComplete is set after the three onboarding beats) and Continue restores the saved step — it does not replay onboarding.
- Session resume is now per kind: `full`, `micro`, `review`, `first-run`, and `diagnostic` are separate slots. Starting a micro or review session cannot overwrite a mid-full session. Today offers to continue an interrupted full session (including one that isn’t today’s card), and micro/review have their own “从停下的地方继续…” links. Starting a *new* full session while a full slot is in progress asks for confirm before replacing that slot.
- `comfortableWpm` is stored as before. If the user does not pick a recap speed, default playback is 0.85 when the comfortable rate is around 120 wpm, and 1.0 (natural) at 150+. The app never auto-speeds up to 1.1. Today and Settings show a short note, e.g. “按你定位的耳朵，先从稍慢开始。” The 30-day sequence is not rewritten.
- Export is version 2 and includes all resume slots (and `comfortableWpm` inside settings). Version 1 files still import: the single `resume` field is placed in its kind slot. Import refreshes Today/Progress state. A legacy `'current'` resume key is migrated on first read.
- Install guide now specifies Safari-only on iOS, Chrome menu text on Android, storage isolation, and the HTTPS mic constraint. Empty Progress no longer draws fake week bars; 375-wide titles and dock tools wrap more safely.

`npm run build` (with sync) succeeded after `/tmp/audio-synced` appeared. Official scene JSON and `content/audio` were not written by this pass.

### Still open

- Diagnostic placement still does not reshape the official 30-session sequence by comfortable wpm (only default speed + a Today note).
- Export/import of recordings and idempotent history were tightened in the following pass.
- No live AI free-talk (out of scope).
## PWA cache and trustworthy backup (2026-11-18)

- The service worker now precaches only the app shell (html/js/css/icons/fonts/manifest) plus small catalog files (`index`, `packs`, `sequence`, `skill-tree`, `licenses`, and scene JSON). `content/audio/**` is excluded from `includeAssets` and `globPatterns`. Runtime `CacheFirst` (`offbook-audio`, max 1200 entries, 120 days) stores m4a as they are heard. After load, today / next (and an interrupted resume scene) are prefetched into that cache so session 0 can work offline without a ~50MB install.
- Default export is a complete backup and includes recordings. The Settings screen shows the file size and offers a clearly labeled “导出进度（不含录音）” alternative. Import is idempotent: sessions are keyed by `sceneId|kind|startedAt`, line events by `sceneId|lineId|at`; a second import of the same file does not duplicate history. Recordings still upsert by `id`. v1 and v2 files import. App state still refreshes after import.

Official scene JSON and `content/audio` were not written. No TTS job was started.

### Still open

- Diagnostic placement still does not reshape the official 30-session sequence by comfortable wpm (only default speed + a Today note).
- No live AI free-talk (out of scope).

## Visual QA fixes (2026-11-18)

Phone preview (Chrome 390×844) of `http://localhost:4173/`. Official scene JSON, line text, and `content/audio` were not rewritten. No TTS job was started.

- Learner-facing copy is Chinese. Official English `setting` / sequence `note` stay in the catalog for authoring; a sidecar (`src/content/situations-zh.ts`) supplies rehearsal-partner `situationZh` at catalog load. Scene cards no longer fall back to `setting` or append English titles. The diagnostic Today card uses the Chinese briefing (三段熟悉话题，大约每分钟 120、150、180 词…没有不及格。).
- Settings licenses render `licenses.md` as headings, paragraphs, lists, and links, with a short Chinese intro. Legal text stays English.
- Cold listen (diagnostic and session) has a single primary play/advance control. Status (“正在听…”) uses body text color. Replay/slower are secondary and only appear after the first listen. Dark `.dock-tool` uses `--lift` plus a border so contrast is no longer nearly invisible against `--ground`.
- Changing tabs (and opening Install) scrolls the window back to the top.
- “我只有 8 分钟” stays visible on the diagnostic resume Today view. Review still appears only when there is trouble data (or a mid-review slot).
- First-run is three beats (promise, how a session goes, then mic) and still opens the diagnostic afterward. The promise was rephrased and `text-wrap: pretty` was added so “来。” is not stranded.
- Skill-tree time units are shown in Chinese in the view (`2–3 个月`, `1–4 周`) without rewriting `skill-tree.json`. Distant nodes say “更远处先看见就好，现在不用做.”
- Session chrome uses “每分钟 120 词”. Settings explains 稍慢 / 自然 / 稍快 under 默认语速. In-session SpeedToggle is available on cold listen as well as later layers.
- Default export is labeled “导出完整备份”; “导出进度（不含录音）” remains the alternative. Storage shows a used-size line only.
- `scroll-padding-bottom` and extra `.app-main.has-tabs` padding keep the last Scenes/Settings rows and the `#licenses` anchor clear of the tab dock.

The hollow ~23px circle in QA shots (Today empty space, mid Scenes list, also over body copy and the 设置 tab in later frames) did not match any app DOM or CSS besides the 4px rust tab `.dot`. Its changing viewport position lines up with a click highlight from the QA harness. No app overlay was found to remove; default `audio` elements are hidden defensively.

`npm run build` must succeed after this addendum.

## License link punctuation (2026-11-18)

Bare URLs in the licenses renderer now drop trailing punctuation, so `https://keithito.com/LJ-Speech-Dataset/).` becomes a clean href. Diagnostic Today meta stays `大约 N 分钟` only (the card covers four placement scenes, not just “一个轻松的周末”).


## Diagnostic session QA (pass 2, 2026-11-18)

Phone walk of the diagnostic at `http://localhost:4173/`. Official scene JSON, dialogue, and `content/audio` were not rewritten. No TTS job was started. `askEn` remains in official JSON for fuzzy matching only.

- Gist/detail questions in Diagnostic and the regular Session gist layer now show only `askZh`. The English `askEn` helper line is no longer rendered.
- The diagnostic header is `4 / 4` on 开口 (prep/talk) and 这就够了 (recap). Listens remain `1–3 / 4`.
- Titles, prompts, and recap lines use `word-break: keep-all` and `text-wrap: pretty` (the previous `overflow-wrap: anywhere` was splitting 周末 / 晚上 / 开始). The wrap-up next-step line was lightly rephrased to “接下来，可以先从大约每分钟 N 词附近的对话开始。”
- An empty gist/detail answer is an explicit “I don’t know” path: the primary stays “下一问” only when there is text; a quieter “先空着，下一问” advances a blank. No scores or red marks were added; blank answers skip the usual soft feedback toast.
- Diagnostic speaking: after prep is skipped or finished, the long prep paragraph is replaced by a short cue. While recording, MicDisc still hosts AmplitudeMeter, now in `currentColor` so rust-on-rust bars are visible, and a live “N / 45 秒” count sits under “大约 45 秒。说完就停。” Level updates use a ref so the meter is not stuck at 0.
- The session hash is `replaceState`’d to the current listen or `diag-speak-this-week` as placement moves, with `kind=diagnostic` kept so refresh still opens the diagnostic and restores the IDB resume slot.

`npm run build` must succeed after this addendum.

## Visual QA (pass 3, 2026-11-18)

Phone preview (390×844, incognito) of `http://localhost:4173/`. Official scene JSON, dialogue, and `content/audio` were not rewritten. No TTS job was started.

- First-run “打开麦克风” no longer fails silently into a listening-only diagnostic. A failed `prepare()` (denied or no prompt / API error) stays on the mic beat, shows `copy.micDenied`, and offers “再试一次” plus the existing “先只听”. `micAllowed` is only set false if the learner chooses 先只听.
- The diagnostic 开口 screen, later session record docks, and Settings all explain a missing 录 and can retry the mic. Success re-enables the disc, sets `micAllowed: true`, and clears listening-only. Settings has a 麦克风 section so this is not first-run-only.
- CJK: first-run `.serif` paragraphs now use `word-break: keep-all` (beat 2 no longer splits 分数). The how-it-works line is “没有评分，也没有不及格。” Number + unit pairs (`45 秒`, `30 秒`, `120 词`, `8 分钟`, `120、150、180 词`, live `N / 45 秒`) are wrapped in `.unit-glue` (`white-space: nowrap`) via `UnitText`, including official `promptZh` at render time (source JSON unchanged), the diagnostic briefing, recap, and Today card meta.

`npm run build` must succeed after this addendum.

## Visual QA (pass 4 typography, 2026-11-18)

Phone preview of `http://localhost:4173/` (build index-zwu2dgyI.js). Official scene JSON, dialogue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here.

- `UnitText` / `glueUnits` now keep a short leading modifier with the number+unit token: 大约, 每分钟, 大约每分钟. A `词/分钟` suffix stays on the same `.unit-glue` span. Examples that no longer break just before the number: “大约 45 秒”, “大约每分钟 120 词”, “每分钟 120 词”, “大约 120 词/分钟”. The span is still only the token, not a whole sentence.
- Sidecar `DIAGNOSTIC_BRIEFING` (not official JSON) is now “三段熟悉话题，大约每分钟 120、150、180 词，先听再问大意，然后准备大约 30 秒，再说大约 45 秒。没有不及格。”
- Learner-facing “下次：” lines use the short scene title. A sequence label like “今日一场戏：这次我来” displays as “下次：这次我来” (`shortSceneTitleZh`, also applied in `copy.nextNamed`). Official `sequence.json` is unchanged. Today/SceneCard splits the same prefix into kicker 今日一场戏 + title 这次我来 when that curriculum label is what Today is showing.
- Diagnostic recap: if all three listens are the “第一遍还没抓住” result, they collapse to one sentence, “这三段第一遍都还没抓住。这不是退步，只是现在的位置。” Differing bands still get per-band lines.

`npm run build` must succeed after this addendum.

## Visual QA (pass 5, 2026-11-18)

Phone preview of `http://localhost:4173/` (bundle index-58XplNmv.js). Official scene JSON, dialogue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here.

- Official session openings no longer show English authoring `setting`. `loadScene()` applies the same `overlaySituationZh` sidecar used by the catalog index: Chinese `situationZh` from `situations-zh.ts`, or a non-English `situationZh` already on the JSON. English `setting` is never copied into `situationZh`.
- Session opening renders `situationZh` only; if it is missing, the paragraph is omitted rather than falling back to `setting`. A repo grep of learner-facing UI found no other `scene.setting` / `titleEn` / sequence `note` / `askEn` / `promptEn` leaks (Today/Scenes already used the catalog overlay).
- Diagnostic recap next-step line is now “接下来可以先从大约每分钟 N 词附近的对话开始。” so “接下来，” is not stranded. The unit phrase stays in one `.unit-glue` span.

`npm run build` must succeed after this addendum.

## Visual QA (pass 6, 2026-11-18)

Phone preview of `http://localhost:4173/` (bundle index-6MMSfC6i.js). Official scene JSON, dialogue, glue notes, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here.

- Gist/detail submit no longer skips a question on a double tap. Session (and the same pattern in Diagnostic) now allows one in-flight advance per question: a ref plus `gistBusy` ignores further 下一问 / 先空着 presses, the pending timeout is cleared on unmount or a new step, and empty (0ms) skips use the same guard. Prompts for a full session remain `[...gist, ...details]`.
- The session header follows the body kicker: it reads “细节” when `step >= scene.gist.length`, not “大意” for the whole gist layer.
- After reveal, the third dock tool is labeled “不看字再听” so it is distinct from “收起文字”. Dock tools wrap (`flex-wrap`, `min-width: 6.25rem`) instead of shrinking type at 390px.
- In LineStage, `glue.hear` and `glue.standard` are `.glue-cite` (`inline-block; white-space: nowrap`) so a short cited phrase stays on one line or moves as a whole, without editing official glue JSON.

`npm run build` must succeed after this addendum.

## Visual QA (pass 7, 2026-11-18)

Phone preview of `http://localhost:4173/` (bundle index-BHBdLnT_.js). Official scene JSON, dialogue, glue notes, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here.

- Official Session cold-listen dock, after the first complete play, shows one secondary control “再听一次” (`copy.replayOnce`) for the single extra full listen. The unlimited “再听一遍” next to it is gone. After that extra listen is used, there is no same-speed full replay; 稍慢 / 先听前 20 秒 still appear on a complete gist miss (`offerSlow`). Diagnostic already had a single replay-once control and now shares the short label, which will not orphan “次）” at 390px.
- Learner-facing title overlay (display-side, official `title` / `titleZh` untouched): “周五吃 taco” (diag-listen-150) shows as “周五吃塔可”, and “预订在 Chen 名下” (pack03-03-reservation-under) as “预订在陈名下”. Applied in `loadIndex` / `loadScene` and in `shortSceneTitleZh` / SceneCard splits. “三个人 AA” is left as-is.
- Optional: RevealText wraps short contraction phrases such as “I don't know” in `.phrase-glue` (`inline-block; white-space: nowrap`) so “I don't / know” does not split. Official line text is unchanged; long lines still wrap at ordinary spaces.

`npm run build` must succeed after this addendum.

## Visual QA (pass 8, 2026-11-18)

Phone preview of `http://localhost:4173/` (bundle index-Bh5PoKDi.js). Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here.

- Gist/detail advance: the `useEffect` on `stepIndex` / `promptI` no longer clears an in-flight timeout or unlocks the dock as soon as the next question appears (that let a leftover tap submit empty Q2 in 0ms). Submit now captures `nextStep` / `nextPrompt` and sets that value (idempotent if two timeouts fire). The dock stays locked through the feedback toast and for 300ms after the new question is shown. Timeouts are cleared only on unmount or when a new submit starts. The same pattern is on the Diagnostic gist path.
- After the one extra cold listen is used, the helper is “可以去说大意。” instead of “可以再听，或去说大意”. offerSlow still has its 稍慢 / 前 20 秒 copy when those controls appear. Diagnostic uses “可以慢一点再听，或去说大意” after its one replay, since 稍慢 is then available.
- When `listeningOnly`, ComparePlayer says “可以先听样子。” (not “再听你的”). 跟着说 is hidden until the mic is on. 我的 stays a disabled empty state. 打开麦克风 and the listen-only note remain.
- Scenes/Settings end-of-list padding: `html, body` use `min-height` instead of a fixed `height: 100%`. `.has-tabs .page` now has `padding-bottom: tab-height + safe + 72px` so the last list row (title and meta) can scroll fully above the fixed tab bar. `list-row` also has matching `scroll-margin-bottom`.
- Dock tools use `min-width: 8rem` so a third control such as 不看字再听 wraps onto the next row at 390px rather than sitting tight against the others. No icon was added.

`npm run build` must succeed after this addendum.

## Visual QA (pass 9, 2026-11-18)

Phone preview of `http://localhost:4173/` (previous bundle index-70iIu7OF.js; this build is index-BM0viyoB.js). Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here. “偷语块” / “去偷语块” / “把这个说法拿走”, Maya/Chris, and “三个人 AA” were left as product voice. comfortableWpm still does not rewrite the 30-session sequence; no live AI free-talk was added.

- Today no longer shows two 8-minute actions after a long miss. The separate long-miss-only “先热热耳朵，8 分钟” block is gone. One micro CTA remains, labeled `midMicro ? resumeMicro : longMiss ? earWarmup : micro`.
- Recap learner-facing lines (gist / reveal / chunk / ttfw / cut / close / nextNamed) render through `UnitText`, so tokens such as 大约 / 每分钟 / N 词 / N 秒 stay together. Today’s `wpmNote` and the long-miss helper do the same, as do micro/review opening kickers, Progress ttfw / minutes, and skill-tree `passZh` / weeks.
- Export filenames use the learner’s local calendar date (`Intl` with `Asia/Shanghai`, still `YYYY-MM-DD`), not UTC `toISOString().slice(0, 10)`.
- After a successful export, Settings no longer auto-opens `navigator.share`. The file still downloads and the existing exportDone message still appears. No new share button was added (copy never promised one).
- Light audit only: Progress no longer falls back to a raw English `sceneId` as a title (`这场戏` instead). Skill-tree nodes show `passZh` only, not the English authoring `pass`. Dark-theme `.btn-soft` uses `--lift` plus a border so the fill is visible against `--ground`. Settings, InstallGuide, ConfirmSheet, and existing dock/list padding needed no further rewrite.

`npm run build` succeeded after this addendum (bundle index-BM0viyoB.js).

## Visual QA (pass 10, 2026-11-18)

Phone preview of `http://localhost:4173/` (previous bundle index-BM0viyoB.js, 390×844 incognito, first-run 先只听; this build is index-DqPLEYtr.js). Official scene JSON, dialogue, glue, `content/audio`, and skill-tree.json were not rewritten. No TTS job was started. The preview was not started or restarted here. “偷语块”, Maya/Chris, and “三个人 AA” were left as-is.

- LicenseDoc `inline()` now turns markdown `` `code` `` into `<code>` (monospace), so lines such as “The full license text is also at `/fonts/OFL.txt`.” no longer show raw backticks. Existing link / bare-URL / bold handling is unchanged. The licenses.md source was not edited. `.license-doc` (and descendants) use `word-break: normal` so English legal text does not inherit CJK `keep-all` from `.page .serif`.
- Learner-facing helpers and skill-tree copy no longer split mid-word at 390px (分开存的, 图标打开, 剧场风对话). The existing keep-all rule now also covers `.helper`, `.skill-node`, `.skill-node p`, and `.skill-node h3` (`word-break: keep-all; overflow-wrap: break-word; text-wrap: pretty`). Settings `storageSplit` / `httpsMic` also have `cjk-wrap`. Mid-page “导入进度” was not pinned above the tab bar; end-of-page padding is unchanged.
- `copy.httpsMic` (Settings and InstallGuide) is now “请用主屏幕上的图标打开这一页，麦克风和进度会更稳。普通浏览器页或不安全的连接上，麦克风常常不能用。” It no longer implies the current page (including localhost) is unsafe.

`npm run build` succeeded after this addendum (bundle index-DqPLEYtr.js).

## Visual QA (pass 12, 2026-11-18)

Phone preview of `http://localhost:4173/` (previous bundle index-DqPLEYtr.js, 390×844, first-run 先只听; this build is index-CnpAS_47.js). Official scene JSON, dialogue, glue, and `content/audio` were not rewritten (including `diag-speak-this-week.json` / `promptZh`). No TTS job was started. The preview was not started or restarted here. “偷语块”, Maya/Chris, and “三个人 AA” were left as-is.

- `UnitText` / `glueUnits` now also wrap a trailing punctuation cluster with the preceding character in `.punct-glue` (`white-space: nowrap`), covering `。！？,，、；;.` and `…`. Recap lines such as “接下来可以先从大约每分钟 120 词附近的对话开始。” no longer leave a lone “。” on the next line after the unit token fills most of a 390px row. Only the last character plus the punct cluster is glued, not the whole sentence. The Diagnostic next-step sentence itself was left unchanged.
- A short run of 2+ Latin words (up to 48 characters, e.g. “This week was pretty normal”) is wrapped in `.phrase-glue` so a teaching cue in official `promptZh` stays on one line. Trailing punctuation after the run is absorbed into the same span. Longer English still wraps at spaces. Licenses are not UnitText and were not changed. Official JSON was not edited.
- Diagnostic recap still collapses an all-miss to one line, “这三段第一遍都还没抓住。这不是退步，只是现在的位置。” For mixed bands, each miss is only the per-band result (“第一遍还没抓住。”); the reassurance is added once after the band lines if any band missed.

`npm run build` succeeded after this addendum (bundle index-CnpAS_47.js).

## Visual QA (pass 13 typography, 2026-11-18)

390px typography check of the previous bundle (CSS index-Cg_iUJ1K.css, content width 358px; this build is index-C-QKT3Di.js, CSS unchanged). Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here. No QA fixture was written into `app/dist/`; a leftover `app/dist/qa-pass13-fixture.html` from the typography check was deleted.

- Trailing `.punct-glue` now includes the two preceding non-space, non-punctuation characters plus the punct cluster, so “开始。” / “位置。” / “细节。” / “部分。” are a single nowrap token. The mixed-recap next-step line no longer splits as “开” at the end of line 1 and “始。” at the start of line 2. Still not a whole clause. The Diagnostic next-step wording was left unchanged.

`npm run build` succeeded after this addendum (bundle index-C-QKT3Di.js).

## Visual QA (pass 14 typography, 2026-11-18)

390px typography fixture PASS (`http://127.0.0.1:8765/fixture.html`, CSS index-Cg_iUJ1K.css, production bundle index-C-QKT3Di.js). “开始。” stays one `.punct-glue` token; “This week was pretty normal，” stays one `.phrase-glue` token; mixed recap copy is unchanged (reassurance once after band lines). Screenshots live under `/workspace/english-app/qa/pass14/`. No QA fixture was shipped in `app/dist/`. Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here.

## Visual QA (pass 15, 2026-11-18)

Dark iOS splash for every `SPLASH_SIZES` entry, plus splash PNGs kept out of the Workbox precache. Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here. No QA fixture was written into `app/dist/`. The HTTPS tunnel was not started.

- `generate-assets.py` now writes `apple-splash-dark-{w}-{h}.png` for every splash size (`write_dark_splashes()`, also used by `main()`). This pass generated dark splashes only (`--dark-splash-only`); existing light icons and light splashes were not overwritten. `index.html` lists a dark `apple-touch-startup-image` for each size first, with `(prefers-color-scheme: dark)` plus the same device-width / device-height / pixel-ratio / portrait query as the matching light size. Light links also have `(prefers-color-scheme: light)`. `apple-mobile-web-app-status-bar-style` remains `black-translucent`.
- Splash PNGs still ship in `dist/splash/` (13 light + 13 dark) for iOS Add to Home Screen, but they are no longer in the precache: `splash/**/*.png` was removed from `includeAssets`, and `**/splash/**` was added to `workbox.globIgnores`. After this build: precache 65 entries (855.81 KiB), down from 93 entries (~1186 KiB / ~1.18 MB). The manifest lists no `apple-splash*.png`, still includes the app shell (index.html, JS/CSS, icons, fonts, manifest) and the small catalog (index / packs / sequence / skill-tree / licenses + 37 scene JSON). No `content/audio` in the precache.

`npm run build` succeeded after this addendum. JS/CSS hashes are unchanged (`index-C-QKT3Di.js`, `index-Cg_iUJ1K.css`) because this pass did not edit app source or typography CSS. `index.html` and `sw.js` did change.

## Visual QA (pass 16, 2026-11-18)

Deduplicate the Workbox precache. Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here. No QA fixture was written into `app/dist/`. The HTTPS tunnel was not started, and the zip was not re-packed.

- Favicon, icons, fonts, and `fonts/OFL.txt` were listed twice: once via VitePWA `includeAssets` and once via `workbox.globPatterns`. Those redundant `includeAssets` entries were removed (`includeAssets` omitted). `globIgnores` still includes `**/splash/**` and `**/content/audio/**`. Splash PNGs were not added back to the precache.
- `npm run build` succeeded. JS/CSS hashes are unchanged (`index-C-QKT3Di.js`, `index-Cg_iUJ1K.css`). Precache is 56 unique entries (855.81 KiB), down from 65 listings; every URL in `sw.js` is unique. The set still includes index.html, the JS/CSS above, workbox-window, manifest.webmanifest, favicon.ico, favicon.png, all four icons, both woff2 fonts, OFL.txt, the 5 catalog JSON + licenses.md, and 37 scene JSON. No `apple-splash` in the manifest. No `content/audio` in the precache. `dist/splash/` still has 26 PNGs.

`npm run build` succeeded after this addendum.

## Visual QA (pass 17, 2026-11-18)

Playback errors are no longer treated as a finished listen. Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here. No QA fixture was written into `app/dist/`. The HTTPS tunnel was not started, and the zip was not re-packed.

- `playUrl` / `playContent` / `playSequence` now take an optional `onError`. A real media error, or a `play()` rejection after the one unlock-and-retry, calls `onError` and does not call `onEnd`. If `onError` is omitted, failure still does not call `onEnd`. `playContent` still uses the Web Speech fallback only when there is no file; a failed fallback also calls `onError`, not `onEnd`.
- Learner copy: `copy.playFailed` is “这段声音这次没播出来。再点一次，或检查网络。” Diagnostic `playListen` and Session `playCold` set `playing` false, show that helper in the existing listen-status line, and do not set `heard` / `coldHeard`. ComparePlayer clears the playing-which state and can replace its existing helper with the same line (no new overlay). Chunk / speak-scene `onPlayModel` sets `playing` false and does not auto-start recording. The new string has no number+unit tokens, so it is not wrapped in `UnitText`.

`npm run build` succeeded after this addendum (bundle index-H4Sh70SQ.js; CSS still index-Cg_iUJ1K.css). Precache remains 56 unique entries.

## Visual QA (pass 18, 2026-11-18)

Diagnostic cold listen now shows the same rust tally used in Session, so a Home Screen install has a playing indicator besides the status text. Official scene JSON, dialogue, glue, and `content/audio` were not rewritten. No TTS job was started. The preview was not started or restarted here. No QA fixture was written into `app/dist/`. The HTTPS tunnel was not started, and the zip was not re-packed. Listen copy, dock labels, and playFailed / heard logic were not changed. The speak-stage “大约 45 秒” listen-status was left as a timer prompt, with no tally.

- In Diagnostic `sub === 'cold'`, a `.waveform` well with `{playing ? <span className="tally" /> : null}` sits above the listen-status line (marginTop 32 / 12, matching Session). No fake amplitude or numeric progress.
- `.tally` has a gentle 1.6s opacity/scale pulse. Under `@media (prefers-reduced-motion: reduce)`, `animation: none` so the dot stays static (token `--dur` shortening is not used for this animation).

`npm run build` succeeded after this addendum (bundle index-PDqu8xPR.js, CSS index-BiaIz4u3.css).
