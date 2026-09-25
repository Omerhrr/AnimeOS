// Iteration 46 E2E: translate_subtitles tool (#56) - registration,
// doctrine rule 24, glossary-enriched context, and a live run that
// writes the translated SRT to public/subtitles/.
import { executeTool } from "../src/lib/dsh/tools";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ID = "cmuhbro1n0000oh239eqktl0i";
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

async function main() {
  // 1. Tool registered exactly once
  const toolsMod = await import("../src/lib/dsh/tools");
  const defs = (toolsMod as unknown as { TOOL_DEFS: Array<{ name: string }> }).TOOL_DEFS;
  check("TOOL_DEFS has 56 entries", defs.length === 56, `got ${defs.length}`);
  check("translate_subtitles registered", defs.filter((d) => d.name === "translate_subtitles").length === 1);

  // 2. Doctrine rule 24 teaches the glossary
  const doctrine = readFileSync(join(process.cwd(), "src/lib/dsh/prompts.ts"), "utf8");
  check(
    "doctrine rule 24 teaches localization",
    doctrine.includes("24. LOCALIZATION CARRIES THE GLOSSARY") && doctrine.includes("translate_subtitles"),
  );

  // 3. Context terminology line now carries fixed renderings
  const ctx = await toolsMod.buildCompactContext(PROJECT_ID);
  const ctxText = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
  check("context terminology line carries renderings", ctxText.includes("Azure Flame [TECHNIQUE] (zh-CN=青焰, en-US=Azure Flame, ja-JP=蒼炎"), ctxText.slice(0, 120));

  // 4. Live run: translate a term-loaded SRT through the tool
  const srt = [
    "1", "00:00:01,000 --> 00:00:04,000", "Lin Yue raised the Azure Flame against the storm of Azure Mountain.", "",
    "2", "00:00:04,500 --> 00:00:08,000", "Beyond Qi Condensation lies Foundation Establishment, and a harder road.", "",
  ].join("\n");
  const res = await executeTool(PROJECT_ID, "translate_subtitles", { targetLang: "ja-JP", srt });
  check("tool executes OK", res.status === "OK", res.result.slice(0, 200));
  console.log("tool result:", res.result);

  // 5. The translated SRT landed as a file
  const file = join(process.cwd(), "public", "subtitles", "immortal-path-ja-JP.srt");
  check("translated SRT written", existsSync(file));
  if (existsSync(file)) {
    const content = readFileSync(file, "utf8");
    check("file holds ja-JP cues", content.includes("-->") && /[\u3040-\u30ff\u4e00-\u9faf]/.test(content));
    check("glossary terms carried", content.includes("蒼炎") && content.includes("リン・ユエ"), content.slice(0, 120));
    console.log("---file head---\n" + content.slice(0, 240));
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
