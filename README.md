# AnimeOS - AI-Native Animation Production Platform

> **DSH decides · Tools execute · Engine builds · State remembers**

AnimeOS is an AI-native production studio for animated and illustrated storytelling. It natively supports **donghua**, **anime**, **manhua/manhwa (comics)** and adjacent formats through one unified, stateful production pipeline - designed so an AI director (DSH) drives the studio through tools, not ad-hoc chat.

## Core thesis

```
DSH decides → tools execute → engine builds → render → DSH evaluates → revise → approve
```

Every step writes to a persistent production universe: projects, seasons, episodes, scenes, shots, characters (with episode-resolved states), relationships, assets, terminology and continuity events. Nothing lives only in a chat log.

## Feature map

| Area | What it does |
|------|--------------|
| **DSH Director** | 32-tool production API behind a 4-round INTENT → PLAN → EXECUTE → OBSERVE orchestrator. Mid-turn project switching, full execution trace rendered in the console. The director authors **dialogue** (`set_shot_dialogue`), **panel art** (`generate_panel_art`), **character model sheets** (`generate_model_sheet`), the **art style direction** (`set_art_style`), **scene staffing** (`auto_assign_scene_team` - specialism-aware artist routing + content-matched LoRA attachment, load-balanced), **voice direction** (`direct_voice_takes` - state-aware delivery for every VOICE cue) and **voice casting** (`cast_voice_actor` - roster artists speak for characters) itself, pins **state arcs** across a shot range or across whole scenes of an episode (`set_state_arc`, `scope:'episode'`), paints **reusable arc templates** over a range in one call (`apply_arc_template` - the built-ins plus the production's saved shapes AND the studio library), **suggests a template** when the creator describes a beat in prose (`suggest_arc_template` ranks the registry against their words and hands back the apply framing), and proposes the webtoon export pre-flight in the same turn a diff detects staleness. **Ensemble beats**: pass `characters:[{name, stateLabel?}]` and one template lands on several speakers in ONE batch (per-speaker state overrides, unresolvable speakers skipped and reported, one combined Direction impact). The arc tools report the **direction impact** they just caused (which takes went stale) so DSH offers the re-render in the same turn, attach **playable arc chips** to the trace (the reply itself streams the arc's stored takes in story order), render **same-turn auditions** (one proposed read per engaged speaker of the exact stamped line, A/B against the stored take) and record **per-scope usage counts** so the registry shows which shapes each show actually applies. |
| **Render pipeline** | **Live Blender bridge** when attached (jobs submitted over HTTP to the `animeos_bridge.py` add-on, progress polled, frames pulled back), built-in simulator otherwise - same job lifecycle, same LLM render evaluator with *bounded* parameter fixes, apply-fixes → auto re-render, approve → FINAL. **Batch rendering** queues every shot across selected episodes in one click (PREVIEW or FINAL, FINAL shots skipped), with DSH inspections throttled per poll. |
| **Style direction** | Per-production **art style tuning**: a custom style directive (overrides the visual-style preset), palette tokens and extra negative tokens - compiled into every panel-art and model-sheet prompt, tunable from the studio UI or by DSH itself. |
| **Casting consistency** | Per-character **AI model sheets** (turnaround reference images) plus a stored **canonical visual anchor** - the exact prompt tokens re-injected into every panel featuring that character, keeping faces/wardrobe coherent across panels and episodes. |
| **Continuity engine** | Universe-level conflict detection (e.g. destroyed artefact reappearing in Ep 29) with proposed resolutions, plus missing-capability analysis per scene. |
| **Comic Mode** | Shot breakdowns re-composed as sequential art - **manhua** pages, **manhwa/webtoon** vertical scroll, **manga** right-to-left pages. Deterministic panel-layout engine, **AI-generated panel artwork** (style-aware prompts seeded with shot type, environment, weather and character states), **speech-bubble authoring** (speech / thought / SFX, RTL-aware placement), print/PDF export, and **webtoon slice export** - the strip re-rendered at 800px and packed boundary-aware into platform-ready PNG slices, each scored slice carrying an **audio stem** (16-bit WAV, cues re-timed onto the slice timeline) that mixes **real TTS voice renders** for dialogue cues (**per-artist voice casting**: a character's cast roster artist performs the line; uncast speakers fall back to deterministic casting; **per-character-state delivery**: AUTO resolves the speaker's episode state, e.g. a battle-damaged Lin Yue reads strained and slow while an excited read rushes at 1.18x; a **line-level delivery** authored per dialogue line outranks scene direction, so one shot can play neutral then injured mid-performance; and a pinned standing direction overrides the state; a **state arc** (dialogue-editor arrow buttons or DSH `set_state_arc`) stamps one state onto the speaker's every following line across the scene, or across scene boundaries through the end of the episode (`scope:'episode'`), so a whole beat performs possessed without line-by-line edits, and each shot card carries violet **arc-span chips** (with the full span shown in the panel inspector's State arcs section: range, cross-scene badge, position and the covered lines); **state speed/pitch hints** bend pace and voice depth on top, so a possessed read can be slower and deeper without anyone re-pinning a register) with the synthesized SFX/BGM/ambience beds, plus a manifest with artists, LoRA metadata, voice takes (cast artist, delivery, direction + resolved state per take) and audio timing. The manifest also tags every voice stem and take with its **direction currency** (fresh / stale / unrendered against the current direction, per stem and per take, so downstream tooling knows which speech needs a re-render), and an **export pre-flight** names each stale or blocked take before the ZIP downloads, with an explicit export-anyway override. A **direction diff** board re-resolves what every VOICE cue in an episode would render as today, diffs it against the snapshot each take was made with, and re-renders only the affected takes. **Arc storytelling at season scale**: a **season-wide arc ruler** draws every state arc as a violet bar over an episode axis with **one lane per speaker** (a labeled gutter row per character, spans that survive an episode boundary merged into ONE season arc, click a bar to open that episode, clickable episode labels focus the ruler per episode), and **arc templates** (built-ins "possession spread", "full takeover", "recovery arc" plus **user-defined shapes saved per production or in the studio library**, with shape **versioning** that archives every replaced shape) paint a reusable beat shape onto one speaker's lines - or onto SEVERAL speakers as one parallel beat - from a dialog with a live dry-run preview, a **version diff** and a **cross-scope diff** (any two shapes across built-in / production / studio side by side with a human "what moved" list, plus **per-scope usage counts** on every saved shape). The same shapes are paintable and suggestable inside DSH via `apply_arc_template` / `suggest_arc_template`. **Everything with stored takes plays**: arc cards and ensemble clusters in the panel inspector (a cluster shows the merged story-order queue and streams the whole beat), ▶ chips on the ruler bars, and playable arc chips inside the DSH reply itself - all fed by one per-episode playback feed. |
| **Multi-artist studio** | **Style LoRA registry** (per-adapter trigger tokens, strength, base model) with **per-shot fine-tuning** from the panel inspector and **simulated LoRA training runs** distilled from approved panels (live steps, decayed loss curve, milestone log, TRAINED badge) plus a **Train all** batch button that fine-tunes every idle adapter in one pass; an **artist roster** with per-shot assignment, bulk assignment, a **workload-balance view** (production-wide spread badge, per-artist bars, **affinity-first pool distribution**: LoRA-bound panels route to the artist with the highest style affinity for that adapter, unbound panels rotate by load, **per-artist style affinity** scoring which LoRA each artist delivered with) and **per-artist voice casting** (each artist carries a TTS voice; characters bound to an artist via the casting board or DSH's `cast_voice_actor` are performed by that artist's voice everywhere), plus **per-state voice variants**: a development state can bind a different TTS voice (DSH `set_state_voice_variant` or the character sheet picker), so a possessed / transformed / battle-damaged Lin Yue is performed by a different voice entirely while that state is episode-effective; each state can also carry **speed/pitch hints** (character sheet selects or DSH `set_state_voice_variant` args) that bend the take's pace and pitch while the state is effective and flag older takes stale. The casting board **auditions** any roster voice on a throwaway TTS render - a custom line, or the character's own first dialogue line - in a chosen register before anything is cast, **auditions a whole state** (its variant voice plus its speed/pitch hints, before binding anything), runs **ensemble try rows** (one batch call renders every picked speaker as an A/B row with a per-row compare and a cast-order sequence play), and keeps a **per-state audition history**: every proposed read (DSH variant binds, ensemble applies, board state tries) lands in a timestamped, replayable, removable list with its performance snapshot (voice, register, speed/pitch, duration, the line, the date) pruned to the latest 12, and **any two recorded reads chain back to back** - pick sides A and B, hit compare, swap the order, hear them one after the other. DSH can staff whole scenes autonomously via `auto_assign_scene_team`. |
| **3D cinematic preview** | Three.js procedural MVP scene driven by live scene parameters and shot camera presets (movement-aware), with auto shot advance. |
| **Studio UI** | Dashboard, Productions, Characters (states / relationships / derivatives), Story & Scenes, Comic Mode, Timeline, Render Queue, Continuity, Terminology, History. |

