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
| **DSH Director** | 15-tool production API behind a 4-round INTENT → PLAN → EXECUTE → OBSERVE orchestrator. Mid-turn project switching, full execution trace rendered in the console. |
| **Render pipeline** | Staged engine pipeline (validate → build → light → simulate → render → composite → encode), LLM render evaluator that proposes *bounded* parameter fixes, apply-fixes → auto re-render (attempt 2), approve → FINAL. |
| **Continuity engine** | Universe-level conflict detection (e.g. destroyed artefact reappearing in Ep 29) with proposed resolutions, plus missing-capability analysis per scene. |
| **Comic Mode** | Shot breakdowns re-composed as sequential art — **manhua** pages, **manhwa/webtoon** vertical scroll, **manga** right-to-left pages. Deterministic panel-layout engine, procedural panel sketches, print/PDF export. |
| **3D cinematic preview** | Three.js procedural MVP scene driven by live scene parameters and shot camera presets (movement-aware), with auto shot advance. |
| **Studio UI** | Dashboard, Productions, Characters (states / relationships / derivatives), Story & Scenes, Comic Mode, Timeline, Render Queue, Continuity, Terminology, History. |

## Screenshots

**Comic Mode** — the same episode re-composed as manhua (LTR, colour), manga (RTL, monochrome + screentone) and manhwa/webtoon (vertical scroll) pages:

| Manhua | Manga (RTL) | Webtoon |
|--------|-------------|---------|
| ![Manhua mode](docs/screenshots/comic-mode-manhua.png) | ![Manga mode](docs/screenshots/comic-mode-manga.png) | ![Webtoon mode](docs/screenshots/comic-mode-webtoon.png) |

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
│   ├── api/            # 13 route handlers (projects, characters, scenes, shots,
│   │                   #   render-jobs, dsh, continuity, terminology, …)
│   └── page.tsx        # single-route studio SPA
├── components/
│   ├── views/          # studio views (dashboard, dsh-console, comic, …)
│   ├── preview/        # three.js cinematic preview
│   └── studio/         # app shell (zustand + TanStack Query)
└── lib/
    ├── dsh/            # tools, prompts, orchestrator, evaluator
    ├── engine/         # render engine simulator (bridge interface for a real engine)
    ├── comic/          # deterministic panel layout engine
    ├── continuity.ts   # conflict + capability checking
    └── seed.ts         # "Immortal Path" demo universe
```

**Stack:** Next.js 16 · TypeScript · Prisma/SQLite · TanStack Query · zustand · Tailwind · shadcn/ui · Three.js.

Per the platform's replaceability principle, the render engine is a simulated driver behind a bridge interface — swap in Blender/Unreal/custom renderers without touching the brain. Same for the queue layer.

## Run it

```bash
bun install
cp .env.example .env      # DATABASE_URL=file:./db/custom.db
bun x prisma db push
bun run dev               # http://localhost:3000
```

The database auto-seeds on first request with the **Immortal Path** demo production: a donghua universe with character development states, a six-shot Scene 12 breakdown, a seeded continuity conflict (Jade Sword destroyed in Ep 29) and terminology entries.

### Try the loop

1. Open **Render Queue**, trigger a render on any shot.
2. Watch the evaluation come back `NEEDS_REVISION` with bounded parameter fixes → **Apply fixes** auto-queues attempt 2.
3. Open **DSH Director** and talk to the studio: *"Create a new wuxia production called Azure Sky with a sword forge environment"* — watch the 15-tool execution trace.
4. Open **Comic Mode** and flip the same episode between manhua / webtoon / manga layouts.

## Status

MVP — the thesis is proven end-to-end with a simulated engine. Next horizons: live engine driver (Blender bridge), image-generation-backed panel art, dialogue/speech-bubble authoring, multi-episode batch rendering.
