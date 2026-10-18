// PROBE 222 - the window's shape: all four channels in ONE run.
// (THE 231 GRADUATION - THE PROBE'S SHADOW: the 222 probe measured the
// wall with its OWN wrong doors and read "partial 2/4" for five rides;
// probe231-shapes.ts opened both doors live - EDIT rides the images
// OBJECT array `[{url: dataUrl}]` (the 215 anchor pass's shape,
// keyframe.ts's own), VISION rides the dedicated createVision door (no
// model field - production's exact shape). The probe now knocks the
// production doors, so the window's read is the ACCOUNT's shape, not
// the probe's shadow.) No production write.
// Run: npx tsx scripts/probe222-window.ts
import fs from "fs";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";

const OUT = path.join(process.cwd(), "inspect", "aiart222");

interface ChannelRead {
  channel: string;
  state: "OPEN" | "BLOCKED";
  ms: number;
  detail: string;
}
const reads: ChannelRead[] = [];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const zai = await ZAI.create();

  // 1. THE EDIT CHANNEL (the sheets' door - night122-restore's need)
  //    THE 231 DOOR LAW: the runtime parses the images OBJECT array
  //    `[{url: dataUrl}]` (the published dts' singular `image` string is
  //    the shadow that read as a 400 wall since 220). probe231-shapes
  //    E3 opened this door live (13.2s, 76,100 chars of real pixels).
  const t0e = Date.now();
  try {
    // a tiny 1x1 transparent png as the base image
    const tiny = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const res = (await zai.images.generations.edit({
      prompt: "a single green tea cup on a wooden table, anime cel-shading style",
      images: [{ url: `data:image/png;base64,${tiny.toString("base64")}` }],
      size: "1024x1024",
    } as never)) as { data?: Array<{ base64?: string }> };
    const ms = Date.now() - t0e;
    const b64 = res.data?.[0]?.base64 ?? "";
    console.log(`EDIT CHANNEL: OPEN (${ms}ms, base64 ${b64.length} chars)`);
    reads.push({ channel: "edit", state: "OPEN", ms, detail: `base64 ${b64.length} chars` });
    fs.writeFileSync(path.join(OUT, "probe222-edit.png"), Buffer.from(b64, "base64"));
  } catch (e) {
    const ms = Date.now() - t0e;
    console.log(`EDIT CHANNEL: BLOCKED (${ms}ms) - ${msg(e)}`);
    reads.push({ channel: "edit", state: "BLOCKED", ms, detail: msg(e) });
  }

  // 2. THE CREATE CHANNEL (the 220 fast-reject channel)
  const t0c = Date.now();
  try {
    const res = (await zai.images.generations.create({
      prompt: "a single blue ceramic bowl on a stone step, anime cel-shading style, flat colors",
      size: "1024x1024",
    })) as { data?: Array<{ base64?: string }> };
    const ms = Date.now() - t0c;
    const b64 = res.data?.[0]?.base64 ?? "";
    console.log(`CREATE CHANNEL: OPEN (${ms}ms, base64 ${b64.length} chars)`);
    reads.push({ channel: "create", state: "OPEN", ms, detail: `base64 ${b64.length} chars` });
    fs.writeFileSync(path.join(OUT, "probe222-create.png"), Buffer.from(b64, "base64"));
  } catch (e) {
    const ms = Date.now() - t0c;
    console.log(`CREATE CHANNEL: BLOCKED (${ms}ms) - ${msg(e)}`);
    reads.push({ channel: "create", state: "BLOCKED", ms, detail: msg(e) });
  }

  // 3. THE VISION CHANNEL (the judge + the count + the anchors' door)
  //    THE 231 DOOR LAW: the vision door is createVision - the dedicated
  //    POST /chat/completions/vision endpoint - NOT completions.create
  //    (the text-only door whose 400 "content.type 取值范围 ['text']" was
  //    the shadow). Production rides createVision with NO model field;
  //    probe231-shapes V1 opened this door live (450ms, READY).
  const t0v = Date.now();
  try {
    const tiny = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const completion = await zai.chat.completions.createVision({
      messages: ([
        {
          role: "user",
          content: [
            { type: "text", text: "Reply with exactly one word: READY" },
            { type: "image_url", image_url: { url: `data:image/png;base64,${tiny.toString("base64")}` } },
          ],
        },
      ]) as never,
    } as never);
    const ms = Date.now() - t0v;
    const text = ((completion as never) as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "";
    console.log(`VISION CHANNEL: OPEN (${ms}ms) - read: ${text.slice(0, 40).replace(/\n/g, " ")}`);
    reads.push({ channel: "vision", state: "OPEN", ms, detail: text.slice(0, 40) });
  } catch (e) {
    const ms = Date.now() - t0v;
    console.log(`VISION CHANNEL: BLOCKED (${ms}ms) - ${msg(e)}`);
    reads.push({ channel: "vision", state: "BLOCKED", ms, detail: msg(e) });
  }

  // 4. THE PLAIN TEXT CHANNEL (the 220 account-total's fourth member)
  const t0t = Date.now();
  try {
    const completion = await zai.chat.completions.create({
      messages: [{ role: "user", content: "Reply with exactly one word: READY" }],
    });
    const ms = Date.now() - t0t;
    const text = ((completion as never) as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "";
    console.log(`TEXT CHANNEL: OPEN (${ms}ms) - read: ${text.slice(0, 40).replace(/\n/g, " ")}`);
    reads.push({ channel: "text", state: "OPEN", ms, detail: text.slice(0, 40) });
  } catch (e) {
    const ms = Date.now() - t0t;
    console.log(`TEXT CHANNEL: BLOCKED (${ms}ms) - ${msg(e)}`);
    reads.push({ channel: "text", state: "BLOCKED", ms, detail: msg(e) });
  }

  // THE WALL'S SHAPE MADE DURABLE (the 220 report law's shape): the
  // probe's own read lands as a receipt - the wall's state survives
  // the terminal, and the iteration's e2e reads the SAME file.
  const blocked = reads.filter((r) => r.state === "BLOCKED").length;
  const shape = blocked === 0 ? "open" : blocked === reads.length ? "account-total" : "partial";
  const receipt = {
    probe: "probe222-window",
    edition: "231",
    readAt: new Date().toISOString(),
    shape,
    channels: reads,
    note: "the four-channel read through the production doors (the 231 probe's-shadow graduation) - the wall's state survives the box's death",
  };
  fs.writeFileSync(path.join(OUT, "window-report.json"), JSON.stringify(receipt, null, 2));
  console.log(`WINDOW SHAPE: ${shape} (${blocked}/${reads.length} channels blocked) - receipt: ${path.join(OUT, "window-report.json")}`);
}

function msg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 120);
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
