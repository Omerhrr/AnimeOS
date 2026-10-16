// PROBE 222 - THE SWORD PRIOR'S PAIRED ARMS (the 222 evidence pass's
// named lever, paired, READ-ONLY - no ledger write, no night append).
//
// THE EVIDENCE (the eye's own v4 reading, durable at
// inspect/aiart222/eye-reading-v4.md): the wuxia sword prior is the
// board's dominant residual -
//   S001 (take2, the shipped 90): the sword DRAWN, dark steel - the
//     sheathed-steel clause's SHEATHED demand has NEVER landed (215's
//     glow + sparkles, 218's dark-drawn, 221-v4's take1 glow + take2
//     dark-drawn); the judge read the disobedience GENEROUSLY (weapon
//     0.9: "the sword is accurately represented") - the clause is DEAD
//     LETTER, masked by the judge's own generosity.
//   S004 (take2, the shipped 85): Wei's sheet says weaponType NONE -
//     the draw gave a GLOWING blue blade + aura (the 214 receipt
//     reproduced); the artifact clause's genre-prior hole: "render
//     ONLY the scene's own props" cannot beat the genre's default
//     prop. The judge read that generously too (weapon 0.8).
//   S005 (take1, 85): the draw-beat cell's emission is SCENE-TRUE (the
//     clause correctly yields null on the draw beat - the one cell the
//     prior serves).
//
// THE ARMS (the graduation candidates - the 218 M2 lesson: name the
// TARGET the frame should contain, not the absence):
//   ARM A (S001): the OBJECT-STATE sheath - the frame's contents named
//     positively (a scabbard hangs at the hip, the hilt alone shows;
//     no bare blade anywhere in the frame).
//   ARM B (S004): the WEAPONLESS arm - the empty hands named (no
//     sword exists in this frame).
//   CONTROL: the current law re-ride on each cell (the swing
//     measurement - the paired discipline's own baseline).
//
// The base prompt is the production's own buildKeyframePrompt; the
// ONLY delta is the named arm (A replaces the standing weapon clause's
// text; B appends). Same judge (the REAL instrument: prepareIdentity-
// Context's imageData override -> rawIdentityCall -> parseIdentity-
// Verdict, the damped median riding, featured-cast worst), same sizes,
// the anchors riding the images array (the 215 law), zero production
// writes. THE 222 REBUILD GUARD: the probe is a SHEETED instrument -
// while the sheets are window-bound (the restore receipt's own truth:
// receipts/restore-receipt.json) the probe names the state and exits
// honestly (the graduation waits for its live ride - the 221 fan
// precedent).
//
// Run: npx tsx scripts/probe222-swordprior.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { buildKeyframePrompt } from "../src/lib/ai/keyframe";
import {
  loadIdentityShot,
  prepareIdentityContext,
  rawIdentityCall,
  parseIdentityVerdict,
} from "../src/lib/identity";
import { publicImageAsDataUrl } from "../src/lib/continuity-art";
import ZAI from "z-ai-web-dev-sdk";

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart222");

// THE SIZE LAW (the 216 shape, byte-exact: CLOSEUP 1152x864, else 1344x768)
function sizeFor(shotType: string | null): string {
  return shotType === "CLOSEUP" ? "1152x864" : "1344x768";
}

// THE STANDING WEAPON CLAUSE (the byte the arm replaces - read from the
// built prompt, not duplicated here: the prompt is the law's carrier)
function standingWeaponClauseText(prompt: string, name: string): string | null {
  const marker = `${name}'s WEAPON LAW:`;
  const start = prompt.indexOf(marker);
  if (start === -1) return null;
  // the clause runs to the next ". " clause boundary that starts an
  // uppercased law word or the prompt's end - the conservative cut:
  // to the sentence end after "draws it." (the standing template's own tail)
  const tail = prompt.indexOf("the blade only sings out in a shot whose own language draws it.", start);
  if (tail === -1) return null;
  return prompt.slice(start, tail + "the blade only sings out in a shot whose own language draws it.".length);
}

// THE ARMS (the graduation candidates)
const ARM_A_SHEATH_OBJECT_STATE =
  "{name}'s WEAPON LAW (object state, binding): at {name}'s hip hangs the sword in its SCABBARD - only the hilt shows above the belt. NO bare blade appears anywhere in this frame; the sword is never drawn, never held in hand, never glowing - the blade only sings out in a shot whose own language draws it.";
