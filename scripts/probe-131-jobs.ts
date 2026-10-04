import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const jobs = await db.renderJob.findMany({ orderBy: { createdAt: "asc" } });
  for (const j of jobs) {
    const st = (j as any).state ?? null;
    const errTail = st?.error ?? st?.render?.error ?? null;
    console.log("=== job", j.id.slice(-6), j.status, "driver:", j.driver);
    if ((j as any).error) console.log("  error:", (j as any).error);
    if (st && typeof st === "object") {
      const keys = Object.keys(st);
      console.log("  state keys:", keys.join(","));
      if (st.error) console.log("  state.error:", String(st.error).slice(0, 300));
      if (st.inspect) console.log("  state.inspect:", JSON.stringify(st.inspect).slice(0, 300));
      if (st.identity) console.log("  state.identity:", JSON.stringify(st.identity).slice(0, 200));
      if (st.figureSource) console.log("  figureSource:", st.figureSource);
      if (st.animeRefused) console.log("  animeRefused:", st.animeRefused);
    }
    console.log("  output:", j.outputUrl ?? "-");
  }
  await db.$disconnect();
}
main();
