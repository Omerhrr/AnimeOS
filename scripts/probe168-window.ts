// THE 168 PRE-FLIGHT: one real image generation proves the
// provider's window breathes before the night commits to anything.
import ZAI from "z-ai-web-dev-sdk";
(async () => {
  const t0 = Date.now();
  try {
    const zai = await ZAI.create();
    const r = await zai.images.generations.create({ prompt: "a single teal ink brushstroke on dark paper, minimal", size: "1024x1024" });
    const ok = Boolean(r.data?.[0]?.base64);
    console.log(`WINDOW ${ok ? "BREATHES" : "EMPTY"} (${Math.round((Date.now() - t0) / 1000)}s, ${ok ? String(r.data?.[0]?.base64).length + "b" : "no data"})`);
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.log(`WINDOW HOSTILE (${Math.round((Date.now() - t0) / 1000)}s): ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    process.exit(1);
  }
})();
