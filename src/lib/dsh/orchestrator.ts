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
//
// MEMORY BOUNDARY (Iteration 50): a turn's memory belongs to the
// production it started on. The conversation (both messages) is
// persisted to the START production even when DSH creates and
// switches to a NEW production mid-turn; the newborn gets its own
// origin event instead of a borrowed half-conversation.
// ─────────────────────────────────────────────────────────────

const MAX_EXECUTION_ROUNDS = 4;

function toolDocs(): string {
  return TOOL_DEFS.map(
    (t) => `- ${t.name}: ${t.description}${Object.keys(t.args).length ? `\n  args: ${Object.entries(t.args).map(([k, v]) => `${k} (${v})`).join("; ")}` : ""}`
  ).join("\n");
}

/** Pull the title out of a create_project result ("Production 'X' created ..."). */
function projectTitleOf(result: string): string {
  const m = result.match(/Production '([^']+)' created/);
  return m ? m[1] : "a new production";
}

export async function runDshTurn(
  projectId: string,
  userMessage: string,
  user?: { id: string; name: string; role: string } | null
): Promise<DshTurnResult> {
  const zai = await ZAI.create();
  const originProjectId = projectId; // the conversation's home
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
      const outcome = await executeTool(activeProjectId, action.tool, action.args ?? {}, user);
      // A create_project call switches the active production mid-turn
      if (action.tool === "create_project" && outcome.status === "OK") {
        const match = outcome.result.match(/New active project id: (\S+)/);
        if (match && match[1] !== activeProjectId) {
          const bornFrom = activeProjectId;
          activeProjectId = match[1];
          // Origin event on the newborn: its history starts with WHO
          // and WHERE it came from - not with a borrowed conversation.
          await db.productionEvent.create({
            data: {
              projectId: activeProjectId,
              actor: "DSH",
              type: "PROJECT",
              summary: `Created by DSH directing '${projectTitleOf(outcome.result)}'${user ? ` - ${user.name} leads its crew (DIRECTING)` : ""}; conversation continues from the turn's home production`,
              payload: JSON.stringify({ bornFrom, by: user?.id ?? null, tool: "create_project" }),
            },
          }).catch(() => null);
        }
      }
      executedActions.push({
        tool: action.tool,
        args: action.args ?? {},
        result: outcome.result,
        status: outcome.status,
        // a variant bind renders an audition preview of the new
        // performance; an ensemble apply renders ONE read per engaged
        // speaker; an arc tool lands a playable arc chip - keep all
        // three on the trace so the console can play them
        ...(outcome.audition ? { audition: outcome.audition } : {}),
        ...(outcome.ensembleAudition ? { ensembleAudition: outcome.ensembleAudition } : {}),
        ...(outcome.arcPlayback ? { arcPlayback: outcome.arcPlayback } : {}),
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

  // Persist the conversation - BOTH messages to the production the
  // turn started on. A mid-turn create_project switches where DSH
  // WORKS, never where the memory lives: the start production keeps
  // question AND answer together, and the newborn production starts
  // its own history from the origin event, not half of this one.
  await db.dshMessage.create({ data: { projectId: originProjectId, role: "user", content: userMessage } });
  await db.dshMessage.create({
    data: {
      projectId: originProjectId,
      role: "dsh",
      content:
        finalReply ||
        (activeProjectId !== originProjectId
          ? `Production step acknowledged - work continues on the new production (${activeProjectId}).`
          : "Production step acknowledged."),
      trace: JSON.stringify(trace),
    },
  });

  return { reply: finalReply, trace, activeProjectId };
}
