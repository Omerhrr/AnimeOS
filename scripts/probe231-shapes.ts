// PROBE 231 - THE PROBE'S SHADOW: the two 400 walls re-knocked with the
// production shapes. The 222 probe measured the wall with its OWN wrong
// doors: (a) EDIT rode the singular `image` field the published dts
// names, while the runtime's accepted shape is the `images` ARRAY (the
// 215 anchor pass rode it; keyframe.ts:438 rides it in production);
// (b) VISION rode completions.create - the TEXT-ONLY door - while the
// SDK carries a dedicated createVision door and the production vision
// calls (keyframe.ts, identity.ts, universe-facts.ts) ride it with no
// model field. This probe knocks both doors the production way, logs
// the wall's words VERBATIM and WHOLE (the 120-char truncation hid the
// wall's sentence), and lands a receipt. No production write.
// Run: npx tsx scripts/probe231-shapes.ts
import fs from "fs";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";

const OUT = path.join(process.cwd(), "inspect", "aiart231");

interface VariantRead {
  channel: string;
  variant: string;
  shape: string;
  state: "OPEN" | "BLOCKED";
  ms: number;
  detail: string; // FULL text - the wall's words verbatim, whole
}

const reads: VariantRead[] = [];
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const zai = await ZAI.create();
  const dataUrl = `data:image/png;base64,${TINY_PNG}`;

  // ── THE EDIT CHANNEL, two doors ──
  // Variant E1: the RUNTIME's shape - the images ARRAY (production's own).
  {
    const t0 = Date.now();
    try {
      const res = (await zai.images.generations.edit({
        prompt: "a single green tea cup on a wooden table, anime cel-shading style",
        images: [dataUrl],
        size: "1024x1024",
      } as never)) as { data?: Array<{ base64?: string }> };
      const ms = Date.now() - t0;
      const b64 = res.data?.[0]?.base64 ?? "";
      const detail = `base64 ${b64.length} chars`;
      console.log(`EDIT  E1 images-array:  OPEN (${ms}ms, ${detail})`);
      reads.push({ channel: "edit", variant: "E1", shape: "images:[dataUrl]", state: "OPEN", ms, detail });
      if (b64) fs.writeFileSync(path.join(OUT, "probe231-edit-e1.png"), Buffer.from(b64, "base64"));
    } catch (e) {
      const ms = Date.now() - t0;
      const detail = e instanceof Error ? e.message : String(e);
      console.log(`EDIT  E1 images-array:  BLOCKED (${ms}ms) - ${detail}`);
      reads.push({ channel: "edit", variant: "E1", shape: "images:[dataUrl]", state: "BLOCKED", ms, detail });
    }
  }
  // Variant E2: the 222 probe's own shape - singular `image` (the control;
  // the wall's words read whole this time).
  {
    const t0 = Date.now();
    try {
      const res = (await zai.images.generations.edit({
        prompt: "a single green tea cup on a wooden table, anime cel-shading style",
        image: dataUrl,
        size: "1024x1024",
      })) as { data?: Array<{ base64?: string }> };
      const ms = Date.now() - t0;
      const b64 = res.data?.[0]?.base64 ?? "";
      const detail = `base64 ${b64.length} chars`;
      console.log(`EDIT  E2 image-single:  OPEN (${ms}ms, ${detail})`);
      reads.push({ channel: "edit", variant: "E2", shape: "image:dataUrl", state: "OPEN", ms, detail });
      if (b64) fs.writeFileSync(path.join(OUT, "probe231-edit-e2.png"), Buffer.from(b64, "base64"));
    } catch (e) {
      const ms = Date.now() - t0;
      const detail = e instanceof Error ? e.message : String(e);
      console.log(`EDIT  E2 image-single:  BLOCKED (${ms}ms) - ${detail}`);
      reads.push({ channel: "edit", variant: "E2", shape: "image:dataUrl", state: "BLOCKED", ms, detail });
    }
  }
  // Variant E3: PRODUCTION'S EXACT SHAPE - the images array carries
  // OBJECTS with url (keyframe.ts:397-404: `images: Array<{ url: string }>`,
  // one member = one {url: dataUrl}). E1's string array was still a wrong
  // door: the runtime parses objects, not strings.
  {
    const t0 = Date.now();
    try {
      const res = (await zai.images.generations.edit({
        prompt: "a single green tea cup on a wooden table, anime cel-shading style",
        images: [{ url: dataUrl }],
        size: "1024x1024",
      } as never)) as { data?: Array<{ base64?: string }> };
      const ms = Date.now() - t0;
      const b64 = res.data?.[0]?.base64 ?? "";
      const detail = `base64 ${b64.length} chars`;
      console.log(`EDIT  E3 images-objects:  OPEN (${ms}ms, ${detail})`);
      reads.push({ channel: "edit", variant: "E3", shape: "images:[{url:dataUrl}]", state: "OPEN", ms, detail });
      if (b64) fs.writeFileSync(path.join(OUT, "probe231-edit-e3.png"), Buffer.from(b64, "base64"));
    } catch (e) {
      const ms = Date.now() - t0;
      const detail = e instanceof Error ? e.message : String(e);
      console.log(`EDIT  E3 images-objects:  BLOCKED (${ms}ms) - ${detail}`);
      reads.push({ channel: "edit", variant: "E3", shape: "images:[{url:dataUrl}]", state: "BLOCKED", ms, detail });
    }
  }

  // ── THE VISION CHANNEL, the production door first ──
  // Variant V1: createVision, NO model field (production's exact shape).
  {
    const t0 = Date.now();
    try {
      const res = (await zai.chat.completions.createVision({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Reply with exactly one word: READY" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      } as never)) as { choices?: Array<{ message?: { content?: string } }> };
      const ms = Date.now() - t0;
      const text = res.choices?.[0]?.message?.content ?? "";
      const detail = `read: ${text.slice(0, 60).replace(/\n/g, " ")}`;
      console.log(`VISION V1 createVision(no model): OPEN (${ms}ms) - ${detail}`);
      reads.push({ channel: "vision", variant: "V1", shape: "createVision,no-model", state: "OPEN", ms, detail });
    } catch (e) {
      const ms = Date.now() - t0;
      const detail = e instanceof Error ? e.message : String(e);
      console.log(`VISION V1 createVision(no model): BLOCKED (${ms}ms) - ${detail}`);
      reads.push({ channel: "vision", variant: "V1", shape: "createVision,no-model", state: "BLOCKED", ms, detail });
    }
  }
  // Variants V2/V3: named vision models - ridden only if V1 blocked.
  const v1 = reads.find((r) => r.variant === "V1");
  if (v1 && v1.state === "BLOCKED") {
    for (const model of ["glm-4v", "glm-4.5v"]) {
      const t0 = Date.now();
      try {
        const res = (await zai.chat.completions.createVision({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Reply with exactly one word: READY" },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        } as never)) as { choices?: Array<{ message?: { content?: string } }> };
        const ms = Date.now() - t0;
        const text = res.choices?.[0]?.message?.content ?? "";
        const detail = `read: ${text.slice(0, 60).replace(/\n/g, " ")}`;
        console.log(`VISION ${model}: OPEN (${ms}ms) - ${detail}`);
        reads.push({ channel: "vision", variant: model, shape: `createVision,${model}`, state: "OPEN", ms, detail });
        break;
      } catch (e) {
        const ms = Date.now() - t0;
        const detail = e instanceof Error ? e.message : String(e);
        console.log(`VISION ${model}: BLOCKED (${ms}ms) - ${detail}`);
        reads.push({ channel: "vision", variant: model, shape: `createVision,${model}`, state: "BLOCKED", ms, detail });
      }
    }
  }

  // ── THE RECEIPT (the 220 report law's shape: the read survives the terminal) ──
  const editOpen = reads.some((r) => r.channel === "edit" && r.state === "OPEN");
  const visionOpen = reads.some((r) => r.channel === "vision" && r.state === "OPEN");
  const verdict = editOpen && visionOpen ? "BOTH WALLS WERE THE PROBE'S OWN DOORS" : editOpen ? "EDIT DOOR FOUND" : visionOpen ? "VISION DOOR FOUND" : "WALLS STAND";
  const receipt = {
    probe: "probe231-shapes",
    readAt: new Date().toISOString(),
    verdict,
    editOpen,
    visionOpen,
    winningShapes: {
      edit: reads.find((r) => r.channel === "edit" && r.state === "OPEN")?.shape ?? null,
      vision: reads.find((r) => r.channel === "vision" && r.state === "OPEN")?.shape ?? null,
    },
    reads,
    note: "the production shapes re-knocked: the edit images-ARRAY and the createVision door - the wall's words verbatim and WHOLE",
  };
  fs.writeFileSync(path.join(OUT, "shapes-report.json"), JSON.stringify(receipt, null, 2));
  console.log(`VERDICT: ${verdict} - receipt: ${path.join(OUT, "shapes-report.json")}`);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
