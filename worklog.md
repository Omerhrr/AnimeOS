# Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: Build the AI-Native Animation Production Platform ("Animation OS") MVP per the user's 2542-line vision doc (upload/Pasted Content_1790058255757.txt)

Work Log:
- Loaded fullstack-dev + LLM skills; initialized Next.js 16 scaffold via init script
- Designed Prisma schema (SQLite): Project/Season/Episode/Scene/Shot, Character/CharacterState/Relationship, Asset/AssetVersion, RenderJob/Evaluation, ContinuityEvent, Terminology, ProductionEvent, DshMessage
- Built core libs: continuity checker (conflict + missing-capability detection), render engine simulator (timed stage pipeline, param application), seed ("Immortal Path" donghua demo universe with Lin Yue development states, Scene 12 six-shot breakdown, Jade Sword destroyed-Ep29 continuity conflict, terminology)
- Built DSH brain: 15-tool production API (create_project/character/state/relationship/environment/asset/episode/scene/shot/terminology, add_continuity_event, check_continuity, check_capabilities, render_shot, get_production_context), JSON tool protocol, 4-round INTENT→PLAN→EXECUTE→OBSERVE orchestrator with mid-turn project switching, LLM render evaluator proposing bounded parameter modifications
- Built 13 API route handlers (all force-dynamic, malformed-body guards)
- Built studio UI: dark cinematic shell (zustand + TanStack Query), Dashboard, DSH Director console with execution-trace rendering, Productions (config form per §8), Characters (states/relationships/derivatives), Story & Scenes (capability ✓/✗, continuity conflicts with resolutions, shot list with render triggers), Timeline (duration-proportional status blocks), Render Queue (live progress, evaluation cards, apply-fixes/retry/approve), Continuity, Terminology, History
- Built Three.js cinematic preview (§37): procedural night-mountain MVP scene (§53) - peak, cloud sea, rain, lightning flashes + bolts, cultivator figure with glowing sword energy particles; shot camera presets derived from real shot records (movement-aware), driven by live scene params DSH tunes
- Fixed bugs found during verification: useRef/useState missing imports, continuity payload wrapper, static caching of GET /api/projects, DSH mid-turn project switch writing to old project, stale SQLite file handle after db delete (restarted via .zscripts/dev.sh detached)
- Verified end-to-end: seeded render completes → DSH LLM inspection returns NEEDS_REVISION + 4 bounded modifications → apply writes params to scene + auto-queues attempt 2; DSH live turns from UI (created "Azure Sky" production with 12 tool calls across 3 rounds; added terminology + continuity event) all traceable in console UI
- Agent Browser verification: dashboard, story, 3D preview (WebGL renders + shot auto-advance), render queue evaluation card, DSH console live turn, terminology, characters, timeline, mobile 390px - all rendered and interactive; fixed header overlap on mobile; lint clean; dev.log clean