## Screenshots

**Comic Mode** - the same episode re-composed as manhua (LTR, colour), manga (RTL, monochrome + screentone) and manhwa/webtoon (vertical scroll) pages:

| Manhua | Manga (RTL) | Webtoon |
|--------|-------------|---------|
| ![Manhua mode](docs/screenshots/comic-mode-manhua.png) | ![Manga mode](docs/screenshots/comic-mode-manga.png) | ![Webtoon mode](docs/screenshots/comic-mode-webtoon.png) |

**Casting consistency & the live bridge** - Lin Yue's AI model sheet (turnaround anchor), DSH-authored dialogue rendered as bubbles over anchor-consistent AI art, and the engine-driver card:

| Model sheet | DSH-authored art + thought bubble | Engine driver |
|--------|-------------|---------|
| ![Model sheet](docs/screenshots/model-sheet-linyue.png) | ![DSH bubble](docs/screenshots/comic-bubbles-fixed.png) | ![Bridge](docs/screenshots/bridge-driver-card.png) |

**Batch pipeline & slice export** - the cross-episode batch render card in the queue, and platform-ready 800px webtoon slices cut from the strip (bubbles, captions, chips re-drawn at export resolution):

| Batch render | Webtoon slice (800px) |
|--------|-------------|
| ![Batch render](docs/screenshots/batch-render.png) | ![Webtoon slice](docs/screenshots/webtoon-slice-1.png) |

