"use client";

// ─────────────────────────────────────────────────────────────
// WEBTOON SLICE EXPORT (client-side compositor)
//
// Turns the episode's webtoon strip into platform-ready vertical
// slices (800px wide, ≤1280px tall — NAVER WEBTOON-style spec):
//   1. Each panel is redrawn on canvas at export resolution:
//      AI artwork (or the procedural sketch, serialized from the
//      live DOM), panel border, speech bubbles, SFX, narration
//      caption, shot chip.
//   2. Panels are packed boundary-aware into slices — a panel is
//      never cut in half; slices are white-backed and uniform.
//   3. Everything is zipped with a manifest.json and downloaded.
// No server round-trip: same-origin images and SVG data-URLs keep
// the canvas untainted.
// ─────────────────────────────────────────────────────────────

import JSZip from "jszip";
import { stripHeight, COMIC_FORMATS } from "@/lib/comic/layout";
import { parseDialogue, bubbleSpots } from "@/lib/comic/dialogue";

export interface SliceAudioCue {
  kind: string;
  label: string;
  startMs: number;
  durationMs: number;
}

export interface SliceShot {
  id: string;
  number: number;
  description: string;
  shotType: string;
  artworkUrl?: string | null;
  dialogue?: string | null;
  // metadata carried into the manifest for downstream motion-comic tooling
  loraName?: string | null;
  loraStrength?: number | null;
  artistName?: string | null;
  audioCues?: SliceAudioCue[];
}

export interface SliceExportOptions {
  projectName: string;
  episodeNumber: number;
  episodeTitle: string;
  shots: SliceShot[];
  onProgress?: (msg: string) => void;
}

const EXPORT_WIDTH = 800;   // platform-standard webtoon width
const SLICE_HEIGHT = 1280;  // max slice height
const PREVIEW_WIDTH = 504;  // DOM column width the strip heights assume (520 - 2×8 gutter)
const SCALE = EXPORT_WIDTH / PREVIEW_WIDTH;
const GAP = Math.round(16 * SCALE); // space-y-4 between panels