const ARM_B_WEAPONLESS =
  "{name} carries NO weapon (binding): the hands are EMPTY at the sides - NO sword, NO blade, NO glowing weapon exists anywhere in this frame; the scene's steel belongs to no one.";

interface RideReceipt {
  cell: string;
  arm: "control" | "sheath-object-state" | "weaponless";
  promptPath?: string;
  pngPath?: string;
  error?: string;
  featuredWorst?: number;
  entries?: Array<Record<string, unknown>>;
}

async function judge(
  shotId: string,
  dataUrl: string,
  castNames: string[],
  featured: string[],
): Promise<{ worst: number; entries: Array<Record<string, unknown>> } | null> {
  const loaded = await loadIdentityShot(shotId);
  if (!loaded) return null;
  const ctx = await prepareIdentityContext(loaded, { imageData: dataUrl, error: "" });
  if (!ctx.ok) { console.log(`  ctx FAILED - ${ctx.error}`); return null; }
  const call = await rawIdentityCall(ctx, undefined);
  if (!call.ok) { console.log(`  judge FAILED - ${call.error.slice(0, 120)}`); return null; }
  const verdict = parseIdentityVerdict(call.raw, castNames);
  if (!verdict) { console.log("  verdict UNPARSABLE"); return null; }
  const featuredEntries = verdict.entries.filter((e) => featured.includes(e.characterName));
  const worst = Math.min(...featuredEntries.map((e) => e.similarity));
  for (const e of verdict.entries) {
    const a = e.aspects;
    console.log(
      `  ${e.characterName}: ${Math.round(e.similarity * 100)}  [face ${Math.round((a.face ?? 0) * 100)} hair ${Math.round((a.hair ?? 0) * 100)} wardrobe ${Math.round((a.wardrobe ?? 0) * 100)} weapon ${Math.round((a.weapon ?? 0) * 100)} palette ${Math.round((a.palette ?? 0) * 100)} style ${Math.round((a.style ?? 0) * 100)}]`,
    );
    console.log(`    note: ${e.note.slice(0, 220)}`);
  }
  return {
    worst,
    entries: verdict.entries.map((e) => ({
      characterName: e.characterName,
      similarity: Math.round(e.similarity * 100),
      aspects: Object.fromEntries(Object.entries(e.aspects).map(([k, v]) => [k, Math.round((v as number) * 100)])),
      note: e.note,
    })),
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // THE 222 REBUILD GUARD: the sheeted instrument names the window-bound state
  const receiptFile = path.join(process.cwd(), "receipts", "restore-receipt.json");
  try {
    const rr = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
    if (!rr.complete) {
      console.log(`PENDING-WINDOW: the sheets are window-bound (the 222 restore receipt: ${rr.windowBound.join(", ")}) - the paired arms ride when the window opens (the graduation waits for its live ride)`);
      process.exit(0);
    }
  } catch { /* no receipt - fall through to the DB's own truth */ }
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" }, include: { characters: true } });
  if (!prod) throw new Error("Immortal Path missing");
  const sheeted = prod.characters.filter((c) => c.modelSheetUrl).length;
  if (sheeted === 0) {
    console.log("PENDING-WINDOW: no sheeted cast (the DB's own truth) - the paired arms ride when the window opens");
    process.exit(0);
  }

  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } } });
  if (!scene) throw new Error("E7 Sc12 missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  const zai = await ZAI.create();
  const report: RideReceipt[] = [];

  // THE PAIRING: S001 (the sheathed cell) x {control, ARM A}; S004
  // (the weaponless cell) x {control, ARM B} - the ONLY delta the arm.
  const plan: Array<{ shotNumber: number; arm: RideReceipt["arm"] }> = [
    { shotNumber: 1, arm: "control" },
    { shotNumber: 1, arm: "sheath-object-state" },
    { shotNumber: 4, arm: "control" },
    { shotNumber: 4, arm: "weaponless" },
  ];

  for (const step of plan) {
    const shot = shots.find((s) => s.number === step.shotNumber);
    if (!shot) continue;
    const ref = `S${String(shot.number).padStart(3, "0")}`;
    const tag = step.arm === "control" ? `${ref}-control` : `${ref}-arm-${step.arm}`;
    console.log(`\n=== RIDE ${tag} ===`);
    const built = await buildKeyframePrompt(shot.id);
    if (!built.ok) {
      console.log(`  PROMPT MISS - ${built.error}`);
      report.push({ cell: tag, arm: step.arm, error: built.error });
      continue;
    }
    let prompt = built.build.prompt;
    if (step.arm === "sheath-object-state") {
      const member = built.build.members.find((m) => built.build.prompt.includes(`${m.name}'s WEAPON LAW:`));
      if (!member) { console.log("  ARM A MISS - no standing weapon clause in the prompt"); report.push({ cell: tag, arm: step.arm, error: "no standing weapon clause" }); continue; }
      const standing = standingWeaponClauseText(prompt, member.name);
      if (!standing) { console.log("  ARM A MISS - the standing clause's tail not found"); report.push({ cell: tag, arm: step.arm, error: "the standing clause's tail not found" }); continue; }
      prompt = prompt.replace(standing, ARM_A_SHEATH_OBJECT_STATE.replaceAll("{name}", member.name));
    } else if (step.arm === "weaponless") {
      const member = built.build.members[0];
      if (!member) { console.log("  ARM B MISS - no members"); report.push({ cell: tag, arm: step.arm, error: "no members" }); continue; }
      prompt = `${prompt}. ${ARM_B_WEAPONLESS.replaceAll("{name}", member.name)}`;
    }
    fs.writeFileSync(path.join(OUT_DIR, `${tag}-prompt.txt`), prompt);

    // THE ANCHORS (the 215 law): one sheet per member, the images array
    const images: Array<{ url: string }> = [];
    for (const m of built.build.members) {
      const dataUrl = publicImageAsDataUrl(m.sheetUrl);
      if (dataUrl) images.push({ url: dataUrl });
    }
    const size = sizeFor(shot.shotType) as never;
    let base64: string | null = null;
    let lastErr = "";
    // THE LADDER (the 219 law's shape: two bounded retries, honest final)
    for (let attempt = 0; attempt < 3 && base64 === null; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 20_000 : 45_000));
      try {
        if (images.length > 0) {
          const res = (await zai.images.generations.edit({
            prompt,
            images,
            size,
          } as never)) as { data?: Array<{ base64?: string }> };
          base64 = res.data?.[0]?.base64 ?? null;
        } else {
          const res = (await zai.images.generations.create({ prompt, size })) as { data?: Array<{ base64?: string }> };
          base64 = res.data?.[0]?.base64 ?? null;
        }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        const transient = lastErr.includes("429") || lastErr.toLowerCase().includes("too many requests") || lastErr.includes("502") || lastErr.includes("503");
        if (!transient || attempt === 2) break;
      }
    }
    if (!base64) {
      console.log(`  GENERATION MISS - ${lastErr.slice(0, 140)}`);
      report.push({ cell: tag, arm: step.arm, error: lastErr });
      continue;
    }
    const pngPath = path.join(OUT_DIR, `${tag}-keyframe.png`);
    fs.writeFileSync(pngPath, Buffer.from(base64, "base64"));
    console.log(`  pixels landed -> ${pngPath}`);

    const judged = await judge(shot.id, `data:image/png;base64,${base64}`, built.build.members.map((m) => m.name), built.build.members.map((m) => m.name));
    if (!judged) { report.push({ cell: tag, arm: step.arm, pngPath, error: "judge failed" }); continue; }
    console.log(`  >>> ${tag} worst ${Math.round(judged.worst * 100)}`);
    report.push({ cell: tag, arm: step.arm, promptPath: path.join(OUT_DIR, `${tag}-prompt.txt`), pngPath, featuredWorst: Math.round(judged.worst * 100), entries: judged.entries });
    // the paired breath (the night's own pacing)
    await new Promise((r) => setTimeout(r, 10_000));
  }

  fs.writeFileSync(path.join(OUT_DIR, "swordprior-report.json"), JSON.stringify({ probe: "swordprior-222", rodeAt: new Date().toISOString(), rides: report }, null, 2));
  console.log(`\nreceipt -> ${path.join(OUT_DIR, "swordprior-report.json")} (no production writes anywhere)`);
  await db.$disconnect();
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
