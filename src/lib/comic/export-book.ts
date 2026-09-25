// ─────────────────────────────────────────────────────────────
// COMIC BOOK EXPORT (CBZ + PDF)
//
// The comic's page layout engine (comic/layout.ts, pure and
// deterministic - the SAME function the browser reads with) drives
// a server-side book build: pages assemble from the episode's
// scenes/shots in canonical order, panels pull their generated art
// from public/panels/ through the same guarded file resolution the
// cut builder uses, and the book lands as
//   CBZ - a ZIP of page-numbered images plus a ComicInfo.xml the
//         standard readers honor (Manga flag carries the RTL
//         binding for Japanese-format productions)
//   PDF - a composed book: panels drawn on real pages at their
//         grid placements, mirrored right-to-left when the binding
//         is RTL, with a ViewerPreferences Direction hint
// Honesty rules: shots without generated art are skipped and
// COUNTED (never silently dropped, never placeholder-boxed), an
// episode with no art at all refuses with a clear error.
// ─────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument, PDFName, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { layoutScene, type ShotLike } from "@/lib/comic/layout";

export type BookFormat = "CBZ" | "PDF";
export type BookDirection = "LTR" | "RTL";

export interface BookMeta {
  format: BookFormat;
  direction: BookDirection;
  title: string;
  episodeNumber: number;
  pages: number;
  panels: number;
  skippedNoArt: number;
  skippedEmptyPages: number;
  note: string;
}

export interface BookBuildResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  meta: BookMeta;
}

interface BookPanel {
  shot: ShotLike & { artworkUrl?: string | null };
  colStart: number;
  colSpan: number;
  rowSpan: number;
  emphasis: boolean;
  filePath: string | null; // resolved /panels/ file on disk
  width: number; // px
  height: number;
  kind: "png" | "jpg"; // REAL content format (sniffed, not the filename)
}

interface BookPage {
  pageNumber: number;
  sceneNumber: number;
  sceneTitle: string;
  panels: BookPanel[];
}

// Image probing without an image library: PNG dims from the IHDR
// chunk (bytes 16..24), JPEG dims from the SOF marker scan. The art
// provider saves JPEG bytes under .png names, so the engine sniffs
// the REAL format everywhere (dims, PDF embedding, CBZ naming).
interface ImageInfo {
  kind: "png" | "jpg";
  width: number;
  height: number;
}

function imageInfo(bytes: Buffer): ImageInfo | null {
  if (bytes.length < 24) return null;
  if (bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    return width && height ? { kind: "png", width, height } : null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    // JPEG: walk segments to the first SOF0..SOF3/15 (skip DHT etc.)
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) {
        off += 1;
        continue;
      }
      const marker = bytes[off + 1];
      // SOF0, SOF1, SOF2 (progressive), SOF3..SOF7, SOF9..SOF11 carry dims
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = bytes.readUInt16BE(off + 5);
        const width = bytes.readUInt16BE(off + 7);
        return width && height ? { kind: "jpg", width, height } : null;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        off += 2;
        continue;
      }
      const len = bytes.readUInt16BE(off + 2);
      off += 2 + len;
    }
    return null;
  }
  return null;
}

function imageExtension(kind: "png" | "jpg"): string {
  return kind === "png" ? ".png" : ".jpg";
}