const SANS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, monospace`;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "animeos";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/** Serialize the live procedural sketch SVG for a panel into a rasterizable data URL. */
function svgDataUrlFor(shotId: string, w: number, h: number): string | null {
  const el = document.querySelector(`[data-shot-id="${CSS.escape(shotId)}"] svg`);
  if (!el) return null;
  const clone = el.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth || w;
  const ih = img.naturalHeight || h;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

interface PanelGeometry {
  w: number;
  h: number;
  ink: string;
  paper: string;
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  line: { speaker: string; text: string; kind: string },
  geo: PanelGeometry,
  spot: { top: number; left: number; tail: "bl" | "br" | "none" },
  prevBottom: number
): number {
  const { w, h, ink } = geo;
  const fontSize = Math.round(9 * SCALE);
  const speakerSize = Math.round(7.5 * SCALE);
  const padH = Math.round(6 * SCALE);
  const padV = Math.round(4 * SCALE);
  const lineHeight = Math.round(fontSize * 1.4);
  const maxBubbleW = w * 0.58;

  ctx.font = `${fontSize}px ${SANS}`;
  const wrapped = wrapText(ctx, line.text, maxBubbleW - padH * 2);
  const speakerH = line.speaker ? Math.round(speakerSize * 1.5) : 0;
  const bubbleH = padV * 2 + speakerH + wrapped.length * lineHeight;
  const textW = Math.max(...wrapped.map((l) => ctx.measureText(l).width));
  const bubbleW = Math.min(maxBubbleW, Math.max(textW + padH * 2, Math.round(fontSize * 3)));

  let x = spot.left * w;
  if (x + bubbleW > w - 8) x = w - 8 - bubbleW;
  let y = Math.max(spot.top * h, prevBottom + Math.round(8 * SCALE));
  const capZone = h * 0.74;
  if (y + bubbleH > capZone) y = Math.max(Math.round(6 * SCALE), capZone - bubbleH);

  // tail (under the bubble, drawn first so the bubble covers the joint)
  if (line.kind !== "SFX" && spot.tail !== "none") {
    const tailX = x + bubbleW * (spot.tail === "bl" ? 0.14 : 0.7);
    if (line.kind === "THOUGHT") {
      for (const [i, r] of [4.5, 3].entries()) {
        ctx.beginPath();
        ctx.arc(tailX + i * Math.round(6 * SCALE), y + bubbleH + 3 + i * Math.round(6 * SCALE), r * SCALE, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.setLineDash([4 * SCALE, 3 * SCALE]);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      const tw = Math.round(5 * SCALE);
      const th = Math.round(8 * SCALE);
      ctx.beginPath();
      ctx.moveTo(tailX - tw, y + bubbleH - 1);
      ctx.lineTo(tailX + tw, y + bubbleH - 1);
      ctx.lineTo(tailX, y + bubbleH + th);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tailX - tw, y + bubbleH);
      ctx.lineTo(tailX, y + bubbleH + th);
      ctx.lineTo(tailX + tw, y + bubbleH);
      ctx.stroke();
    }
  }

  // bubble body
  ctx.beginPath();
  if (line.kind === "THOUGHT") {
    const r = Math.round(14 * SCALE);
    ctx.roundRect(x, y, bubbleW, bubbleH, [r, r, r, Math.round(4 * SCALE)]);
  } else {
    ctx.roundRect(x, y, bubbleW, bubbleH, Math.round(12 * SCALE));
  }
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.setLineDash(line.kind === "THOUGHT" ? [5 * SCALE, 4 * SCALE] : []);
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, Math.round(1.5 * SCALE));
  ctx.stroke();
  ctx.setLineDash([]);

  // speaker + text
  let ty = y + padV;
  if (line.speaker) {
    ctx.font = `bold ${speakerSize}px ${SANS}`;
    ctx.fillStyle = "#6b6355";
    ctx.textAlign = "left";
    ctx.fillText(line.speaker.toUpperCase(), x + padH, ty + speakerSize);
    ty += speakerH;
  }
  ctx.font = `${fontSize}px ${SANS}`;
  ctx.fillStyle = "#171717";
  ctx.textAlign = "left";
  for (const l of wrapped) {
    ty += lineHeight;
    ctx.fillText(l, x + padH, ty - Math.round(lineHeight * 0.22));
  }
  return y + bubbleH;
}

function drawSfx(ctx: CanvasRenderingContext2D, text: string, geo: PanelGeometry, spot: { top: number; left: number }) {
  const size = Math.round(13 * SCALE);
  ctx.save();
  ctx.translate(spot.left * geo.w, spot.top * geo.h + size);
  ctx.rotate(-7 * (Math.PI / 180));
  ctx.font = `italic 900 ${size}px ${SANS}`;
  ctx.textAlign = "left";
  ctx.lineWidth = Math.round(4 * SCALE);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = geo.ink;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawPanel(ctx: CanvasRenderingContext2D, shot: SliceShot, geo: PanelGeometry, art: HTMLImageElement | null) {
  const { w, h, ink, paper } = geo;

  // art layer
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  if (art) drawCover(ctx, art, 0, 0, w, h);
  else {
    ctx.fillStyle = "#e8e8ee";
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${Math.round(11 * SCALE)}px ${SANS}`;
    ctx.fillStyle = "#8a8a96";
    ctx.textAlign = "center";
    ctx.fillText("art pending — regenerate panel", w / 2, h / 2);
    ctx.textAlign = "left";
  }

  // border
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);

  // speech bubbles (top-heavy spot pool, mirrors the DOM renderer)
  const lines = parseDialogue(shot.dialogue).slice(0, 3);
  const spots = bubbleSpots(lines.length);
  let prevBottom = 0;
  lines.forEach((line, i) => {
    const raw = spots[i] ?? spots[spots.length - 1];
    if (!raw) return;
    const spot = { top: parseFloat(raw.top) / 100, left: parseFloat(raw.left) / 100, tail: raw.tail };
    if (line.kind === "SFX") drawSfx(ctx, line.text, geo, spot);
    else prevBottom = drawSpeechBubble(ctx, line, geo, spot, prevBottom);
  });

  // shot number chip
  const chipSize = Math.round(9 * SCALE);
  ctx.font = `bold ${chipSize}px ${MONO}`;
  const label = String(shot.number).padStart(3, "0");
  const chipW = ctx.measureText(label).width + Math.round(8 * SCALE);
  const chipH = Math.round(chipSize * 1.6);
  ctx.fillStyle = ink;
  ctx.fillRect(Math.round(4 * SCALE), Math.round(28 * SCALE), chipW, chipH);
  ctx.fillStyle = paper;
  ctx.fillText(label, Math.round(4 * SCALE) + Math.round(4 * SCALE), Math.round(28 * SCALE) + chipH - Math.round(4 * SCALE));

  // narration caption (clamped when bubbles share the panel)
  const capFont = Math.round(9 * SCALE);
  ctx.font = `${capFont}px ${SANS}`;
  const capLines = wrapText(ctx, shot.description, w * 0.72 - Math.round(12 * SCALE)).slice(0, lines.length > 0 ? 1 : 2);
  const capH = capLines.length * Math.round(capFont * 1.4) + Math.round(6 * SCALE);
  const capW = Math.min(w * 0.76, Math.max(...capLines.map((l) => ctx.measureText(l).width)) + Math.round(12 * SCALE));
  const capX = Math.round(4 * SCALE);
  const capY = h - Math.round(24 * SCALE) - capH;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(capX, capY, capW, capH);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(capX, capY, capW, capH);
  ctx.fillStyle = "#171717";
  capLines.forEach((l, i) => {
    ctx.fillText(l, capX + Math.round(6 * SCALE), capY + Math.round(capFont * 1.3) * (i + 1) - Math.round(2 * SCALE));
  });
}

