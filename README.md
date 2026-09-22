# AnimeOS — AI-Native Animation Production Platform

> **DSH decides · Tools execute · Engine builds · State remembers**

AnimeOS is an AI-native production studio for animated and illustrated storytelling. It natively supports **donghua**, **anime**, **manhua/manhwa (comics)** and adjacent formats through one unified, stateful production pipeline — designed so an AI director (DSH) drives the studio through tools, not ad-hoc chat.

## Core thesis

```
DSH decides → tools execute → engine builds → render → DSH evaluates → revise → approve
```

Every step writes to a persistent production universe: projects, seasons, episodes, scenes, shots, characters (with episode-resolved states), relationships, assets, terminology and continuity events. Nothing lives only in a chat log.

## Feature map

| Area | What it does |
|------|--------------|
| **DSH Director** | 18-tool production API behind a 4-round INTENT → PLAN → EXECUTE → OBSERVE orchestrator. Mid-turn project switching, full execution trace rendered in the console. The director authors **dialogue** (`set_shot_dialogue`), **panel art** (`generate_panel_art`) and **character model sheets** (`generate_model_sheet`) itself. |
| **Render pipeline** | **Live Blender bridge** when attached (jobs submitted over HTTP to the `animeos_bridge.py` add-on, progress polled, frames pulled back), built-in simulator otherwise — same job lifecycle, same LLM render evaluator with *bounded* parameter fixes, apply-fixes → auto re-render, approve → FINAL. |
| **Casting consistency** | Per-character **AI model sheets** (turnaround reference images) plus a stored **canonical visual anchor** — the exact prompt tokens re-injected into every panel featuring that character, keeping faces/wardrobe coherent across panels and episodes. |
| **Continuity engine** | Universe-level conflict detection (e.g. destroyed artefact reappearing in Ep 29) with proposed resolutions, plus missing-capability analysis per scene. |
| **Comic Mode** | Shot breakdowns re-composed as sequential art — **manhua** pages, **manhwa/webtoon** vertical scroll, **manga** right-to-left pages. Deterministic panel-layout engine, **AI-generated panel artwork** (style-aware prompts seeded with shot type, environment, weather and character states), **speech-bubble authoring** (speech / thought / SFX, RTL-aware placement), print/PDF export. |
| **3D cinematic preview** | Three.js procedural MVP scene driven by live scene parameters and shot camera presets (movement-aware), with auto shot advance. |
| **Studio UI** | Dashboard, Productions, Characters (states / relationships / derivatives), Story & Scenes, Comic Mode, Timeline, Render Queue, Continuity, Terminology, History. |

## Screenshots

**Comic Mode** — the same episode re-composed as manhua (LTR, colour), manga (RTL, monochrome + screentone) and manhwa/webtoon (vertical scroll) pages:

| Manhua | Manga (RTL) | Webtoon |
|--------|-------------|---------|
| ![Manhua mode](docs/screenshots/comic-mode-manhua.png) | ![Manga mode](docs/screenshots/comic-mode-manga.png) | ![Webtoon mode](docs/screenshots/comic-mode-webtoon.png) |

**Casting consistency & the live bridge** — Lin Yue's AI model sheet (turnaround anchor), DSH-authored dialogue rendered as bubbles over anchor-consistent AI art, and the engine-driver card:

| Model sheet | DSH-authored art + thought bubble | Engine driver |
|--------|-------------|---------|
| ![Model sheet](docs/screenshots/model-sheet-linyue.png) | ![DSH bubble](docs/screenshots/comic-bubbles-fixed.png) | ![Bridge](docs/screenshots/bridge-driver-card.png) |

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
bridges/blender/       # animeos_bridge.py — run this INSIDE Blender
```

**Stack:** Next.js 16 · TypeScript · Prisma/SQLite · TanStack Query · zustand · Tailwind · shadcn/ui · Three.js.

Per the replaceability principle, the render engine is a **pluggable driver**: attach a live Blender (below) or let the built-in simulator drive — the production state machine, queue and DSH evaluation loop are identical.

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

1. Open **Render Queue**, trigger a render on any shot — the **Engine driver** card shows whether a live Blender or the simulator is driving; the job badge shows `BLENDER` or `SIM`.
2. Watch the evaluation come back `NEEDS_REVISION` with bounded parameter fixes → **Apply fixes** auto-queues attempt 2.
3. Open **DSH Director** and talk to the studio: *"For scene 12 shot 3: author the dialogue, generate a model sheet for any new character, then paint the panel in manhua style"* — the 18-tool trace shows the director doing it itself.
4. Open **Characters** — hit ✦ on a character to generate their **model sheet**; the stored anchor then steers every panel they appear in (cards show an `ANCHOR` badge once locked).
5. Open **Comic Mode** and flip the same episode between manhua / webtoon / manga layouts. Bubbles (speech / thought / SFX) place themselves around the art — mirrored for manga RTL — and **Print / PDF** exports pages with chrome hidden.

## Status

The full thesis now runs end-to-end: DSH directs dialogue, panel art, model sheets and renders through 18 production tools; a live Blender can drive the engine via the bridge; Comic Mode produces AI-illustrated, dialogue-authored, casting-consistent pages in all three native formats. Next horizons: multi-episode batch rendering, per-shot style LoRA fine-tuning, webtoon slice export.