// Same guarded public-file resolution the cut builder uses: strip
// the ?v= cache-buster, pin the prefix, refuse traversal.
function publicFile(url: string, allowedPrefix: string): string | null {
  const clean = String(url).split("?")[0];
  if (!clean.startsWith(allowedPrefix) || clean.includes("..")) return null;
  const abs = path.join(process.cwd(), "public", clean.replace(/^\//, ""));
  return fs.existsSync(abs) ? abs : null;
}

export function slugifyTitle(title: string): string {
  return (
    String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "production"
  );
}

// ─── Page collection (episode -> ordered book pages) ───────────

export async function collectEpisodeBook(episodeId: string, direction: BookDirection) {
  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    select: {
      number: true,
      title: true,
      season: { select: { number: true, project: { select: { title: true, logline: true, visualStyle: true } } } },
      scenes: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          title: true,
          shots: {
            orderBy: { number: "asc" },
            select: {
              id: true, number: true, description: true, shotType: true,
              movement: true, duration: true, status: true, artworkUrl: true,
            },
          },
        },
      },
    },
  });
  if (!episode) throw new Error("Episode not found");

  const pages: BookPage[] = [];
  let pageNumber = 1;
  let skippedNoArt = 0;
  let laidPageCount = 0;

  for (const scene of episode.scenes) {
    // The SAME pure layout the browser renders - one layout, two media.
    const laid = layoutScene(
      { id: String((scene as unknown as { id: string }).id ?? scene.number), number: scene.number, title: scene.title },
      scene.shots as ShotLike[],
    );
    laidPageCount += laid.length;
    for (const page of laid) {
      const panels: BookPanel[] = page.panels.map((p) => {
        const shot = p.shot as ShotLike & { artworkUrl?: string | null };
        const filePath = shot.artworkUrl ? publicFile(shot.artworkUrl, "/panels/") : null;
        if (shot.artworkUrl && !filePath) skippedNoArt += 1;
        let width = 1152;
        let height = 864;
        let kind: "png" | "jpg" = "png";
        if (filePath) {
          const bytes = fs.readFileSync(filePath);
          const info = imageInfo(bytes);
          if (info) {
            kind = info.kind;
            width = info.width;
            height = info.height;
          }
        }
        return { shot, colStart: p.colStart, colSpan: p.colSpan, rowSpan: p.rowSpan, emphasis: p.emphasis, filePath, width, height, kind };
      });
      const withArt = panels.filter((p) => p.filePath);
      if (withArt.length === 0) continue; // an all-empty page never ships
      pages.push({
        pageNumber: pageNumber++,
        sceneNumber: scene.number,
        sceneTitle: scene.title,
        panels,
      });
    }
  }

  const meta: BookMeta = {
    format: "CBZ",
    direction,
    title: episode.season.project.title,
    episodeNumber: episode.number,
    pages: pages.length,
    panels: pages.reduce((n, p) => n + p.panels.filter((x) => x.filePath).length, 0),
    skippedNoArt,
    skippedEmptyPages: Math.max(0, laidPageCount - pages.length),
    note:
      pages.length === 0
        ? "no page carries generated art yet - generate panel art first"
        : `${pages.length} page(s) assembled from the same layout engine the browser reads`,
  };

  return { episode, pages, meta };
}

// ─── CBZ ────────────────────────────────────────────────────────

export async function buildComicBookCbz(episodeId: string, direction: BookDirection): Promise<BookBuildResult> {
  const { episode, pages, meta } = await collectEpisodeBook(episodeId, direction);
  if (pages.length === 0) {
    throw new Error(meta.note);
  }
  const zip = new JSZip();

  for (const page of pages) {
    let slot = 0;
    for (const panel of page.panels) {
      if (!panel.filePath) continue;
      slot += 1;
      // Page-numbered, panel-suffixed when a page carries several
      // pieces of art (readers sort lexicographically). Named by the
      // REAL sniffed format - the provider saves JPEG bytes under .png.
      const ext = imageExtension(panel.kind);
      const name =
        page.panels.filter((p) => p.filePath).length > 1
          ? `${String(page.pageNumber).padStart(3, "0")}-${String(slot).padStart(2, "0")}${ext}`
          : `${String(page.pageNumber).padStart(3, "0")}${ext}`;
      zip.file(name, fs.readFileSync(panel.filePath));
    }
  }

  const mangaFlag = direction === "RTL" ? "YesAndRightToLeft" : "No";
  zip.file(
    "ComicInfo.xml",
    `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Series>${escapeXml(episode.season.project.title)}</Series>
  <Title>EP${String(episode.number).padStart(2, "0")} ${escapeXml(episode.title)}</Title>
  <Number>${episode.number}</Number>
  <PageCount>${pages.length}</PageCount>
  <Manga>${mangaFlag}</Manga>
  <BlackAndWhite>No</BlackAndWhite>
  <Notes>Assembled by AnimeOS from the episode's own panel layout engine. Reading direction ${direction}. Panels without generated art are skipped and counted in the build manifest.</Notes>
</ComicInfo>
`,
  );

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        engine: "animeos-book-v1",
        direction,
        series: episode.season.project.title,
        episode: { number: episode.number, title: episode.title },
        pages: pages.map((p) => ({
          pageNumber: p.pageNumber,
          scene: p.sceneNumber,
          panels: p.panels.filter((x) => x.filePath).length,
          skippedNoArt: p.panels.filter((x) => !x.filePath).length,
        })),
        totals: { pages: pages.length, panels: meta.panels, skippedNoArt: meta.skippedNoArt },
      },
      null,
      2,
    ),
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const filename = `${slugifyTitle(episode.season.project.title)}-ep${String(episode.number).padStart(2, "0")}-${direction.toLowerCase()}.cbz`;

  return {
    buffer,
    filename,
    contentType: "application/vnd.comicbook+zip",
    meta: { ...meta, format: "CBZ" },
  };
}

