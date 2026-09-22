// Unit check: buildSliceManifest currency tagging (pure, no DOM).
import { buildSliceManifest } from "@/lib/comic/export-slices";

const voiceStatus = {
  "cue-fresh": { status: "fresh" as const, changed: [] },
  "cue-stale": { status: "stale" as const, changed: ["delivery direction"] },
  "cue-unrendered": { status: "unrendered" as const, changed: [] },
  "cue-unknown-missing-id": { status: "fresh" as const, changed: [] },
};

const mkCue = (cueId: string | undefined, kind: string, voiceUrl: string | null) => ({
  cueId, kind, label: "Lin Yue: test line", startMs: 0, durationMs: 1000, volume: 0.8,
  voiceUrl, voiceActor: voiceUrl ? "jam" : null, voiceCast: voiceUrl ? "Su Qing" : null,
});

const allCues = [
  { ...mkCue("cue-fresh", "VOICE", "/voices/a.wav"), shotId: "shot-1" },
  { ...mkCue("cue-stale", "VOICE", "/voices/b.wav"), shotId: "shot-1" },
  { ...mkCue("cue-unrendered", "VOICE", null), shotId: "shot-2" },
  { ...mkCue(undefined, "VOICE", "/voices/c.wav"), shotId: "shot-2" }, // no cueId -> unknown
  { ...mkCue("cue-fresh", "SFX", null), shotId: "shot-2" }, // non-VOICE: ignored by currency
];

const blobs = [{
  index: 0, file: "EP08_slice_01.png",
  shotIds: [{ id: "shot-1", number: 1, description: "d", artist: null, styleLora: null, audioCues: [] }],
}];
const stems = [{
  index: 0, file: "EP08_slice_01.wav", durationMs: 4000, cueCount: 4,
  cues: [
    { cueId: "cue-fresh", kind: "VOICE", label: "l1", startMs: 0, durationMs: 1000, volume: 0.8, voiceUrl: "/voices/a.wav", voiceState: "NEUTRAL", panel: 1 },
    { cueId: "cue-stale", kind: "VOICE", label: "l2", startMs: 1500, durationMs: 1000, volume: 0.8, voiceUrl: "/voices/b.wav", voiceState: "EXCITED", panel: 1 },
    { cueId: null, kind: "SFX", label: "sfx", startMs: 3000, durationMs: 500, volume: 0.8, panel: 2 },
  ],
}];

const m = buildSliceManifest({ projectName: "T", episodeNumber: 8, episodeTitle: "TT", allCues, blobs, stems, voiceStatus }) as any;

console.log("audio.direction:", JSON.stringify(m.audio.direction));
console.log("takes:", JSON.stringify(m.audio.voiceTakes.takes.map((t: any) => ({ cueId: t.cueId, status: t.directionStatus, changed: t.changed })), null, 1));
console.log("stem voiceCurrency:", JSON.stringify(m.audio.stems[0].voiceCurrency));
console.log("cuesByShot VOICE:", JSON.stringify(m.audio.cuesByShot["shot-1"], null, 1));

// assertions
const d = m.audio.direction;
if (d.total !== 4 || d.fresh !== 1 || d.stale !== 1 || d.unrendered !== 1 || d.unknown !== 1) throw new Error("direction tally wrong");
if (d.current !== false) throw new Error("current should be false with a stale take");
if (m.audio.stems[0].voiceCurrency.total !== 2 || m.audio.stems[0].voiceCurrency.stale !== 1) throw new Error("stem tally wrong");
const staleTake = m.audio.voiceTakes.takes.find((t: any) => t.cueId === "cue-stale");
if (staleTake.directionStatus !== "stale" || staleTake.changed[0] !== "delivery direction") throw new Error("take tagging wrong");
const unknownTake = m.audio.voiceTakes.takes.find((t: any) => t.cueId === null);
if (unknownTake.directionStatus !== "unknown") throw new Error("unknown tagging wrong");

// no status data at all -> current null
const m2 = buildSliceManifest({ projectName: "T", episodeNumber: 8, episodeTitle: "TT", allCues, blobs, stems }) as any;
if (m2.audio.direction.current !== null || m2.audio.direction.unknown !== 4) throw new Error("untagged fallback wrong");
// all-fresh case -> current true
const m3 = buildSliceManifest({
  projectName: "T", episodeNumber: 8, episodeTitle: "TT", allCues, blobs, stems,
  voiceStatus: { "cue-fresh": { status: "fresh", changed: [] }, "cue-stale": { status: "fresh", changed: [] }, "cue-unrendered": { status: "unrendered", changed: [] } },
}) as any;
if (m3.audio.direction.current !== true) throw new Error("current should be true when nothing stale");

console.log("MANIFEST CHECKS PASSED");
