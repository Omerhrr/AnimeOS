// ─────────────────────────────────────────────────────────────
// MEMBER DIGESTS (iteration 68 - the crew reads each other)
//
// The daily digest speaks to the creator about the STUDIO; a member
// digest speaks about ONE member - what they actually caused in the
// window. It reads two honest ledgers:
//
//   • production events attributed to them (the userId stamp that
//     rides every member-driven tool call since iteration 68), the
//     TOOL_CALLs grouped by tool so the lines name real verbs
//   • their comments in the crew threads (Comment.authorId - always
//     was attributed)
//
// A member with neither is reported honestly: "quiet window" - a
// digest is never invented. Pure and deterministic: the same ledger
// against the same now always lands the same lines.
// ─────────────────────────────────────────────────────────────

export interface MemberDigestEvent {
  type: string;
  summary: string;
  createdAt: Date;
  payload?: string | null; // JSON - TOOL_CALL rows carry { tool, ... }
}

export interface MemberDigestInput {
  member: { name: string; role: string };
  events: MemberDigestEvent[];
  comments: number;
  windowHours: number;
  now: Date;
}

export interface MemberDigest {
  name: string;
  role: string;
  headline: string;
  lines: string[];
  toolCalls: number;
  tools: Record<string, number>;
  events: number;
  comments: number;
  quiet: boolean;
}

function toolOf(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { tool?: unknown };
    return typeof parsed.tool === "string" && parsed.tool ? parsed.tool : null;
  } catch {
    return null;
  }
}

export function buildMemberDigest(input: MemberDigestInput): MemberDigest {
  const { member, comments, windowHours, now } = input;
  const inWindow = input.events.filter((e) => {
    const t = e.createdAt.getTime();
    return Number.isFinite(t) && t >= now.getTime() - windowHours * 3_600_000 && t <= now.getTime() + 60_000;
  });
  const tools: Record<string, number> = {};
  let toolCalls = 0;
  let other = 0;
  const otherKinds: Record<string, number> = {};
  for (const e of inWindow) {
    const tool = toolOf(e.payload);
    if (e.type === "TOOL_CALL" && tool) {
      tools[tool] = (tools[tool] ?? 0) + 1;
      toolCalls += 1;
    } else if (e.type === "TOOL_CALL") {
      other += 1;
    } else {
      otherKinds[e.type] = (otherKinds[e.type] ?? 0) + 1;
    }
  }
  const lines: string[] = [];
  if (toolCalls > 0) {
    const named = Object.entries(tools)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([t, n]) => `${t} ×${n}`);
    lines.push(`${toolCalls} DSH tool call${toolCalls === 1 ? "" : "s"}${named.length ? ` - ${named.join(", ")}` : ""}`);
  }
  if (other > 0) lines.push(`${other} direction step${other === 1 ? "" : "s"} without a named tool`);
  for (const [kind, n] of Object.entries(otherKinds).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    lines.push(`${n} ${kind.toLowerCase()} event${n === 1 ? "" : "s"}`);
  }
  if (comments > 0) lines.push(`${comments} comment${comments === 1 ? "" : "s"} in the crew threads`);
  const quiet = lines.length === 0;
  if (quiet) lines.push("quiet window - nothing recorded");
  const actions = toolCalls + other + comments + Object.values(otherKinds).reduce((a, b) => a + b, 0);
  const headline = quiet
    ? `${member.name} (${member.role}) - quiet in the last ${windowHours}h`
    : `${member.name} (${member.role}) - ${actions} action${actions === 1 ? "" : "s"} in the last ${windowHours}h`;
  return {
    name: member.name,
    role: member.role,
    headline,
    lines,
    toolCalls,
    tools,
    events: inWindow.length,
    comments,
    quiet,
  };
}