## Native format support

| Format | Pipeline posture |
|--------|------------------|
| **Donghua** | Style preset with zh-CN terminology defaults, cultivation-state character modelling, ink-wash flavoured panel art, xianxia demo universe. |
| **Anime** | Cel-shading posture, anime timing stage in the render ladder, ja-JP terminology defaults. |
| **Manhwa** | Manhwa-inspired framing preset (ko-KR) + webtoon vertical-scroll Comic Mode. |
| **Manhua / Manga** | First-class Comic Mode layouts with correct reading direction (LTR / RTL / vertical). |

## Architecture

```
src/
├── app/
│   ├── api/            # 15 route handlers (projects, characters, scenes, shots,
│   │                   #   render-jobs, dsh, panel-art, character-sheet, bridge, …)
│   └── page.tsx        # single-route studio SPA
├── components/
│   ├── views/          # studio views (dashboard, dsh-console, comic, …)
│   ├── preview/        # three.js cinematic preview
│   └── studio/         # app shell (zustand + TanStack Query)
└── lib/
    ├── dsh/            # tools, prompts, orchestrator, evaluator
    ├── ai/             # art service: panel art + character model sheets
    ├── bridge/         # live Blender bridge (HTTP transport, simulator fallback)
    ├── engine/         # render pipeline (Blender driver ⇄ simulator driver)
    ├── comic/          # deterministic panel layout engine + dialogue model
    ├── continuity.ts   # conflict + capability checking
    └── seed.ts         # "Immortal Path" demo universe
bridges/blender/       # animeos_bridge.py - run this INSIDE Blender
```

