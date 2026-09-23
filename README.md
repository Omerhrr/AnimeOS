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
| **DSH Director** | 32-tool production API behind a 4-round INTENT → PLAN → EXECUTE → OBSERVE orchestrator. Mid-turn project switching, full execution trace rendered in the console. The director authors **dialogue** (`set_shot_dialogue`), **panel art** (`generate_panel_art`), **character model sheets** (`generate_model_sheet`), the **art style direction** (`set_art_style`), **scene staffing** (`auto_assign_scene_team` - specialism-aware artist routing + content-matched LoRA attachment, load-balanced), **voice direction** (`direct_voice_takes` - state-aware delivery for every VOICE cue) and **voice casting** (`cast_voice_actor` - roster artists speak for characters) itself, pins **state arcs** across a shot range or across whole scenes of an episode (`set_state_arc`, `scope:'episode'`), paints **reusable arc templates** over a range in one call (`apply_arc_template` - the built-ins plus the production's own saved shapes), **suggests a template** when the creator describes a beat in prose (`suggest_arc_template` ranks the registry against their words and hands back the apply framing), and proposes the webtoon export pre-flight in the same turn a diff detects staleness. The arc tools report the **direction impact** they just caused (which takes went stale) so DSH offers the re-render to the creator in the same turn. |
| **Render pipeline** | **Live Blender bridge** when attached (jobs submitted over HTTP to the `animeos_bridge.py` add-on, progress polled, frames pulled back), built-in simulator otherwise - same job lifecycle, same LLM render evaluator with *bounded* parameter fixes, apply-fixes → auto re-render, approve → FINAL. **Batch rendering** queues every shot across selected episodes in one click (PREVIEW or FINAL, FINAL shots skipped), with DSH inspections throttled per poll. |
| **Style direction** | Per-production **art style tuning**: a custom style directive (overrides the visual-style preset), palette tokens and extra negative tokens - compiled into every panel-art and model-sheet prompt, tunable from the studio UI or by DSH itself. |
| **Casting consistency** | Per-character **AI model sheets** (turnaround reference images) plus a stored **canonical visual anchor** - the exact prompt tokens re-injected into every panel featuring that character, keeping faces/wardrobe coherent across panels and episodes. |
| **Continuity engine** | Universe-level conflict detection (e.g. destroyed artefact reappearing in Ep 29) with proposed resolutions, plus missing-capability analysis per scene. |
| **Comic Mode** | Shot breakdowns re-composed as sequential art - **manhua** pages, **manhwa/webtoon** vertical scroll, **manga** right-to-left pages. Deterministic panel-layout engine, **AI-generated panel artwork** (style-aware prompts seeded with shot type, environment, weather and character states), **speech-bubble authoring** (speech / thought / SFX, RTL-aware placement), print/PDF export, and **webtoon slice export** - the strip re-rendered at 800px and packed boundary-aware into platform-ready PNG slices, each scored slice carrying an **audio stem** (16-bit WAV, cues re-timed onto the slice timeline) that mixes **real TTS voice renders** for dialogue cues (**per-artist voice casting**: a character's cast roster artist performs the line; uncast speakers fall back to deterministic casting; **per-character-state delivery**: AUTO resolves the speaker's episode state, e.g. a battle-damaged Lin Yue reads strained and slow while an excited read rushes at 1.18x; a **line-level delivery** authored per dialogue line outranks scene direction, so one shot can play neutral then injured mid-performance; and a pinned standing direction overrides the state; a **state arc** (dialogue-editor arrow buttons or DSH `set_state_arc`) stamps one state onto the speaker's every following line across the scene, or across scene boundaries through the end of the episode (`scope:'episode'`), so a whole beat performs possessed without line-by-line edits, and each shot card carries violet **arc-span chips** (with the full span shown in the panel inspector's State arcs section: range, cross-scene badge, position and the covered lines); **state speed/pitch hints** bend pace and voice depth on top, so a possessed read can be slower and deeper without anyone re-pinning a register) with the synthesized SFX/BGM/ambience beds, plus a manifest with artists, LoRA metadata, voice takes (cast artist, delivery, direction + resolved state per take) and audio timing, zipped client-side. The manifest also tags every voice stem and take with its **direction currency** (fresh / stale / unrendered against the current direction, per stem and per take, so downstream tooling knows which speech needs a re-render), and an **export pre-flight** names each stale or blocked take before the ZIP downloads, with an explicit export-anyway override. A **direction diff** board re-resolves what every VOICE cue in an episode would render as today, diffs it against the snapshot each take was made with, and re-renders only the affected takes. A **season-wide arc ruler** draws every state arc as a violet bar over an episode axis with **one lane per speaker** (a labeled gutter row per character, segments sized by shot count, spans that survive an episode boundary merged into ONE season arc and marked `→ season`, click a bar to open that episode), and **arc templates** (built-ins "possession spread", "full takeover", "recovery arc" plus **user-defined shapes saved per production**: build a custom segment layout, save it with a name and description, and it joins the registry in the dialog AND inside DSH) paint a reusable beat shape onto one speaker's lines across a scene or the whole episode from a dialog with a live dry-run preview - DSH paints and suggests the same shapes via `apply_arc_template` / `suggest_arc_template`. |
| **Multi-artist studio** | **Style LoRA registry** (per-adapter trigger tokens, strength, base model) with **per-shot fine-tuning** from the panel inspector and **simulated LoRA training runs** distilled from approved panels (live steps, decayed loss curve, milestone log, TRAINED badge) plus a **Train all** batch button that fine-tunes every idle adapter in one pass; an **artist roster** with per-shot assignment, bulk assignment, a **workload-balance view** (production-wide spread badge, per-artist bars, **affinity-first pool distribution**: LoRA-bound panels route to the artist with the highest style affinity for that adapter, unbound panels rotate by load, **per-artist style affinity** scoring which LoRA each artist delivered with) and **per-artist voice casting** (each artist carries a TTS voice; characters bound to an artist via the casting board or DSH's `cast_voice_actor` are performed by that artist's voice everywhere), plus **per-state voice variants**: a development state can bind a different TTS voice (DSH `set_state_voice_variant` or the character sheet picker), so a possessed / transformed / battle-damaged Lin Yue is performed by a different voice entirely while that state is episode-effective, no register change required; each state can also carry **speed/pitch hints** (character sheet selects or DSH `set_state_voice_variant` args) that bend the take's pace and pitch while the state is effective and flag older takes stale; the casting board **auditions** any roster voice on a throwaway TTS render - a custom line, or the character's own first dialogue line - in a chosen register before anything is cast, and **auditions a whole state**: pick a development state and hear its variant voice plus its speed/pitch hints performed before binding anything; DSH can staff whole scenes autonomously via `auto_assign_scene_team`. |
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
7. Open **Artists** to run **voice casting**: give each roster artist a TTS voice, then bind characters to the artist who speaks for them. **Audition** any voice first - the board renders a throwaway sample (your line, or the character's own first line, in a chosen register) without saving a take - or pick a development state under a character and hear exactly how that state performs (variant voice + speed/pitch hints). Ask DSH to do the same with `cast_voice_actor`, and to set standing deliveries scene-wide with `direct_voice_takes`.
8. After a state beat or a line edit, open **Direction diff** in the Comic Mode toolbar: every take is compared against today's direction and **Re-render affected** touches only the stale ones (fresh takes are never re-rendered).
9. Open **LoRA** and hit **Train all** to batch-fine-tune every idle adapter from the approved panels (each run shows a live loss curve), or **Train** a single one; then open **Workload** and hit **Distribute pool (affinity-first)** to route unassigned panels to the artist whose style affinity is highest for each panel's adapter.
10. Back in **Render Queue**, use **Batch render**: tick two episodes, hit *Queue N renders*, and watch the queue fill, DSH inspect each preview (throttled per poll), and the stats row track active / review / approved.

## Status

The full thesis now runs end-to-end: DSH directs dialogue, panel art, model sheets, style direction, scene staffing, voice casting and state-aware voice direction through 31 production tools; a live Blender can drive the engine via the bridge; Comic Mode produces AI-illustrated, dialogue-authored, casting-consistent pages in all three native formats, directs voices line by line inside a shot, auditions cast choices and whole character states before committing them, exports webtoon platform slices whose audio stems carry cast-artist, character-state-shaped TTS voice takes over the synthesized score, diffs every episode's direction and re-renders only the takes that moved, measures the whole season's state arcs on a cross-episode ruler with one lane per speaker, paints beats from reusable arc templates (the production can save its own), and matches prose beat descriptions to those templates, batch-trains style adapters from approved panels, and routes the panel pool affinity-first while ranking per-artist style affinity, and the queue swallows whole episodes in one batch.