export async function exportWebtoonSlices(opts: SliceExportOptions): Promise<number> {
  const { projectName, episodeNumber, episodeTitle, shots, onProgress } = opts;
  if (shots.length === 0) throw new Error("No panels to export");

  const cfg = COMIC_FORMATS.MANHWA;
  const w = EXPORT_WIDTH;

  // 1. collect art for every panel (AI artwork, else the live procedural sketch)
  const artImages: Array<HTMLImageElement | null> = [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    onProgress?.(`Collecting panel art ${i + 1}/${shots.length}…`);
    try {
      if (shot.artworkUrl) {
        artImages.push(await loadImage(shot.artworkUrl));
        continue;
      }
      const h = Math.round(stripHeight(shot.shotType) * SCALE);
      const url = svgDataUrlFor(shot.id, w, h);
      artImages.push(url ? await loadImage(url) : null);
    } catch {
      artImages.push(null);
    }
  }

  // 2. pack panels boundary-aware into slices
  onProgress?.("Packing slices…");
  const blocks = shots.map((shot, i) => ({
    shot,
    art: artImages[i] ?? null,
    h: Math.round(stripHeight(shot.shotType) * SCALE),
  }));
  const packed: Array<Array<{ shot: SliceShot; art: HTMLImageElement | null; h: number }>> = [];
  let current: typeof blocks = [];
  let used = 0;
  for (const block of blocks) {
    if (current.length > 0 && used + block.h > SLICE_HEIGHT) {
      packed.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += block.h + GAP;
  }
  if (current.length) packed.push(current);

  // 3. rasterize slices
  const blobs: Array<{ index: number; file: string; blob: Blob; shotIds: Array<{ id: string; number: number; description: string }> }> = [];
  for (let s = 0; s < packed.length; s++) {
    onProgress?.(`Rendering slice ${s + 1}/${packed.length}…`);
    const sliceBlocks = packed[s];
    const contentH = sliceBlocks.reduce((n, b) => n + b.h, 0) + GAP * (sliceBlocks.length - 1);
    const sliceH = s === packed.length - 1 ? Math.max(200, contentH + GAP) : SLICE_HEIGHT;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = sliceH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");

    ctx.fillStyle = cfg.paper;
    ctx.fillRect(0, 0, w, sliceH);

    // each panel is painted on an offscreen canvas at origin, then blitted
    // into its final position — keeps drawPanel logic position-independent
    let ry = GAP;
    for (const block of sliceBlocks) {
      const panel = document.createElement("canvas");
      panel.width = w;
      panel.height = block.h;
      const pctx = panel.getContext("2d");
      if (pctx) {
        drawPanel(pctx, block.shot, { w, h: block.h, ink: cfg.ink, paper: cfg.paper }, block.art);
        ctx.drawImage(panel, 0, ry);
      }
      ry += block.h + GAP;
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Slice encoding failed");
    blobs.push({
      index: s,
      file: `EP${String(episodeNumber).padStart(2, "0")}_slice_${String(s + 1).padStart(2, "0")}.png`,
      blob,
      shotIds: sliceBlocks.map((b) => ({
        id: b.shot.id,
        number: b.shot.number,
        description: b.shot.description,
        artist: b.shot.artistName ?? null,
        styleLora: b.shot.loraName ? `${b.shot.loraName}@${(b.shot.loraStrength ?? 0.8).toFixed(2)}` : null,
        audioCues: b.shot.audioCues ?? [],
      })),
    });
  }

  // 4. zip + download
  onProgress?.("Packaging ZIP…");
  const allCues = shots.flatMap((s) => (s.audioCues ?? []).map((c) => ({ ...c, shotId: s.id })));
  const zip = new JSZip();
  for (const s of blobs) zip.file(s.file, s.blob);
  zip.file("manifest.json", JSON.stringify({
    project: projectName,
    episode: { number: episodeNumber, title: episodeTitle },
    exportSpec: { width: EXPORT_WIDTH, maxSliceHeight: SLICE_HEIGHT, format: "MANHWA (webtoon vertical)" },
    generatedAt: new Date().toISOString(),
    sliceCount: blobs.length,
    audio: {
      cueCount: allCues.length,
      kinds: allCues.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {}),
      // timing map for motion-comic authoring tools (millisecond timeline per panel)
      cuesByShot: allCues.reduce<Record<string, SliceAudioCue[]>>((acc, c) => {
        (acc[c.shotId] ??= []).push({ kind: c.kind, label: c.label, startMs: c.startMs, durationMs: c.durationMs });
        return acc;
      }, {}),
    },
    slices: blobs.map((s) => ({ index: s.index, file: s.file, panels: s.shotIds })),
  }, null, 2));

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(projectName)}-ep${String(episodeNumber).padStart(2, "0")}-webtoon-slices.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return blobs.length;
}
