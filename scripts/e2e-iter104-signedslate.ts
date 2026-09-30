// Iteration 104 E2E: THE SLATE IS SIGNED (the webhook hardening).
// Proves, against the RUNNING studio and a REAL receiving server:
//   A. source: the signing + verification + allowlist laws in the
//      digest layer, the pen gate in the scheduler, the delivery
//      integration through postDailyDigest
//   B. pure: the signature determinism + the verification law (a
//      tampered body, a wrong secret, a stale timestamp all refuse;
//      the exact raw body verifies), the allowlist law (exact hosts,
//      leading-dot subdomains, unset admits)
//   C. real: a live HTTP receiver on loopback captures the POST -
//      the slate carries X-AnimeOS-Signature + X-AnimeOS-Timestamp,
//      the signature verifies over the RAW body against the
//      production's OWN lazily-generated secret (persisted on the
//      project row), the SAME secret signs the second delivery
//      (stable, not per-fire), a tampered body fails the receiver's
//      own verification, an off-allowlist target is refused with no
//      network call, and the schedule pen refuses a disallowed host;
//      exact cleanup
// Run: PHASE=a|b|all npx tsx scripts/e2e-iter104-signedslate.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { postDailyDigest, webhookSignature, verifyWebhookSignature, webhookAllowlistRefusal, resolveWebhookSecret, type DeliveryOutcome } from "../src/lib/digest";
import { createSchedule } from "../src/lib/scheduler";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter104-signedslate";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();
const RECEIVER_PORT = 8477;

// the documented DEV/TEST escape: the receiver lives on loopback
process.env.ANIMEOS_WEBHOOK_ALLOW_PRIVATE = "1";
process.env.ANIMEOS_WEBHOOK_ALLOWLIST = "127.0.0.1, .trusted.example";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

interface CapturedRequest { body: string; signature: string | null; timestamp: string | null; path: string }
let captured: CapturedRequest[] = [];
let receiver: Server | null = null;

