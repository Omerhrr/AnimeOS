// One-off: replace em/en dash characters in every text column of the
// SQLite database so existing rows comply with the no-dash rule.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TARGETS: Array<[table: string, columns: string[]]> = [
  ["Project", ["title", "logline", "artStylePrompt", "artPalettePrompt", "artNegativePrompt"]],
  ["Season", ["title"]],
  ["Episode", ["title", "synopsis"]],
  ["Environment", ["name", "description", "timeOfDay", "weather", "atmosphere", "lighting"]],
  ["Scene", ["title", "description", "timeOfDay", "weather", "atmosphere", "lighting"]],
  ["Shot", ["description", "lighting", "dialogue"]],
  ["Character", ["name", "role", "age", "personality", "backstory", "appearance", "wardrobe", "abilities", "animationLib", "canonicalState", "modelSheetPrompt"]],
  ["CharacterState", ["label", "cultivation", "weapon", "clothing", "abilities"]],
  ["Asset", ["name", "description"]],
  ["AssetVersion", ["note"]],
  ["Terminology", ["term", "translations"]],
  ["ContinuityEvent", ["entityName", "description"]],
  ["ProductionEvent", ["summary", "payload"]],
  ["DshMessage", ["content", "trace"]],
  ["StyleLora", ["name", "triggerPhrase", "notes"]],
  ["Artist", ["name", "role"]],
  ["AudioCue", ["label"]],
  ["RenderJob", ["stage"]],
  ["Evaluation", ["summary", "findings", "actions"]],
  ["LoraTrainRun", ["runLog"]],
];

let updated = 0;
for (const [table, columns] of TARGETS) {
  for (const col of columns) {
    const res = await db.$executeRawUnsafe(
      `UPDATE "${table}" SET "${col}" = REPLACE(REPLACE(REPLACE("${col}", '\u2014', '-'), '\u2013', '-'), '\u2015', '-') ` +
      `WHERE "${col}" LIKE '%\u2014%' OR "${col}" LIKE '%\u2013%' OR "${col}" LIKE '%\u2015%'`,
    );
    updated += res;
  }
}
console.log(`cleaned ${updated} database values`);
await db.$disconnect();