Stage Summary:
- Deliverable: runnable Next.js 16 studio app at / (single route SPA), db/custom.db auto-seeded on first request
- Core thesis proven: DSH decides → tools execute → engine builds → render → DSH evaluates → revise → approve, with persistent universe state
- Key files: prisma/schema.prisma; src/lib/{types,seed,continuity,store,api-client}.ts; src/lib/engine/render.ts; src/lib/dsh/{tools,prompts,orchestrator,evaluator}.ts; src/app/api/**; src/components/studio/studio-shell.tsx; src/components/views/*.tsx; src/components/preview/cinematic-preview.tsx; scripts/{wipe.ts,test-render-loop.sh}
- Stack adaptations (per doc's replaceability principle): Next.js instead of Nuxt, Prisma/SQLite instead of Postgres, simulated engine driver instead of live Blender (bridge interface preserved), in-app job simulation instead of Redis/Celery

---
Task ID: 2
Agent: Super Z (main agent)
Task: Push MVP to GitHub (Omerhrr/AnimeOS) + next iteration (Comic Mode)

Work Log:
- Audited repo before push: no secrets in tree (token scan clean), untracked runtime artifacts (.env, db/custom.db, .zscripts/dev.pid), fixed mangled .gitignore append, added .env.example + db/.gitkeep with ignore negations
- Set repo-local identity to Omerhrr, added origin remote, pushed MVP commit e52394e to main, verified via ls-remote
- Iteration: Comic Mode - native manhua/manhwa/manga storyboard support
  - src/lib/comic/layout.ts: deterministic panel layout engine (shot-type weights → greedy page packing → rotating 6-col grid templates, splash pages for establishing shots, webtoon strip heights)
  - src/components/views/comic-panel-art.tsx: procedural SVG panel sketches per shot type (ridges/ECU eye/silhouettes/speed lines/rain hatching/pagoda), format-adaptive palettes, manga screentone pattern
  - src/components/views/comic-view.tsx: format selector (Manhua LTR / Manhwa webtoon vertical / Manga RTL), episode picker, stats (panels/pages/splash/read time), Print-PDF button, scene chapter cards
  - Wired StudioView "comic" + nav + print stylesheet in globals.css
  - README.md with architecture, feature map, screenshots (docs/screenshots/), run instructions
- Verified: tsc/eslint clean on new files; agent-browser check of all three formats rendering with correct reading direction + art; no console errors
- Pushed 8c11c45 (Comic Mode) and ccaa18a (README screenshots) to GitHub main

Stage Summary:
- GitHub: https://github.com/Omerhrr/AnimeOS main @ ccaa18a (3 commits)
- Platform now natively covers animation (donghua/anime pipeline) AND comics (manhua/manhwa/manga Comic Mode)
- Next horizons: image-generation-backed panel art, speech-bubble/dialogue authoring, live Blender bridge, batch rendering

---
Task ID: 3
Agent: Super Z (main agent)
Task: Iteration 3 - AI panel art generation + speech-bubble dialogue authoring (user: "proceed with both")

Work Log:
- Loaded fullstack-dev + image-generation skills; extended prisma Shot model (artworkUrl, dialogue JSON), db push + client regen, dev server restart
- Built POST /api/panel-art: z-ai SDK image generation, prompts from shot-type framing + scene environment/weather/lighting + style preset + characters' episode-resolved states (appearance/clothing/weapon/cultivation); saves public/panels/{shotId}.png, artworkUrl with cache-busting version
- PATCH /api/shots: dialogue validation (array, ≤8 lines, text required), artworkUrl set/clear
- Comic Mode UI: per-panel toolbar (generate art, edit dialogue, AI badge), batch "Generate art" with concurrency-2 pool + live counts, AI art layer with procedural sketch fallback, stats "AI art ready n/n"
- Speech bubbles (comic-bubbles.tsx + dialogue.ts): SPEECH (tailed) / THOUGHT (dashed + dots) / SFX (stroked italic), deterministic spot pool mirrored for manga RTL; DialogueEditor dialog with speaker autocomplete from cast + kind select + add/remove lines
- Genericized layout engine (PanelPlacement<T>/ComicPage<T>) so panels carry full ShotRow
- Verified E2E via agent-browser: single + batch generation → 6/6 panels AI-illustrated; dialogue saved via editor and bubble renders over art in manhua/manga(RTL)/webtoon; fixed a React border/borderStyle dev warning; console clean; tsc+eslint clean on changed files

Stage Summary:
- GitHub main @ 6aa1a62 (7 commits total); Comic Mode now produces AI-illustrated, dialogue-authored comic pages in all 3 formats
- Remaining horizons: Blender bridge, per-character model sheets for casting consistency, DSH tool access to art/dialogue, batch rendering

---
Task ID: 4
Agent: Super Z (main agent)
Task: Iteration 4 - per-character model sheets + DSH dialogue/art authoring tools + live Blender render bridge (user: "proceed with this")

Work Log:
- Schema: Character.modelSheetUrl/modelSheetPrompt (canonical visual anchor), RenderJob.driver; db push + client regen + dev server restart
- src/lib/ai/art.ts: shared art service - extracted panel-art from the route, added generateCharacterModelSheet (turnaround sheet prompt from appearance JSON + latest dev state + per-style tokens) storing the anchor prompt; generateShotPanelArt now re-injects each detected character's anchor ("match established character design") for cross-panel consistency; retry wrapper on SDK calls
- API: /api/panel-art thin wrapper; new POST /api/character-sheet; new GET /api/bridge (live driver status + env hint)
- Live Blender bridge: src/lib/bridge/blender.ts (status probe of ANIMEOS_BLENDER_HOST or auto-spawned local `blender -b -P animeos_bridge.py`, submit + progress polling, graceful offline); bridges/blender/animeos_bridge.py - self-contained bpy add-on (ThreadingHTTPServer on 127.0.0.1:8100, /status /progress /render /ping; maps AnimeOS scene params to bpy fog/world/sun/area lights, camera framing per shot type/lens, timer-chunked render so HTTP stays live, returns base64 frame); py_compile clean
- Render pipeline: createRenderJob submits to live Blender when reachable (driver=BLENDER) else simulator; tickRenderJob polls bridge progress/stage, pulls finished PNG into public/renders/, mid-job bridge loss degrades to simulator cleanly; verified fallback (SIM badge, job progressed, DSH inspection unchanged)
- DSH: 18 tools now - set_shot_dialogue (validated lines, replace/clear), generate_panel_art (format-aware), generate_model_sheet (anchor store); context enrichment (dialogueLines/art per shot, modelSheet per character); doctrine rewritten (director directs art/dialogue via tools, model-sheet-before-panel-art rule); maxDuration 300 on /api/dsh
- UI: Characters view (model-sheet thumbnails, ANCHOR badge, per-card ✦ generate, detail sheet image + canonical anchor display); Render view (Engine driver card LIVE BLENDER/SIMULATOR with attach instructions, per-job BLENDER/SIM badge); api-client typed additions
- Fixed two real bubble bugs found in browser E2E: (1) caption overpainting bubbles in small panels → top-heavy spot pool + z-20 bubbles + line-clamped captions; (2) manga RTL double-mirroring pushed bubbles off-panel → removed mirrorSpot (the left→right style switch already mirrors)
- Verified E2E: real Lin Yue model sheet generated (30s, donghua turnaround, anchor stored + served), live DSH turn autonomously called set_shot_dialogue + generate_panel_art (75s, thought bubble "This ends today." renders over anchor-consistent art in manhua + manga RTL), bridge card + fallback verified, console clean, tsc/eslint clean on changed files (tools.ts errors pre-exist on HEAD, confirmed via stash)

Stage Summary:
- Casting consistency mechanism shipped: model sheet → stored anchor → injected into every panel prompt
- DSH is now a full art/dialogue director (18 tools); Blender bridge is live-attachable with transparent simulator fallback
- GitHub main pushed with this iteration; next horizons: batch rendering, style LoRA per production, webtoon slice export

---
Task ID: 5
Agent: Super Z (main agent)
Task: Iteration 5 - batch rendering across episodes + webtoon slice export + per-production art style tuning (user: "proceed with batch rendering across episodes, webtoon slice export, and per-production style tuning for the art prompts")

Work Log:
- Schema: Project.artStylePrompt/artPalettePrompt/artNegativePrompt (nullable free-text style directives); db push + client regen + clean dev-server restart (found stale orphan `next dev` child holding :3000 after parent kill - killed tree, restarted, EADDRINUSE resolved)
- src/lib/ai/art.ts: productionStyleTokens()/productionNegativeTokens() compile the DB fields (custom directive overrides visualStyle preset tokens, palette appended, negatives appended to base tail); injected into BOTH panel-art and model-sheet prompts so the whole cast stays in one visual language
- API: PATCH /api/projects/[id] accepts the three fields (trim, 600-char cap, empty→null) + production event; POST /api/episodes hardened (400/400/404 guards - my own malformed test curl exposed a raw FK-violation 500)
- Style Direction dialog (style-direction-dialog.tsx) in Comic Mode toolbar: 3 fields + live "compiled into every prompt" preview (client mirror of the server compile), CUSTOM badge on the button, reset-fields, save → PATCH + query invalidate
- DSH: tool #19 set_art_style (styleDirective/paletteTokens/negativePrompt, empty string resets) + artStyleTuning block in get_production_context + doctrine rule 9 (style direction via tool, not restated per message); fixed the pre-existing `let x = null` inference errors in tools.ts (create_scene/create_shot/render_shot/check_capabilities) and stageFor in types.ts, plus dsh-console setProject destructure + studio-shell NAV icon type - src/ now fully tsc-clean
- Batch rendering: POST /api/render-jobs action "batch" { episodeIds[], mode } → one render job per non-FINAL shot across episodes, DRAFT episodes bumped IN_PRODUCTION, production event with counts; GET inspections capped at 2/tick (a 9-job batch completing at once must not turn one poll into 9 sequential LLM calls - remainder picked up on subsequent 2s polls)
- Render Queue UI: BatchRenderCard (episode chips with shot/FINAL counts, All-episodes toggle, PREVIEW/FINAL segmented mode, live result line) + aggregate stats row (active/in review/approved) + status filter (All/Rendering/Needs review/Approved)
- Webtoon slice export: src/lib/comic/export-slices.ts - client-side canvas compositor at 800px (panel art cover-cropped from AI artwork or live-DOM-serialized procedural SVG, border, shot chip, speech bubbles w/ tails mirrored from the DOM spot pool, SFX outline text, narration caption), boundary-aware packing into ≤1280px slices, jszip packaging with manifest.json (slice→panel mapping), auto-download; data-shot-id anchors added to panel figures; Export slices button (enabled only in MANHWA, progress states in-button)
- Verified E2E: style dialog save persisted (detail API returns all 3 fields); slice ZIP = EP07_slice_01.png 800×1280 + EP07_slice_02.png 800×606 + manifest, slice visually confirmed (AI art, bubbles w/ speaker labels + tails, captions, chips); batch "9 renders queued across 2 episodes" (E07+E08) → 21 jobs spanning both episodes, evaluations flowing under the cap; live DSH turn autonomously called set_art_style (moonlit silver-blue palette + "no warm gold" negatives written correctly); console clean, eslint clean, src tsc-clean
- README: feature map (19 tools, batch, style direction, slice export), new screenshot rows (batch-render.png, webtoon-slice-1.png), Try-the-loop steps 5-6, status paragraph

Stage Summary:
- GitHub main pushed with this iteration (5 commits + this one)
- Studio now: batch-renders whole episodes with throttled DSH inspection; exports webtoon platform slices (800px, boundary-aware, manifest) from the live strip; art prompts are per-production tunable from UI and by DSH itself
- Next horizons: per-shot style LoRA fine-tuning, multi-artist shot assignment, sound/SFX timing for motion panels

---
Task ID: 6
Agent: Super Z (main agent)
Task: Push Iteration 6 to GitHub + verify the three new features live (user: "you havent push the last work to github, push and proceed")

Work Log:
- Found the full Iteration 6 implementation sitting unpushed as a local commit with a UUID message (24 files, +2189 lines: loras/audio-cues/artists API routes, lora-studio/sound-timeline/artists/panel-inspector dialogs, comic/audio.ts Web Audio engine, schema StyleLora/Artist/AudioCue + Shot.loraId/loraStrength/artistId)
- Pre-push verification: bunx tsc --noEmit clean on src/ (only pre-existing examples/ + skills/ scaffold errors remain); eslint clean on all new/changed files
- Amended commit message to "Iteration 6: per-shot style LoRA fine-tuning, sound/SFX timing for motion panels, multi-artist shot assignment" and pushed cb10f83..5ee5e82 to origin/main
- Browser E2E verification of all three features:
  * LoRA studio: "Style LoRA registry" dialog lists 4 seeded adapters; registered new adapter "celestial-gold-v2" (name/base model/trigger tokens/strength slider) → badge LoRA 4→5, appears in registry + panel inspector
  * Sound timeline: shot 001 dialog with 3 seeded cues; "Auto-score from shot" derived 2 more (Storm rain bed AMBIENCE, Camera crane air swish SFX) + VOICE cue auto-created from dialogue; edited cue duration 5200 → server clamped to 4.2s timeline, persisted (verified in DB); preview button present (Web Audio synth)
  * Multi-artist: roster dialog lists 4 seeded artists; added "Han Zhao - Action sequences & FX"; panel inspector assigns artist + LoRA + weight per shot; saved shot 001 → Han Zhao + celestial-gold-v2 @ 0.85 (verified in DB via shot.artist/lora relations); toolbar artist filter chip "Han Zhao 1" updated live; bulk-assign chips present
- Console/error check clean throughout; removed temp verification screenshots

Stage Summary:
- GitHub main @ 5ee5e82 (6 commits total); Iteration 6 fully pushed and verified end-to-end
- Per-shot style LoRA binding (trigger tokens injected into panel-art prompts), motion-panel sound design with auto-scoring + Web Audio preview, multi-artist roster with per-shot ownership are all live
- Suggested next horizons: audio stems in webtoon slice export (manifest), DSH tools for artist/LoRA assignment, artist workload balance view

---
Task ID: 7
Agent: Super Z (main agent)
Task: Iteration 7 - DSH autonomous artist/LoRA staffing + audio stems in webtoon slice exports + artist workload-balance view (user: "proceed with DSH tools to autonomously assign artists/LoRas, audio stems embedded in webtoon slice exports, and an artist workload-balance view")

Work Log:
- DSH: new tool #21 auto_assign_scene_team - staffs an entire scene in one call: artist routing scores specialism (background/environment roles → ESTABLISHING/WIDE, character roles → CLOSEUP/ECU, FX roles → movement/energy-keyword shots) against a load penalty (0.5 × production-wide count) so work spreads; LoRA routing tokenizes name+trigger+notes (≥4 chars) and attaches the best content match (shot description + movement + lighting + scene environment) at the adapter's default weight; scope artists|lora|both, overwrite flag, guards for empty roster/registry, single production event per call; doctrine rule 11 rewritten (one-call scene staffing first, surgical set_shot_artist/set_shot_lora only for overrides) + intro updated
- Audio stems: src/lib/comic/stems.ts - OfflineAudioContext renderer (44.1kHz mono) with the live engine's synthesis DNA (bandpass-noise SFX, detuned-triangle BGM, wobbling-filter ambience; VOICE → syllabic-wobble formant blip since speechSynthesis can't render offline), 16-bit PCM WAV encoder; audio.ts exports labelHash/noiseBuffer (BaseAudioContext) so both engines share primitives; export-slices.ts re-times each slice's cues onto one stem timeline (panels back-to-back in reading order, per-cue offset by preceding panel durations, volume carried through), renders one WAV per scored slice (EPxx_slice_NN.wav) into the ZIP, manifest.audio gains stemFormat + per-stem {file, slice, durationMs, cueCount, cues[]} with panel mapping; SliceShot now carries duration, SliceAudioCue carries volume
- Workload view: src/components/views/artist-workload-dialog.tsx - toolbar button next to Artists; per-artist rows (episode panels vs production-wide total, colored bar, art/lora/in-flight/done mini-stats), production-wide balance badge (BALANCED ≤0.12 / UNEVEN ≤0.3 / SKEWED spread vs ideal per-artist share), unassigned pool row, "Distribute pool" one-click round-robin (least-production-load-first) using the existing bulk PATCH; ArtistsDialog blurb now points at the workload view + auto tool
- Fixed a self-inflicted file corruption in artist-workload-dialog.tsx (Write tool left a truncated/mangled line that surfaced as a client-side exception in Comic Mode) - rewrote the file cleanly and re-verified
- Verified E2E: live DSH turn "re-staff Scene 12..." → called auto_assign_scene_team {sceneNumber:12, scope:both, overwrite:true} → 6 shots re-routed (Jiang Wu 0→3, all roster members loaded), 4 LoRAs content-matched (azure-flame-fx, spirit-beast-form), DB verified; workload dialog on E08 showed 1/3 assigned UNEVEN → Distribute pool → "2 pool panels distributed across 2 artists ✓" → 3/3; webtoon export with capture-patched createObjectURL → ZIP holds EP07_slice_01/02.png + EP07_slice_01/02.wav (RIFF/WAVE magic), manifest audio: 17 cues (4 AMB/9 SFX/2 BGM/2 VOICE), stemFormat "WAV 16-bit PCM mono 44.1kHz", slice_01 stem 16000ms/12 cues with panel-relative re-timing; tsc src-clean, eslint clean
- README: 23-tool count, Multi-artist studio row, slice-export stem wording, status paragraph

Stage Summary:
- GitHub main pushed with this iteration (7 commits + this one)
- DSH now staffs scenes autonomously (specialism + load-balanced artists, content-matched LoRAs); exported webtoon slices carry real playable audio stems + authoring-tool manifests; creators get a live workload-balance board with one-click pool distribution
- Next horizons: real TTS/voice renders for VOICE stems, LoRA training-run simulation (dataset from approved panels), per-artist style preset affinity

---
Task ID: 8
Agent: Super Z (main agent)
Task: Iteration 8 - real TTS voice renders for stems, simulated LoRA training runs from approved panels, per-artist style affinity, and a repo-wide em dash purge (user: "proceed with: real TTS voice renders for stems, simulated LoRA training runs from approved panels, and per-artist style affinity, also, remove all em dashes, from everywhere, em dashes should not be generated at all")

Work Log:
- Schema: AudioCue gains voiceUrl/voiceActor/voiceSpeed/voiceDurationMs; StyleLora gains status/trainProgress/trainedPanels/trainedAt; new LoraTrainRun model (progress, step, totalSteps, panelCount, lossCurve, runLog); db push + client regen + dev server restart (bun run dev.sh failed via `bun`, must invoke with `bash`)
- Real TTS voice renders: POST /api/voice-renders calls z-ai SDK tts (7 voices, speed 0.5..2, 1024-char guard, "Speaker: line" prefix stripped), writes public/voices/{cueId}.wav, parses the WAV header for the true duration (first attempt read byteRate at the wrong chunk offset and returned 0; fixed to off+8+8), widens the cue slot up to the shot timeline limit; deterministic auto-cast maps a speaker hash to a default voice
- Stem integration: stems.ts gains decodeVoiceClips + a realVoice mixer (24kHz take resamples into the 44.1kHz render, gain-faded so a take never bleeds into the next panel), blip fallback retained; export-slices.ts re-times cues with voiceUrl, mixes decoded takes into each slice stem, manifest audio gains voiceTakes {rendered, takes[]}; comic-view mapping now carries the voice fields; live CuePlayer prefers the rendered take (HTMLAudioElement) over speechSynthesis
- Sound timeline UI: "Real voice render" block on VOICE cues (voice actor select, speed slider, render/re-render, take status line), "Render voices (n/m)" batch button with a 2-worker pool + auto-cast, cue blocks show a cyan dot when a take exists
- Simulated LoRA training: src/lib/ai/lora-train.ts - dataset = production's approved panels with generated art (bound-to-adapter count reported), totalSteps = clamp(600 + panels*50, 600, 2400), tick-on-poll (GET /api/lora-train advances RUNNING runs like the render queue), deterministic decaying loss curve + seeded jitter sampled at 48 points, six milestone log lines, completion sets the adapter READY with trainedPanels/trainedAt and emits production events; 409 guard against concurrent runs on one adapter
- LoRA studio UI: Train button per adapter (dataset-size tooltip, disabled while running), TRAINING badge, live step/progress bar, final-loss readout, loss-curve sparkline (SVG polyline), run-completed readout, TRAINED · N PANELS badge after completion
- Per-artist style affinity: artist-workload-dialog computes production-wide per-artist LoRA pairings (usage share boosted by the pairing's approval rate, normalized to the artist's strongest = 100), rendered as a "Style affinity" section under the balance bars with per-pairing bars, shot counts and average strengths
- Em dash purge: scripts/de-emdash.mjs replaced 287 dash chars (em/en/multichar) across 44 tracked files (src, prisma, scripts, bridges, README, worklog); scripts/de-emdash-db.ts cleaned 84 persisted DB values via raw REPLACE updates over a table/column whitelist; DSH system prompt rule 15 + evaluator rules now forbid em/en dashes in all generated text; verified zero dash chars remain (the only post-sweep match was the sweep script's own comment, fixed)
- Verified E2E: TTS take rendered via UI on shot 001 (jam 2.7s + douji 8.9s takes, DB voiceUrl/voiceDurationMs verified, slot clamped to timeline), batch "Render voices" on an E08 panel auto-cast douji for Lin Yue (1/1), LoRA train run 650 steps completed in UI (TRAINING badge + step ticker + milestones -> TRAINED · 1 PANELS, loss 0.042, events in DB), webtoon slice export re-run -> manifest voiceTakes rendered: 2 with actors/durations, stem RMS at the voice cue window 4x the ambience bed confirming real speech is mixed in, workload dialog shows affinity rows (Jiang Wu azure-flame-fx top 55, Su Qing 100, Dao Zhang spirit-beast-form 55); console clean; tsc src-clean; eslint clean
- README: Comic Mode + Multi-artist studio feature rows, Try-the-loop steps 6-7, status paragraph

Stage Summary:
- GitHub main pushed with this iteration (8 commits + this one)
- VOICE stems now carry real speech (rendered takes mixed into slice exports and the live preview), style adapters are trainable from approved panels with a full simulated run readout, and the roster board ranks which artist clicks with which style
- The repo (source, docs, worklog, database, DSH prompts) is em-dash-free and the prompts now enforce it for all future generated text

---
Task ID: 9
Agent: Super Z (main agent)
Task: Iteration 9 - voice takes per character state, batch-train all adapters, affinity-driven pool distribution (user: "proceed with voice takes per character state (excited/injured delivery), batch-train all adapters, and affinity-driven pool distribution where 'Distribute pool' prefers the highest-affinity artist per panel")

Work Log:
- Schema: AudioCue gains voiceState (delivery profile: NEUTRAL | EXCITED | INJURED) + voiceStateLabel (the character state the delivery resolved from); db push + client regen + dev restart
- Shared delivery module src/lib/comic/delivery.ts (client + server import the same catalog): three delivery profiles (Excited 1.18x quickened/bright, Injured 0.82x strained/trailing, Neutral), keyword classifier over state labels (battle-damaged/injured/blooded -> INJURED; breakthrough/triumphant/furious -> EXCITED), and light punctuation shaping (excited lands on "!", injured trails on "...", lines with terminal punctuation untouched)
- Voice takes per character state: POST /api/voice-renders accepts delivery AUTO | explicit profile; AUTO resolution loads the speaker's CharacterState rows effective at the shot's episode (same-episode TEMPORARY beats win over the latest PERMANENT progression), classifies the label, falls back to Character.canonicalState, else NEUTRAL; effective TTS speed = base speed x delivery multiplier, cue keeps the BASE speed (first implementation stored the multiplied speed, which compounded on every re-render, 1.18 -> 0.97 -> 0.79; fixed by storing base + deriving effective speed from voiceState, verified stable across two identical renders)
- Sound timeline UI: "Delivery (character state)" select (auto from character state / Neutral / Excited / Injured), resolved-delivery readout "delivery: injured (from "Battle-damaged (temple fight)") . speed x0.82 . last take", take line shows effective speed + state chip, batch "Render voices" now AUTO-renders per speaker state and reports non-neutral counts; offline voice blips in stems.ts follow the delivery pace too
- Batch-train all adapters: POST /api/lora-train {projectId, batch: true} starts simulated runs for every idle adapter (skips ones already TRAINING/RUNNING with reasons, 409 when nothing can start, take raised to 60 runs); LoRA studio gains a "Train all" button with dataset tooltip + batch result line ("Batch training: 5 runs started")
- Affinity-driven pool distribution: workload dialog builds the raw (non-normalized) artist x LoRA affinity matrix; "Distribute pool (affinity-first)" routes each LoRA-bound panel to the artist with the highest raw delivery score on that adapter (ties broken by lower production-wide load), unbound panels rotate across the least-loaded roster, result message splits the routing ("3 pool panels distributed across 3 artists (2 affinity-first, 1 load-balanced)")
- Manifest/stems plumbing: SliceAudioCue carries voiceState/voiceStateLabel, exported manifest voiceTakes gains delivery + stateLabel per take, stem cues carry the delivery for the offline blip
- Verified E2E: AUTO take on shot 001 resolved INJURED from Lin Yue's "Battle-damaged (temple fight)" (TEMPORARY @ ep7) at speed x0.82 (DB voiceState/voiceStateLabel verified), manual EXCITED override renders at x1.18; batch-train started 5 runs, all completed with TRAINED badges in the UI; pool test (unassigned ep7 shots 1/4/6) routed azure-flame-fx -> Su Qing and spirit-beast-form -> Dao Zhang affinity-first and the unbound shot load-balanced, DB confirmed; webtoon slice export ZIP re-verified: manifest voiceTakes carry delivery INJURED + stateLabel and NEUTRAL for the speakerless seeded cue, both stems RIFF-valid; console clean; tsc src-clean; eslint clean; zero em dashes repo-wide

Stage Summary:
- GitHub main pushed with this iteration (9 commits + this one)
- Voice takes are now performed, not just spoken: the speaker's episode-resolved character state drives delivery, speed and punctuation shaping through the live preview, the exported stems and the authoring manifest
- The whole adapter registry trains in one click and the pool distributor routes by demonstrated style affinity first, load second

---
Task ID: 10
Agent: Super Z (main agent)
Task: Iteration 10 - DSH state-aware voice direction tool (direct_voice_takes) + per-artist voice casting (cast_voice_actor + casting board) (user: "proceed with DSH tool for state-aware voice direction, and per-artist voice casting")

Work Log:
- Schema: Artist gains voiceId (the TTS voice the artist performs with); Character gains voiceArtistId (+ SetNull relation, deleting an artist clears their voice castings); AudioCue gains voiceDelivery (standing direction: null = state-aware auto per render, else a pinned NEUTRAL/EXCITED/INJURED), voiceNote (directorial note) and voiceCast (cast artist that performed the last take); db push + client regen + dev restart (first restart died because the detached server lost its parent; re-spawned via setsid bun run dev)
- Shared modules: src/lib/comic/voice-catalog.ts (client + server import the same 7-voice catalog, isVoiceId, voiceById, defaultVoiceFor so UI and API never drift); src/lib/ai/voice-casting.ts (resolveAutoDelivery moved here from the render route so the DSH tool resolves delivery identically, plus resolveVoiceCast: explicit voice > the character's cast artist voiceId > deterministic hash)
- Render API (/api/voice-renders): voice resolution is now cast-first (request override > Character.voiceArtist.voiceId > hash, artist name returned as cast source "cast"); delivery priority is request override > the cue's standing direction (source "direction") > episode-resolved character state; a pinned direction no longer attributes the old state label; takes persist voiceCast alongside voiceActor; response adds cast + direction blocks
- API plumbing: GET /api/audio-cues enriches VOICE cues with the resolved standing cast (artistName + voiceId) so the editor shows who performs the line before any take exists; PATCH /api/audio-cues/[id] accepts voiceDelivery (AUTO/null clears the pin) and voiceNote; PATCH /api/characters accepts voiceArtistId (validated against the roster, production event on cast/clear); PATCH /api/artists/[id] accepts voiceId (validated against the catalog); GET /api/projects/[id] includes characters.voiceArtist
- DSH: tool #24 direct_voice_takes - sets standing delivery + optional directorial note on every VOICE cue of a scene (or one shot); AUTO re-resolves each speaker's episode-effective state at call time for the summary (shot 001 Lin Yue -> injured from "Battle-damaged (temple fight)") but leaves the cue unpinned so future re-renders keep re-reading the state, explicit profiles pin every directed cue; tool #25 cast_voice_actor - binds a character to a roster artist (empty name clears), optionally (re)assigns the artist's TTS voice, auto-assigns a deterministic voice when the artist has none, roster/cast guards with helpful lists; doctrine rule 16 (direct a scene after scoring VOICE cues, cast principals once, re-render after changes) + intro updated; buildCompactContext now exposes artists.voice and characters.voiceActor so DSH sees the casting board
- Sound timeline UI: voice select defaults to last take > cast artist voice > hash; header line shows the cast ("cast: Su Qing · douji") before a take and "take: douji · cast Su Qing · 6.2s · x1.18 · excited" after; the delivery select is now a standing direction (changing it pins the cue, AUTO unpins) plus a Direction note field persisted on the cue; batch "Render voices" passes no explicit voice so the server casts from the roster and reports "N from cast artists"; batch render merges server rows so the resolved cast is preserved
- Artists dialog: roster rows gain a per-artist voice select (voice rides takes, stems, manifest); new "Voice casting" board binds each character to the roster artist who speaks for them (cast counter, "uncast · default voice" escape, DSH cross-reference note)
- Manifest/stems plumbing: SliceAudioCue carries voiceDelivery/voiceNote/voiceCast; exported manifest voiceTakes gains cast/direction/note per take and cuesByShot entries carry all three
- README: 25-tool count, DSH Director row gains voice direction + casting, Comic Mode row reworded for per-artist casting + standing direction, Multi-artist row gains voice casting, try-the-loop step 7 (Artists voice casting + DSH cross-reference)
- Verified E2E: Artists board set Su Qing -> douji and cast her as Lin Yue's voice (DB: Lin Yue -> Su Qing (douji), Su Qing.voiceId douji); sound timeline showed the cast line, pinned EXCITED standing direction + note "clenched teeth, wind-blasted" (DB verified), then POST /api/voice-renders with no voice/delivery returned delivery source "direction" EXCITED @x1.18 and cast Su Qing/douji, take persisted voiceActor douji + voiceCast Su Qing; live DSH turn ran both tools in one request (direct_voice_takes on Scene 12: 1 neutral + 1 injured from character state with note "wind-torn, strained"; cast_voice_actor: Demon Lord Wei -> Han Zhao with voice luodo, DB + production events verified); webtoon slice exports re-run on E07 + E08, manifest voiceTakes carry voiceCast "Su Qing" + delivery EXCITED + direction/note, uncast take stays voiceCast null, stems RIFF-valid; console clean; tsc src-clean; eslint clean; zero em/en dashes repo-wide

Stage Summary:
- GitHub main pushed with this iteration (10 commits + this one)
- Voice takes are now directed and cast: DSH sets standing deliveries per character state scene-wide, and every character can be bound to a roster artist whose TTS voice performs their lines across the live preview, batch renders and exported stems/manifest
- Next horizons: per-episode voice direction diffs (state changes over time re-render only affected takes), dialogue-line-level delivery (multi-state lines inside one shot), voice audition preview inside the casting board

---
Task ID: 11
Agent: Super Z (main agent)
Task: Iteration 11 - per-episode direction diffs with selective re-render, line-level delivery inside a single shot, audition preview in the casting board (user: "proceed with per-episode direction diffs that re-render only affected takes, line-level delivery inside a single shot, and an audition preview in the casting board")

Work Log:
- Schema: AudioCue gains voiceSig (JSON take-input snapshot stamped at render time: hashed speakable text + TTS voice id + delivery profile + base speed); db push + client regen (first re-render attempt failed with "Unknown argument voiceSig" because the running dev server still held the pre-schema Prisma client; restarted the server and the same POST then succeeded - all later verification ran on the fresh client)
- src/lib/comic/dialogue.ts: DialogueLine gains delivery (NEUTRAL/EXCITED/INJURED or null = state-aware auto); parse/serialize round-trip it; new dialogueDeliveryForCue matches a VOICE cue's "Speaker: text" label back to its dialogue line and returns that line's explicit delivery
- src/lib/ai/voice-plan.ts (new, shared by render + diff): splitCueLabel, hashText (FNV-1a base36), buildTakeSig/parseTakeSig/sigChanges, resolveTakePlan - one resolver for WHO speaks (cast: request > Character.voiceArtist > hash) and HOW the line is played (delivery chain: request override > dialogue-line delivery > cue standing direction > episode-resolved character state, "line" is a new source), plus effective speed and the signature; ResolvedDelivery.source widened to include "line"
- src/lib/ai/voice-render.ts (new): renderVoiceTake extracted from the route (cue load, plan, ZAI TTS, public/voices/{cueId}.wav, cue update incl. voiceSig stamp), VoiceRenderError with status codes, wavDurationMs exported for reuse; /api/voice-renders POST is now a thin wrapper (GET voices list unchanged); response direction block adds lineDelivery
- /api/voice-diffs (new): GET ?episodeId|projectId re-resolves every VOICE cue's would-be plan and diffs against the stored snapshot -> fresh / stale (changed: line text, voice / casting, delivery direction, base speed, or "predates direction snapshots") / unrendered / blocked, with per-cue now-vs-taken readouts; POST {episodeId} re-renders ONLY the stale takes (concurrency 2, unrendered cues left to the sound timeline batch), tally + ProductionEvent recorded
- /api/voice-auditions (new): throwaway casting-board audition - validates the voice id, picks the text (explicit board line > the character's own first dialogue line anywhere in the production, via parseDialogue over the project's shots > classic sample by voice hash), renders TTS in the chosen register and returns base64 WAV + metadata; zero DB writes, zero files
- api-client: AudioCueRow.voiceSig, VoiceDiffRow/VoiceDiffEpisode/AuditionResult types, voiceDiff/reRenderStaleVoices/auditionVoice methods
- Dialogue editor (comic-bubbles.tsx): every dialogue line gains a Delivery select (Auto · state-aware / the three profiles); parseSafe preserves it; description mentions per-line direction
- VoiceDiffDialog (new component) wired into the Comic Mode toolbar next to Workload: episode-scoped board with count chips (total/fresh/stale/no take), per-cue rows (shot number, status chip, speaker, text, "moved:" reasons + was-snapshot, "now:" chain readout incl. source and cast artist), "Re-render affected (N)" disabled at 0 stale, result line; button shows an amber stale badge for the selected episode
- Casting board auditions (artists-dialog.tsx): board-level register select (default Excited) + optional audition line input; play button on every roster row (artist's voice or their hash default) and on every character casting row (cast artist's voice, empty board line auditions the character's OWN first line via the speaker lookup); one shared HTMLAudioElement with stop button + playing/busy states; readout like "audition: douji · excited · custom · 2.8s · not saved as a take"; clip stopped on dialog close
- Sound timeline: VOICE cue editor shows a "line direction: X · authored on this dialogue line, it outranks the standing direction" readout when the matching line carries a delivery
- README: Comic Mode row (line-level delivery precedence + direction diff board), Multi-artist row (auditions before casting), try-the-loop steps 6-8 rewritten (line delivery, audition flow, diff re-render), status paragraph
- Verified E2E (API): first diff marked all 3 existing takes stale ("predates direction snapshots"); PATCH shot 001's dialogue with delivery EXCITED flipped only that cue's resolution to EXCITED source "line"; POST re-rendered exactly the 2 stale E7 takes (DB: voiceSig stamped, shot 001 voiceState EXCITED); flipping the line to INJURED re-flagged only shot 001 ("delivery direction"), re-render touched 1 of 2 takes (shot 003 stayed fresh), DB voiceState INJURED, effective x0.82, production event "Direction diff re-rendered 1 of 1 stale take(s)... (1 delivery direction)"; project-wide diff shows E7 2 fresh / 0 stale while untouched E8 remains 1 stale (selectivity proven); audition API returned a 430KB RIFF WAV for douji reading Lin Yue's own line INJURED (source "character line") with take count unchanged before/after, custom-line and 400-on-bad-voice paths checked
- Verified E2E (agent-browser): Direction diff board on E07 renders chips (2 fresh / 0 stale / 0 no take) with "now: injured (line delivery) · x0.82 · douji · cast Su Qing" and disabled re-render; E08 board shows the stale row "moved: predates direction snapshots"; Artists board auditioned douji (sample, 3.0s) then a custom line on Lin Yue's casting row ("custom · 2.8s"), readouts rendered; dialogue editor shows the line's persisted "Injured" delivery; sound timeline VOICE cue shows the line-direction readout; console + page errors clean; screenshots saved (direction diff board, casting auditions, line delivery)
- Ops note: the dev server had to be restarted to pick up the regenerated Prisma client; a plain setsid spawn died between tool calls, the reliable pattern was `(setsid bash -c 'exec bun run dev' >> /tmp/devserver.log 2>&1 &)`

Stage Summary:
- GitHub main pushed with this iteration (11 commits + this one)
- Voice direction is now diffable and line-scoped: every take carries a snapshot of the inputs it was made with, each dialogue line can be directed in its own register inside one shot, and a per-episode board re-renders only the takes whose direction actually moved
- Casting decisions can be heard before they are made: the board auditions any roster voice on a custom line or the character's own dialogue without persisting anything

---
Task ID: 12
Agent: Super Z (main agent)
Task: Iteration 12 - DSH tools for the direction diff (diff_episode_direction) and batch diffing across all episodes (diff_all_episodes), plus a season-wide batch mode in the diff board (user: "proceed with DSH tools for the diff (diff_episode_direction), and batch diffing across all episodes")

Work Log:
- src/lib/ai/voice-diff.ts (new): the direction-diff core extracted from the API route so the route and the DSH brain share one implementation - diffEpisode/diffEpisodeById/diffProjectEpisodes (fresh / stale / unrendered / blocked classification with changed-field labels), resolveStale, renderStaleBatch (2-worker pool), reRenderStaleTakes (single episode, actor-parameterized ProductionEvent), reRenderStaleAcrossProject (every episode of the production, budget-capped, default 16 / max 32 per call, returns per-episode reRendered/failed/staleCount + remaining for follow-up calls)
- /api/voice-diffs refactored onto the shared core: GET unchanged behavior (episodeId = one episode, projectId = batch across all episodes); POST now accepts {projectId, limit?} for the season-wide capped batch re-render alongside the original {episodeId}; single-episode response gains staleCount/remaining
- DSH tools (src/lib/dsh/tools.ts): diff_episode_direction (episodeNumber defaults to latest; reports per-cue stale lines like "shot 001 \"Lin Yue\": moved delivery direction (was neutral x1.00 / douji; now excited / douji)"; reRender:true re-renders only the stale takes; wrong episode number lists available episodes) and diff_all_episodes (per-episode tallies + overall counts; reRender:true batch re-renders across the season capped by limit, reports remaining takes; failures listed per episode); TOOL_DEFS docs written so the LLM knows when to reach for each
- DSH doctrine (prompts.ts): intro line now mentions the diff tools; new rule 17 "Direction hygiene" - after dialogue, standing direction, casting or character-state changes, diff the touched episode (or all episodes for a sweep) and re-render only what moved; never assume takes already reflect a direction change
- api-client: voiceDiffAll(projectId), reRenderStaleVoicesAll(projectId), reRenderStaleVoices gains staleCount/remaining
- VoiceDiffDialog: "This episode" / "All episodes" mode toggle; batch mode shows aggregate chips (episodes, cues, fresh, stale, no take), per-episode cards with EP badge, counts and a "moved: Speaker (field + field)" line for stale episodes, and one "Re-render stale, all episodes (N)" button that batch re-renders (capped server-side) and refreshes to the post-render state; comic-view passes projectId
- Verified E2E (tool layer, Immortal Path): diff_episode_direction Ep7 = 2 fresh; diff_all_episodes = Ep07 2 fresh / Ep08 1 stale ("predates direction snapshots"); USER batch POST via API re-rendered exactly the 1 stale Ep8 take (real TTS, Ep7 untouched), summary "Batch re-rendered 1 of 1 stale take(s) (Ep08 1/1)"; direct_voice_takes pinned EXCITED -> diff_episode_direction Ep8 reRender:true flagged "moved delivery direction (was neutral / douji; now excited / douji)" and re-rendered only that take (1.6s), follow-up diff all fresh; error paths (episodeNumber 99 lists "Episodes: 7, 8"; DSH batch re-render with nothing stale is a clean no-op)
- Verified E2E (agent-browser): dialog opens in episode mode, "All episodes" renders the 2 episode cards with aggregate chips; after pinning NEUTRAL standing the board shows "1 stale" + "moved: Lin Yue (delivery direction)"; clicking the batch re-render ran real TTS, result line "Batch re-rendered 1 of 1 stale take(s) (Ep08 1/1)", cards back to all fresh, button disabled at 0; screenshots saved (diff-batch-ui.png, dsh-diff-trace.png)
- Verified E2E (LLM orchestration): fresh-context probe confirmed the model selects diff_all_episodes with reRender:true unprompted; live console turn "Pin an excited delivery with note ... on every voice cue in scene 1, then diff all episodes and re-render only the takes the diff marks stale" executed direct_voice_takes then diff_all_episodes in one turn (trace 2 tools OK) and re-rendered the 1 stale take via real TTS; two earlier turns had the model break the JSON protocol and answer in prose (empty trace) - pre-existing orchestrator reliability characteristic under long histories, not tool-specific; note: conversation history with prior prose claims can bias the model away from tool calls
- Ops: dev server restart pattern from iteration 11 reused; worklog + code scanned for em dashes (none)

Stage Summary:
- GitHub main pushed with this iteration (12 commits + this one)
- The DSH brain can now reason about voice-take currency: it asks for a diff per episode or across the whole season, sees exactly which takes are stale and why, and re-renders only those takes (single episode or budget-capped season batch), with the same diff available to creators in the board's new "All episodes" mode
- ProductionEvents record both DSH and USER diff re-renders, so the History view shows direction maintenance alongside direction changes
- Next horizons: voice takes per character state variants beyond delivery (whisper/shout registers), diff-aware DSH auto-prompting after casting changes, stem/manifest tagging of stale vs fresh takes in webtoon exports
