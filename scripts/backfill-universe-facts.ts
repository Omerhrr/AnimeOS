// One-off backfill: universe facts for every existing production that
// has none (the demo production gets its canon rules, matching seed.ts).
import { db } from "../src/lib/db";

const DEMO_FACTS = [
  { text: "Lin Yue's blade emits a cyan glow whenever spirit energy channels through it", category: "PROP" },
  { text: "The Cloud Terrace arena sits under two moons in the night sky", category: "LOCATION" },
  { text: "Chen Hao's iron half-mask covers the left side of his face and never comes off", category: "CHARACTER" },
  { text: "Spirit energy in this world appears as golden particles drifting upward", category: "RULE" },
];

async function main() {
  const projects = await db.project.findMany({ select: { id: true, title: true } });
  for (const p of projects) {
    const count = await db.universeFact.count({ where: { projectId: p.id } });
    if (count > 0) {
      console.log(`${p.title}: ${count} facts already present, skipping`);
      continue;
    }
    const facts = p.title === "Immortal Path" ? DEMO_FACTS : [];
    for (const f of facts) {
      await db.universeFact.create({ data: { projectId: p.id, text: f.text, category: f.category, source: "BIBLE" } });
    }
    console.log(`${p.title}: created ${facts.length} facts`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
