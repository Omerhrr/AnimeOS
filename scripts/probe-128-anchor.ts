// THE EYE BEFORE THE PEN (iteration 128) - quick module probe of the
// design anchor law before the proofs are written.
import { planSheetConformance, relLum } from "../src/lib/blender/sheet-palette";

const palette = ["#9bbcb3", "#dfe4ec", "#476565", "#0d0d0d", "#a8842c"];
// the named case: the sheet-read pale robe vs the committed jade design
const rows = planSheetConformance(
  { robe: "#9bbcb3", accent: "#3f8f7a", hair: "#0d0d0d", boots: "#241a12" },
  palette,
  0.75,
  undefined,
  { robe: "#2f6d63", accent: "#3f8f7a", hair: "#16161d" },
);
for (const r of rows) {
  console.log(`${r.role.padEnd(7)} ${r.from} -> ${r.to}  d=${r.delta.toFixed(3)}${r.skipped ? "  SKIP " + r.skipped.slice(0, 40) : ""}${r.anchored ? "  ANCHOR " + r.anchored.slice(0, 72) : ""}`);
}
console.log("relLum #9bbcb3", relLum("#9bbcb3").toFixed(3), "relLum #2f6d63", relLum("#2f6d63").toFixed(3));
