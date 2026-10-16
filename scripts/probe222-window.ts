// PROBE 222 - the window's shape after the wipe: all four channels in
// ONE run (the 220 wall measured them separately; this probe reads the
// whole account at once - the rebuild's restore law and the second
// kf-v4 night both wait on this answer). No production write.
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
  const t0e = Date.now();
  try {
    // a tiny 1x1 transparent png as the base image
    const tiny = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const res = (await zai.images.generations.edit({
      prompt: "a single green tea cup on a wooden table, anime cel-shading style",
      image: `data:image/png;base64,${tiny.toString("base64")}`,
      size: "1024x1024",
    })) as { data?: Array<{ base64?: string }> };
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
  const t0v = Date.now();
  try {
    const tiny = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: ([
            { type: "text", text: "Reply with exactly one word: READY" },
            { type: "image_url", image_url: { url: `data:image/png;base64,${tiny.toString("base64")}` } },
          ]) as never,
        },
      ],
    });
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
    readAt: new Date().toISOString(),
    shape,
    channels: reads,
    note: "the four-channel read after the twelfth-drift wipe - the wall's state survives the box's death",
  };
  fs.writeFileSync(path.join(OUT, "window-report.json"), JSON.stringify(receipt, null, 2));
  console.log(`WINDOW SHAPE: ${shape} (${blocked}/${reads.length} channels blocked) - receipt: ${path.join(OUT, "window-report.json")}`);
}

function msg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 120);
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
