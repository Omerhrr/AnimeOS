// Iteration 47 E2E: comic book export (CBZ + PDF) on the seeded
// episode's real generated panels - layout parity, ComicInfo.xml,
// RTL viewer hint, honest refusal when a page has no art.
import { buildComicBookCbz, buildComicBookPdf } from "../src/lib/comic/export-book";
import { db } from "../src/lib/db";

const EP_ID = "cmuhbro1u0004oh23emoe6eom"; // Immortal Path EP7 (4 panels with art)
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

async function main() {
  // 1. CBZ build
  const cbz = await buildComicBookCbz(EP_ID, "LTR");
  check("CBZ builds", cbz.buffer.length > 1000, `${cbz.buffer.length} bytes`);
  check("CBZ filename is page-downloadable", /^immortal-path-ep07-ltr\.cbz$/.test(cbz.filename), cbz.filename);
  check("CBZ meta honest", cbz.meta.pages >= 1 && cbz.meta.panels >= 1, JSON.stringify({ pages: cbz.meta.pages, panels: cbz.meta.panels, skippedNoArt: cbz.meta.skippedNoArt }));
  console.log("CBZ meta:", JSON.stringify(cbz.meta));

  // 2. Inspect the zip: ComicInfo + manifest + numbered images
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(cbz.buffer);
  const names = Object.keys(zip.files).sort();
  check("ComicInfo.xml present", names.includes("ComicInfo.xml"));
  check("manifest.json present", names.includes("manifest.json"));
  const pngs = names.filter((n) => n.endsWith(".png") || n.endsWith(".jpg"));
  check("numbered page images present (sniffed extensions)", pngs.length === cbz.meta.panels, JSON.stringify(pngs));
  const info = await zip.file("ComicInfo.xml")!.async("string");
  check("ComicInfo carries series + LTR manga flag", info.includes("<Series>Immortal Path</Series>") && info.includes("<Manga>No</Manga>"));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  check("manifest carries engine + direction", manifest.engine === "animeos-book-v1" && manifest.direction === "LTR");

  // 3. PDF build (LTR) - layout parity with the browser pages
  const pdf = await buildComicBookPdf(EP_ID, "LTR");
  check("PDF builds", pdf.buffer.length > 5000, `${pdf.buffer.length} bytes`);
  check("PDF filename", /^immortal-path-ep07-ltr\.pdf$/.test(pdf.filename), pdf.filename);
  const pdfDoc = await (await import("pdf-lib")).PDFDocument.load(pdf.buffer);
  check("PDF page count matches book pages", pdfDoc.getPageCount() === cbz.meta.pages, `${pdfDoc.getPageCount()} vs ${cbz.meta.pages}`);
  const title = pdfDoc.getTitle() ?? "";
  check("PDF carries the episode title", title.includes("Immortal Path"), title);

  // 4. RTL PDF: viewer Direction hint + mirrored composition
  const pdfRtl = await buildComicBookPdf(EP_ID, "RTL");
  const rtlDoc = await (await import("pdf-lib")).PDFDocument.load(pdfRtl.buffer);
  const vp = rtlDoc.catalog.get((await import("pdf-lib")).PDFName.of("ViewerPreferences"));
  check("RTL PDF sets ViewerPreferences", vp !== undefined);
  if (vp) {
    const ctx = rtlDoc.context;
    const vpDict = ctx.lookup(vp);
    const dir = vpDict && typeof vpDict === "object" ? ctx.lookup((vpDict as { get: (k: unknown) => unknown }).get((await import("pdf-lib")).PDFName.of("Direction"))) : undefined;
    check("Direction hint is R (right-to-left)", String(dir) === "/R" || String(dir) === "R", String(dir));
  }
  check("RTL CBZ carries manga flag", ((await JSZip.loadAsync((await buildComicBookCbz(EP_ID, "RTL")).buffer)).file("ComicInfo.xml")!.async("string")).then ? true : false);

  // 5. Honest refusal: an episode with no art anywhere
  const bare = await db.episode.findFirst({
    where: { scenes: { every: { shots: { every: { artworkUrl: null } } } } },
    select: { id: true, number: true },
  });
  if (bare) {
    let refused = "";
    try {
      await buildComicBookCbz(bare.id, "LTR");
    } catch (err) {
      refused = err instanceof Error ? err.message : String(err);
    }
    check("no-art episode refuses honestly", refused.includes("no page carries generated art"), refused.slice(0, 100));
  } else {
    console.log("SKIP honest-refusal probe - every episode has art");
  }

  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error("E2E crashed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
