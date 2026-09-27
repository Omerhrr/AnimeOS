// Minimal one-message LLM probe: proves an upstream 429 is the
// PROVIDER's state, not a code path touched by the iteration.
import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();
  try {
    const completion = await zai.chat.completions.create({
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });
    console.log("PROBE OK:", completion.choices[0]?.message?.content?.slice(0, 80));
  } catch (err) {
    console.log("PROBE FAILED:", String(err).slice(0, 300));
    process.exitCode = 2;
  }
}

main();