**Stack:** Next.js 16 · TypeScript · Prisma/SQLite · TanStack Query · zustand · Tailwind · shadcn/ui · Three.js.

Per the replaceability principle, the render engine is a **pluggable driver**: attach a live Blender (below) or let the built-in simulator drive - the production state machine, queue and DSH evaluation loop are identical.

### Attach a live Blender

```bash
# inside any Blender ≥ 3.x (GUI or headless):
blender -b -P bridges/blender/animeos_bridge.py -- --port 8100
# then point the studio at it and restart the dev server:
ANIMEOS_BLENDER_HOST=127.0.0.1:8100 bun run dev
```

The add-on exposes `GET /status`, `GET /progress`, `POST /render`, `POST /ping` on `127.0.0.1`. AnimeOS maps its tunable scene parameters (fog, lightning, energy, rim light, camera distance) onto bpy equivalents, frames the camera per shot grammar (ESTABLISHING→24mm wide … EXTREME_CLOSEUP→100mm), renders the frame, and reports progress into the same queue UI; the frame lands in `public/renders/`. If the bridge drops mid-job the simulator takes over transparently.

## Run it

```bash
bun install
cp .env.example .env      # DATABASE_URL=file:./db/custom.db
bun x prisma db push
bun run dev               # http://localhost:3000
```

The database auto-seeds on first request with the **Immortal Path** demo production: a donghua universe with character development states, a six-shot Scene 12 breakdown, a seeded continuity conflict (Jade Sword destroyed in Ep 29) and terminology entries.

### Try the loop

