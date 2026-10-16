// PROBE 220 - the wall's own shape: is the 429 edit-channel-only or
// account-wide? One minimal CREATE-channel call, no production write.
// The answer decides the iteration's law: if create is open, the
// anchor-fallback arm has a ridable evidence path; if create 429s too,
// the wall is account-level and the patience law stands.
import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();
  const t0 = Date.now();
  try {
    const res = (await zai.images.generations.create({
      prompt: "a single green tea cup on a wooden table, anime cel-shading style, flat colors",
      size: "576x576",
    })) as { data?: Array<{ base64?: string }> };
    const b64 = res.data?.[0]?.base64 ?? "";
    console.log(`CREATE CHANNEL: OPEN (${Date.now() - t0}ms, base64 ${b64.length} chars)`);
    const fs = await import("fs");
    fs.mkdirSync("inspect/aiart220", { recursive: true });
    fs.writeFileSync("inspect/aiart220/wall-probe-create.png", Buffer.from(b64, "base64"));
  } catch (e) {
    console.log(`CREATE CHANNEL: BLOCKED (${Date.now() - t0}ms) - ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
  }
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