function startReceiver(): Promise<void> {
  return new Promise((resolve) => {
    receiver = createServer((req: IncomingMessage, res: ServerResponse) => {
      let chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        captured.push({
          body: Buffer.concat(chunks).toString("utf8"),
          signature: req.headers["x-animeos-signature"] as string | undefined ?? null,
          timestamp: req.headers["x-animeos-timestamp"] as string | undefined ?? null,
          path: req.url ?? "",
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    receiver.listen(RECEIVER_PORT, "127.0.0.1", () => resolve());
  });
}

async function cleanupLab(labId: string): Promise<void> {
  await db.studioSchedule.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function run() {
  console.log(`== Iteration 104: the slate is signed (phase: ${PHASE}) ==\n`);

  if (PHASE === "a" || PHASE === "all") {

  // ── A. the sources stand ──
  const src = readFileSync("src/lib/digest.ts", "utf8");
  check("A1 the signing laws stand (the signature, the verification, the allowlist, the secret resolution)",
    src.includes("export function webhookSignature") && src.includes("export function verifyWebhookSignature")
    && src.includes("export function webhookAllowlistRefusal") && src.includes("export async function resolveWebhookSecret")
    && src.includes("WEBHOOK_SIGNATURE_TOLERANCE_SEC = 300"));
  check("A2 the delivery signs the RAW body (the headers ride the fetch)",
    src.includes('headers["X-AnimeOS-Signature"] = webhookSignature(secret.secret, body, ts)')
    && src.includes('headers["X-AnimeOS-Timestamp"] = String(ts)') && src.includes("signed ("));

  const sched = readFileSync("src/lib/scheduler.ts", "utf8");
  check("A3 the pen obeys the allowlist too (create_schedule refuses a disallowed host)",
    sched.includes("webhookAllowlistRefusal") && sched.includes("at the PEN too"));

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A4 the production owns its secret (webhookSecret on the project row, lazily generated)",
    schema.includes("webhookSecret") && src.includes("randomBytes(32)") && src.includes('source: "env"'));

  // ── B. the pure laws ──
  const body = JSON.stringify({ project: "Iter104 Lab", headline: "the slate", lines: ["a", "b"] });
  const ts = 1750000000;
  const sig = webhookSignature("secret-one", body, ts);
  check("B1 the signature law: deterministic, the sha256= prefix, binds the timestamp AND the body",
    sig === webhookSignature("secret-one", body, ts) && sig.startsWith("sha256=")
    && sig !== webhookSignature("secret-two", body, ts) && sig !== webhookSignature("secret-one", body + " ", ts)
    && sig !== webhookSignature("secret-one", body, ts + 1));

  const now = Math.floor(Date.now() / 1000);
  const fresh = webhookSignature("secret-one", body, now);
  check("B2 the verification law: the exact raw body within the window verifies",
    verifyWebhookSignature("secret-one", body, fresh, now).ok === true);
  check("B3 the verification law: a tampered body refuses (the receiver runs this law)",
    verifyWebhookSignature("secret-one", body + "x", fresh, now).reason === "signature mismatch"
    && verifyWebhookSignature("secret-one", body.slice(0, -1), fresh, now).ok === false);
  check("B4 the verification law: a wrong secret and a stale timestamp refuse, with the reason named",
    verifyWebhookSignature("secret-two", body, fresh, now).reason === "signature mismatch"
    && verifyWebhookSignature("secret-one", body, webhookSignature("secret-one", body, now - 301), now - 301, now).reason === "stale timestamp (replay window exceeded)"
    && verifyWebhookSignature("secret-one", body, null, now).reason === "missing signature"
    && verifyWebhookSignature("secret-one", body, fresh, null).reason === "missing timestamp");
  check("B5 the replay window: the tolerance is exactly 300s on each side (sig at ts, the receiver's clock now)",
    verifyWebhookSignature("secret-one", body, webhookSignature("secret-one", body, now - 300), now - 300, now).ok === true
    && verifyWebhookSignature("secret-one", body, webhookSignature("secret-one", body, now + 300), now + 300, now).ok === true
    && verifyWebhookSignature("secret-one", body, webhookSignature("secret-one", body, now - 301), now - 301, now).ok === false
    && verifyWebhookSignature("secret-one", body, webhookSignature("secret-one", body, now + 301), now + 301, now).ok === false);

  check("B6 the allowlist law: exact hosts, leading-dot subdomains, unset admits, strangers refuse",
    webhookAllowlistRefusal("http://127.0.0.1/hook", "127.0.0.1, .trusted.example") === null
    && webhookAllowlistRefusal("http://api.trusted.example/hook", "127.0.0.1, .trusted.example") === null
    && webhookAllowlistRefusal("http://trusted.example.evil.io/hook", "127.0.0.1, .trusted.example") !== null
    && webhookAllowlistRefusal("http://evil.example/hook", "127.0.0.1, .trusted.example")?.includes("not on the delivery allowlist") === true
    && webhookAllowlistRefusal("http://anything.example/hook", "") === null
    && webhookAllowlistRefusal("http://anything.example/hook", undefined) === null);
  }

  if (PHASE === "b" || PHASE === "b2" || PHASE === "all") {

  // ── C. the REAL delivery over a REAL receiver ──
  await startReceiver();
  const ownerLogin = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email: "director@studio.dev", name: "Lin Director", password: "anchored2026" }),
  });
  const ownerBody = (await ownerLogin.json()) as { user?: { id: string; role: string } };
  const ownerUser = { id: ownerBody.user?.id ?? "", name: "Lin Director", role: ownerBody.user?.role ?? "OWNER" };
  const created = await executeTool("throwaway", "create_project", { title: `Iter104 SignedSlate Lab ${MARK}`, logline: "the signed slate proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C1 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("lab missing");
  const labId = lab.id;

  // the first delivery: the slate is signed with the production's OWN secret
  captured = [];
  const d1 = await postDailyDigest(labId, 24, { webhookUrl: `http://127.0.0.1:${RECEIVER_PORT}/hook` });
  check("C2 the digest delivered (the webhook outcome ok, the delivery names the signing)",
    d1.ok && d1.deliveries.some((x: DeliveryOutcome) => x.kind === "webhook" && x.ok && x.detail.includes("signed (project secret)")),
    JSON.stringify(d1.ok ? d1.deliveries : d1));
  check("C3 the receiver captured exactly one slate", captured.length === 1, JSON.stringify(captured.map((c) => c.path)));

  const secret = await resolveWebhookSecret(labId);
  const row = await db.project.findUnique({ where: { id: labId }, select: { webhookSecret: true } });
  check("C4 the production's own secret was generated lazily and PERSISTED on the project row",
    !!secret && !!row?.webhookSecret && row.webhookSecret === secret!.secret && row.webhookSecret.length === 64,
    `secretSource=${secret?.source} len=${row?.webhookSecret?.length ?? 0}`);

  const slate = captured[0];
  const ts = Number(slate.timestamp);
  check("C5 the slate carried the signature + timestamp headers and the receiver VERIFIES them against the raw body",
    !!slate.signature && slate.signature.startsWith("sha256=") && Number.isFinite(ts)
    && verifyWebhookSignature(row!.webhookSecret!, slate.body, slate.signature, ts).ok === true);
  check("C6 a tampered body fails the receiver's own verification (the slate cannot be edited in flight)",
    verifyWebhookSignature(row!.webhookSecret!, slate.body.replace("Iter104", "Evil104"), slate.signature, ts).ok === false);

  // the second delivery: the SAME secret signs again (stable, not per-fire)
  captured = [];
  await new Promise((r) => setTimeout(r, 1100));
  await postDailyDigest(labId, 24, { webhookUrl: `http://127.0.0.1:${RECEIVER_PORT}/hook2` });
  check("C7 the second slate verifies with the SAME persisted secret (the signing is stable)",
    captured.length === 1
    && verifyWebhookSignature(row!.webhookSecret!, captured[0].body, captured[0].signature, Number(captured[0].timestamp)).ok === true
    && captured[0].path === "/hook2");

  // the allowlist bites at DELIVERY: an off-allowlist target is refused with NO network call
  const before = captured.length;
  const d2 = await postDailyDigest(labId, 24, { webhookUrl: "http://evil.example/hook" });
  const refusal = d2.ok ? d1.deliveries && (await db.productionEvent.findMany({ where: { projectId: labId, type: "DIGEST" }, orderBy: { createdAt: "desc" }, take: 1 }))[0] : null;
  check("C8 the off-allowlist target is refused at delivery (the outcome records the refusal)",
    d2.ok && JSON.stringify(d2.deliveries).includes("not on the delivery allowlist") && captured.length === before,
    JSON.stringify(d2.ok ? d2.deliveries : d2));
  void refusal;

  // the pen: the schedule refuses a disallowed host BEFORE it lands
  const penRefused = await createSchedule(labId, { name: "bad hook", kind: "DAILY_DIGEST", webhookUrl: "http://10.0.0.5/hook", cadence: "DAILY" });
  // with the DEV escape (ALLOW_PRIVATE=1) on, the allowlist still bites;
  // in production the SSRF law refuses first - the pen never accepts it
  const penErr = penRefused.error ?? "";
  check("C9 the pen refuses the private-range host (the SSRF law or the allowlist - the pen never accepts it)",
    !penRefused.ok && (penErr.includes("must not point at a loopback or private address") || penErr.includes("not on the delivery allowlist")),
    penErr || "accepted");
  const penAllowed = await createSchedule(labId, { name: "loop hook", kind: "DAILY_DIGEST", webhookUrl: `http://127.0.0.1:${RECEIVER_PORT}/hook`, cadence: "DAILY" });
  check("C10 the pen admits an allowlisted host (the schedule lands, delivery-time signing rides it)",
    penAllowed.ok, penAllowed.error ?? "");

  // ── D. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  const schedLeft = await db.studioSchedule.count({ where: { projectId: labId } });
  check("D1 the lab is gone exactly (the project and its secret, the schedules)",
    leftovers.length === 0 && schedLeft === 0);
  if (receiver) receiver.close();
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 104 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  if (receiver) receiver.close();
  process.exit(1);
});