1. Open **Render Queue**, trigger a render on any shot - the **Engine driver** card shows whether a live Blender or the simulator is driving; the job badge shows `BLENDER` or `SIM`.
2. Watch the evaluation come back `NEEDS_REVISION` with bounded parameter fixes → **Apply fixes** auto-queues attempt 2.
3. Open **DSH Director** and talk to the studio: *"For scene 12 shot 3: author the dialogue, generate a model sheet for any new character, then paint the panel in manhua style"* - the 32-tool trace shows the director doing it itself. Ask it to *"shift to a cold moonlit silver-blue palette"* and it retunes the production's style direction itself.
4. Open **Characters** - hit ✦ on a character to generate their **model sheet**; the stored anchor then steers every panel they appear in (cards show an `ANCHOR` badge once locked).
5. Open **Comic Mode** and flip the same episode between manhua / webtoon / manga layouts. Bubbles (speech / thought / SFX) place themselves around the art - mirrored for manga RTL - **Print / PDF** exports pages with chrome hidden, and in webtoon format **Export slices** downloads a ZIP of 800px platform-ready strips whose audio stems mix real TTS voice takes into the score.
6. In **Comic Mode**, open **Motion sound** on a motion panel: auto-score the timeline, hit **Render voices** to give every dialogue cue a real TTS take performed by the speaker's cast artist in the speaker's current character state (or pick a voice, speed and an explicit excited / injured delivery per cue, plus a directorial note), and preview - exported stems use the same takes. Author **line-level delivery** in the dialogue editor (the ✎ on any panel) to play one shot's lines in mixed registers; the motion-sound board shows which line direction outranks the standing one.
7. Open **Artists** to run **voice casting**: give each roster artist a TTS voice, then bind characters to the artist who speaks for them. **Audition** any voice first - the board renders a throwaway sample (your line, or the character's own first line, in a chosen register) without saving a take - or pick a development state under a character and hear exactly how that state performs (variant voice + speed/pitch hints). Every proposed read lands in the state's **audition history** (replayable, removable), and **any two recorded reads chain back to back**: pick sides A and B, hit *compare A · B*, and hear them one after the other. Select several characters for an **ensemble try** and DSH or the board renders an A/B row per speaker with a sequence play. Ask DSH to do the same with `cast_voice_actor`, and to set standing deliveries scene-wide with `direct_voice_takes`.
8. After a state beat or a line edit, open **Direction diff** in the Comic Mode toolbar: every take is compared against today's direction and **Re-render affected** touches only the stale ones (fresh takes are never re-rendered).
9. Open **LoRA** and hit **Train all** to batch-fine-tune every idle adapter from the approved panels (each run shows a live loss curve), or **Train** a single one; then open **Workload** and hit **Distribute pool (affinity-first)** to route unassigned panels to the artist whose style affinity is highest for each panel's adapter.
10. Back in **Render Queue**, use **Batch render**: tick two episodes, hit *Queue N renders*, and watch the queue fill, DSH inspect each preview (throttled per poll), and the stats row track active / review / approved.

## Status

The full thesis runs end-to-end: DSH directs dialogue, panel art, model sheets, style direction, scene staffing, voice casting and state-aware voice direction through 32 production tools; a live Blender can drive the engine via the bridge; Comic Mode produces AI-illustrated, dialogue-authored, casting-consistent pages in all three native formats, directs voices line by line inside a shot, auditions cast choices and whole character states before committing them, remembers every proposed read per state with a replayable A/B-chainable history, exports webtoon platform slices whose audio stems carry cast-artist, character-state-shaped TTS voice takes over the synthesized score, diffs every episode's direction and re-renders only the takes that moved, measures the whole season's state arcs on a cross-episode ruler with one lane per speaker, paints beats from reusable arc templates (saved per production or in the studio library, versioned, usage-counted, diffable across scopes), lands ensemble beats on several speakers in one batch with same-turn auditions and playable arc chips in the reply itself, batch-trains style adapters from approved panels, and routes the panel pool affinity-first while ranking per-artist style affinity, and the queue swallows whole episodes in one batch.

## Roadmap - what is not achieved yet, and how we will get there

The plan's destination is an AI-native studio that takes a story from prose to published, animated episodes with zero manual coordination. The thesis loop is closed, but these parts of the vision are still open:

1. **Real animated shots, not stills.** Panels render as AI stills and the 3D preview moves, but a shot is not yet an actual video cut. Next: extend the Blender bridge from single-frame renders to sequenced clips (the shot's camera grammar and movement chips already exist as data), add a deterministic tween fallback for simulator mode, and mux rendered frames with the existing audio stems into per-shot video files during export.
2. **Continuity checking that sees the art.** Conflict detection is fact-based (script-level universe rules); it cannot yet catch a wardrobe or prop mismatch that the panel generator painted. Next: a VLM pass per generated panel that compares the frame against the character's stored anchor description and the universe facts, filing continuity events automatically with a confidence score.
3. **DSH across turns and days.** The director plans within one 4-round turn; a multi-episode breakdown still needs a human in the loop between messages. Next: persist DSH plans as first-class, resumable objects (plan → steps → done), add scheduled agent runs (nightly batch breakdowns, render-queue supervision) and a plan review UI where the creator approves the next chapter before it executes.
4. **Voice scale and character voices.** TTS is a fixed catalog of voices with rate-limit ceilings (the E2E suite backs off on 429s), and voices are cast, not cloned. Next: a provider abstraction with retry/backoff plus render caching keyed on voice + text + delivery + speed/pitch, and a cloning-provider slot so a character's voice is trained once and performed everywhere.
5. **Evaluation that measures consistency.** Render evaluation is LLM-graded on composition; nothing scores whether the character actually looks like the anchor. Next: embedding-based similarity scoring per panel against the stored anchor, thresholded into the re-render queue the same way direction staleness is today.
6. **A studio with more than one person in it.** Multi-artist routing exists, but there is one login, no roles, and no review threads. Next: auth with per-role views (director / artist / voice actor), comment threads anchored to panels and takes, and an approval gate that feeds the same render pipeline.
7. **Distribution beyond the ZIP.** Webtoon slices and print PDFs download locally; nothing schedules or publishes. Next: a release calendar with per-platform presets and direct upload integrations, built on the existing slice pre-flight.

Each item lands the same way the last twelve iterations did: one thin, testable slice at a time, every step verified against the production database and the running studio.
