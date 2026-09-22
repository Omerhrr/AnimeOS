// Debug: reproduce the DSH round-1 call and inspect the raw model output.
import ZAI from "z-ai-web-dev-sdk";
import { buildSystemPrompt } from "@/lib/dsh/prompts";
import { TOOL_DEFS, buildCompactContext } from "@/lib/dsh/tools";

const zai = await ZAI.create();
const context = await buildCompactContext("cmucbvg9v0000kafwojyxv3sp");
const toolDocs = TOOL_DEFS.map(
  (t) => `- ${t.name}: ${t.description}${Object.keys(t.args).length ? `\n  args: ${Object.entries(t.args).map(([k, v]) => `${k} (${v})`).join("; ")}` : ""}`
).join("\n");
const system = buildSystemPrompt(JSON.stringify(context, null, 1), toolDocs);

const completion = await zai.chat.completions.create({
  messages: [
    { role: "assistant", content: system },
    { role: "user", content: "Run a direction diff across all episodes of this production and re-render only the stale takes it reports." },
  ],
  thinking: { type: "disabled" },
});
const raw = completion.choices[0]?.message?.content ?? "";
console.log("RAW LENGTH:", raw.length);
console.log("RAW:", raw.slice(0, 900));
