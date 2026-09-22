import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { TOOL_DEFS, executeTool, buildCompactContext } from "@/lib/dsh/tools";
import { buildSystemPrompt, parseDshResponse } from "@/lib/dsh/prompts";
import type { DshTurnResult, TraceAction, TraceStep } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// DSH ORCHESTRATOR - the brain's core loop (§5)
//
//   INTENT → PLAN → EXECUTE → OBSERVE → (repeat, max N) → REPLY
//
// The LLM proposes directorial decisions as tool calls; the
// production tool API executes them; observations feed back until
// DSH is satisfied or asks the creator a question.
// ─────────────────────────────────────────────────────────────

const MAX_EXECUTION_ROUNDS = 4;

function toolDocs(): string {
  return TOOL_DEFS.map(
    (t) => `- ${t.name}: ${t.description}${Object.keys(t.args).length ? `\n  args: ${Object.entries(t.args).map(([k, v]) => `${k} (${v})`).join("; ")}` : ""}`
  ).join("\n");
}

export async function runDshTurn(projectId: string, userMessage: string): Promise<DshTurnResult> {
  const zai = await ZAI.create();
  let activeProjectId = projectId;
  const context = await buildCompactContext(activeProjectId);
  const system = buildSystemPrompt(JSON.stringify(context, null, 1), toolDocs());

  const history = await db.dshMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  history.reverse();

  const messages: Array<{ role: "assistant" | "user"; content: string }> = [
    { role: "assistant", content: system },
    ...history.map((h) => ({
      role: (h.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: h.role === "user" ? h.content : h.content,
    })),
    { role: "user", content: userMessage },
  ];

  const trace: TraceStep[] = [];
  let finalReply = "";
  let needsInput = false;

  for (let round = 1; round <= MAX_EXECUTION_ROUNDS; round++) {
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = parseDshResponse(raw);

    if (!parsed) {
      // Model broke protocol - salvage whatever text exists as the reply
      finalReply = raw.trim() || "I need a moment to re-align my production plan - try that instruction once more.";
      break;
    }

    // Execute this round's tool batch and collect observations
    const executedActions: TraceAction[] = [];
    for (const action of parsed.actions) {
      const outcome = await executeTool(activeProjectId, action.tool, action.args ?? {});
      // A create_project call switches the active production mid-turn
      if (action.tool === "create_project" && outcome.status === "OK") {
        const match = outcome.result.match(/New active project id: (\S+)/);
        if (match) activeProjectId = match[1];
      }
      executedActions.push({
        tool: action.tool,
        args: action.args ?? {},
        result: outcome.result,
        status: outcome.status,
        // a variant bind renders an audition preview of the new
        // performance; keep it on the trace so the console can play it
        ...(outcome.audition ? { audition: outcome.audition } : {}),
      });
      await db.productionEvent.create({
        data: {
          projectId: activeProjectId,
          actor: "DSH",
          type: "TOOL_CALL",
          summary: `${action.tool} → ${outcome.result.split("\n")[0].slice(0, 180)}`,
          payload: JSON.stringify({ tool: action.tool, args: action.args, status: outcome.status }),
        },
      });
    }

    trace.push({
      step: round,
      thought: parsed.thought,
      plan: parsed.plan,
      actions: executedActions,
    });

    finalReply = parsed.reply;
    needsInput = parsed.needs_input;

    const hasActions = executedActions.length > 0;
    const hadErrors = executedActions.some((a) => a.status === "ERROR");

    // No actions → pure conversational turn; or DSH needs the creator → stop
    if (!hasActions || needsInput) break;

    // Feed observations back and let DSH continue (observe → decide)
    const observation = `OBSERVATIONS (round ${round}):\n${executedActions
      .map((a) => `[${a.status}] ${a.tool}: ${a.result}`)
      .join("\n")}\n\nContinue directing: if the production step is complete, set actions to [] and give the creator your reply. If something failed or more must be created, issue the next tool batch.`;

    messages.push({ role: "assistant", content: JSON.stringify(parsed) });
    messages.push({ role: "user", content: observation });

    // Last round: force a wrap-up without tools
    if (round === MAX_EXECUTION_ROUNDS) {
      messages.push({
        role: "user",
        content: "Tool budget reached. Wrap up now: actions [], reply = concise director's status report of what was accomplished and what comes next.",
      });
    }

    // Refresh context after mutations so the next round sees new state
    if (round < MAX_EXECUTION_ROUNDS) {
      const refreshed = await buildCompactContext(activeProjectId);
      messages[0] = { role: "assistant", content: buildSystemPrompt(JSON.stringify(refreshed, null, 1), toolDocs()) };
    }

    void hadErrors;
  }

  // Persist the conversation
  await db.dshMessage.create({ data: { projectId, role: "user", content: userMessage } });
  await db.dshMessage.create({
    data: {
      projectId: activeProjectId,
      role: "dsh",
      content: finalReply || "Production step acknowledged.",
      trace: JSON.stringify(trace),
    },
  });

  return { reply: finalReply, trace, activeProjectId };
}