function escapeXml(s: string): string {
  return String(s).replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

// ─── PDF ────────────────────────────────────────────────────────

const PAGE_WIDTH = 1200; // composition px (6-col grid)
const GUTTER = 10;
const MARGIN = 24;
const COL = (PAGE_WIDTH - MARGIN * 2 - GUTTER * 5) / 6;

export async function buildComicBookPdf(episodeId: string, direction: BookDirection): Promise<BookBuildResult> {
  const { episode, pages, meta } = await collectEpisodeBook(episodeId, direction);
  if (pages.length === 0) {
    throw new Error(meta.note);
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${episode.season.project.title} - EP${String(episode.number).padStart(2, "0")} ${episode.title}`);
  pdf.setProducer("AnimeOS book export");
  pdf.setCreator("AnimeOS (Next.js) + pdf-lib");

  if (direction === "RTL") {
    // Viewer hint: page turns advance right-to-left (manga binding).
    const viewerPrefs = pdf.context.obj({ Direction: PDFName.of("R") });
    pdf.catalog.set(PDFName.of("ViewerPreferences"), viewerPrefs);
  }

  const font = await pdf.embedFont("Times-Roman");

  for (const page of pages) {
    const arted = page.panels.filter((p) => p.filePath);
    // Split placements into rows: every row starts at colStart 1.
    const rows: BookPanel[][] = [];
    for (const panel of arted) {
      const last = rows[rows.length - 1];
      if (!last || panel.colStart <= last[last.length - 1].colStart) rows.push([panel]);
      else last.push(panel);
    }

    const rowHeights = rows.map((row) => {
      const natural = Math.max(
        ...row.map((p) => {
          const panelWidth = COL * p.colSpan + GUTTER * (p.colSpan - 1);
          const h = panelWidth / (p.width / p.height);
          return p.rowSpan === 2 ? h * 1.5 : h; // tall/dramatic panels breathe
        }),
      );
      return Math.min(natural, PAGE_WIDTH * 0.9); // a 1344x768 establishing panel never owns an infinite page
    });
    const pageHeight = Math.round(
      MARGIN * 2 + rowHeights.reduce((a, b) => a + b, 0) + GUTTER * Math.max(0, rows.length - 1),
    );

    const pdfPage = pdf.addPage([PAGE_WIDTH, pageHeight]);
    pdfPage.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: pageHeight, color: rgb(0.968, 0.956, 0.925) });

    let y = pageHeight - MARGIN;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] as BookPanel[];
      const rowWidth = row.reduce((a, p) => a + COL * p.colSpan + GUTTER * (p.colSpan - 1), 0) + GUTTER * Math.max(0, row.length - 1);
      // Center the row; walk it in reading order (RTL mirrors x).
      let cursor = (PAGE_WIDTH - rowWidth) / 2;
      for (const panel of row) {
        const w = COL * panel.colSpan + GUTTER * (panel.colSpan - 1);
        const h = rowHeights[rowIdx] as number;
        const bytes = fs.readFileSync(panel.filePath as string);
        // Embed by REAL sniffed format, not by filename (the provider
        // saves JPEG bytes under .png names).
        const img = panel.kind === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const x = direction === "RTL" ? PAGE_WIDTH - cursor - w : cursor;
        pdfPage.drawImage(img, { x, y: y - h, width: w, height: h });
        pdfPage.drawRectangle({
          x,
          y: y - h,
          width: w,
          height: h,
          borderColor: rgb(0.08, 0.08, 0.08),
          borderWidth: direction === "RTL" ? 1.6 : 1.4,
        });
        cursor += w + GUTTER;
      }
      y -= rowHeights[rowIdx] + GUTTER;
    }

    // Page footer: number + scene, on the outer edge.
    const label = `${page.pageNumber}`;
    pdfPage.drawText(label, {
      x: direction === "RTL" ? MARGIN : PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(label, 9),
      y: MARGIN / 2,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  const bytes = await pdf.save();
  const filename = `${slugifyTitle(episode.season.project.title)}-ep${String(episode.number).padStart(2, "0")}-${direction.toLowerCase()}.pdf`;

  return {
    buffer: Buffer.from(bytes),
    filename,
    contentType: "application/pdf",
    meta: { ...meta, format: "PDF" },
  };
}

export async function buildComicBook(episodeId: string, format: BookFormat, direction: BookDirection): Promise<BookBuildResult> {
  return format === "PDF" ? buildComicBookPdf(episodeId, direction) : buildComicBookCbz(episodeId, direction);
}
