// ─────────────────────────────────────────────────────────────
// Comic panel layout engine
// Turns episode/scene shot breakdowns into comic page layouts,
// natively supporting manhua (CN), manhwa/webtoon (KR) and manga (JP).
// Pure + deterministic: same shots always produce the same pages.
// ─────────────────────────────────────────────────────────────

export type ComicFormat = "MANHUA" | "MANHWA" | "MANGA";

export interface ComicFormatConfig {
  id: ComicFormat;
  label: string;
  origin: string;
  readingDirection: "LTR" | "RTL" | "VERTICAL";
  ink: string; // panel border color
  paper: string; // page paper tint
  gutter: number; // px between panels
  blurb: string;
}

export const COMIC_FORMATS: Record<ComicFormat, ComicFormatConfig> = {
  MANHUA: {
    id: "MANHUA",
    label: "Manhua",
    origin: "China",
    readingDirection: "LTR",
    ink: "#25335c",
    paper: "#f8f4e9",
    gutter: 10,
    blurb: "Full-colour cinematic pages, top-to-bottom flow — pairs with the donghua pipeline",
  },
  MANHWA: {
    id: "MANHWA",
    label: "Manhwa / Webtoon",
    origin: "Korea",
    readingDirection: "VERTICAL",
    ink: "#2b2b33",
    paper: "#fbfbfd",
    gutter: 16,
    blurb: "Vertical long-scroll strip, full-width panels, mobile-first reading",
  },
  MANGA: {
    id: "MANGA",
    label: "Manga",
    origin: "Japan",
    readingDirection: "RTL",
    ink: "#141414",
    paper: "#f4f2ec",
    gutter: 8,
    blurb: "Monochrome ink, right-to-left reading, screentone shading",
  },
};

// Minimal structural shape the engine needs (compatible with ShotRow)
export interface ShotLike {
  id: string;
  number: number;
  description: string;
  shotType: string;
  movement: string | null;
  duration: number;
  status: string;
}

// How much horizontal real estate a shot type demands on a page (1 = full row)
const WEIGHTS: Record<string, number> = {
  ESTABLISHING: 1.0,
  WIDE: 0.7,
  LOW_ANGLE: 0.7,
  MEDIUM: 0.5,
  CLOSEUP: 0.34,
  EXTREME_CLOSEUP: 0.26,
};

const DEFAULT_WEIGHT = 0.5;

export function panelWeight(shotType: string): number {
  return WEIGHTS[shotType] ?? DEFAULT_WEIGHT;
}

export interface PanelPlacement<T extends ShotLike = ShotLike> {
  shot: T;
  colStart: number; // 1-indexed, 6-col grid
  colSpan: number;
  rowSpan: number; // 1 or 2 (tall/dramatic panels)
  emphasis: boolean; // splash treatment
}

export interface ComicPage<T extends ShotLike = ShotLike> {
  sceneId: string;
  sceneNumber: number;
  sceneTitle: string;
  indexInScene: number;
  panels: PanelPlacement<T>[];
}

const PAGE_CAPACITY = 1.12;

// Layout templates per panel-count. Columns span out of 6.
// Variant rotation keeps consecutive pages from looking identical.
function templateFor(weights: number[], variant: number): Array<{ colStart: number; colSpan: number; rowSpan: number; emphasis: boolean }> {
  const n = weights.length;
  const flip = variant % 2 === 1;

  if (n === 1) return [{ colStart: 1, colSpan: 6, rowSpan: 2, emphasis: true }];

  if (n === 2) {
    const [a, b] = weights;
    if (a >= 0.6 && b >= 0.6) return [
      { colStart: 1, colSpan: 6, rowSpan: 1, emphasis: a >= 0.95 },
      { colStart: 1, colSpan: 6, rowSpan: 1, emphasis: false },
    ];
    if (a >= 0.6) return [
      { colStart: 1, colSpan: 4, rowSpan: 1, emphasis: false },
      { colStart: 5, colSpan: 2, rowSpan: 1, emphasis: false },
    ];
    if (b >= 0.6) return [
      { colStart: 1, colSpan: 2, rowSpan: 1, emphasis: false },
      { colStart: 3, colSpan: 4, rowSpan: 1, emphasis: false },
    ];
    return flip
      ? [{ colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false }, { colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false }]
      : [{ colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false }, { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false }];
  }

  if (n === 3) {
    const [a, b, c] = weights;
    if (a >= 0.7) return [
      { colStart: 1, colSpan: 6, rowSpan: 1, emphasis: a >= 0.95 },
      { colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false },
      { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false },
    ];
    if (c >= 0.7) return [
      { colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false },
      { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false },
      { colStart: 1, colSpan: 6, rowSpan: 1, emphasis: c >= 0.95 },
    ];
    if (a <= 0.4 && b <= 0.4 && c <= 0.4) return [
      { colStart: 1, colSpan: 2, rowSpan: 1, emphasis: false },
      { colStart: 3, colSpan: 2, rowSpan: 1, emphasis: false },
      { colStart: 5, colSpan: 2, rowSpan: 1, emphasis: false },
    ];
    return flip
      ? [
          { colStart: 1, colSpan: 3, rowSpan: 2, emphasis: false },
          { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false },
          { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false },
        ]
      : [
          { colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false },
          { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false },
          { colStart: 1, colSpan: 6, rowSpan: 1, emphasis: false },
        ];
  }

  if (n === 4) {
    if (weights[0] >= 0.7) return [
      { colStart: 1, colSpan: 6, rowSpan: 1, emphasis: weights[0] >= 0.95 },
      { colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false },
      { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false },
      { colStart: 1, colSpan: 6, rowSpan: 1, emphasis: false },
    ];
    return flip
      ? [
          { colStart: 1, colSpan: 2, rowSpan: 2, emphasis: false },
          { colStart: 3, colSpan: 4, rowSpan: 1, emphasis: false },
          { colStart: 3, colSpan: 2, rowSpan: 1, emphasis: false },
          { colStart: 5, colSpan: 2, rowSpan: 1, emphasis: false },
        ]
      : [
          { colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false },
          { colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false },
          { colStart: 1, colSpan: 2, rowSpan: 1, emphasis: false },
          { colStart: 3, colSpan: 4, rowSpan: 1, emphasis: false },
        ];
  }

  // 5+ panels: dense action page — rows of pairs/thirds, last panel wide
  const rows: Array<{ colStart: number; colSpan: number; rowSpan: number; emphasis: boolean }> = [];
  let i = 0;
  while (i < n - 2) {
    rows.push({ colStart: 1, colSpan: 3, rowSpan: 1, emphasis: false });
    rows.push({ colStart: 4, colSpan: 3, rowSpan: 1, emphasis: false });
    i += 2;
  }
  // remaining 1-2 panels: one wide + one small (or two halves)
  if (n - i === 1) {
    rows.push({ colStart: 1, colSpan: 6, rowSpan: 1, emphasis: weights[n - 1] >= 0.7 });
  } else {
    rows.push({ colStart: 1, colSpan: 4, rowSpan: 1, emphasis: false });
    rows.push({ colStart: 5, colSpan: 2, rowSpan: 1, emphasis: false });
  }
  return rows;
}

/**
 * Greedy page packer: accumulates shots until the page capacity is reached,
 * then assigns each page a deterministic template (variant rotates per page).
 * Dramatic establishing shots get their own splash page.
 */
export function layoutScene<T extends ShotLike>(scene: { id: string; number: number; title: string }, shots: T[]): ComicPage<T>[] {
  const sorted = [...shots].sort((a, b) => a.number - b.number);
  const pages: Array<T[]> = [];
  let current: T[] = [];
  let used = 0;

  const flush = () => {
    if (current.length > 0) pages.push(current);
    current = [];
    used = 0;
  };

  for (const shot of sorted) {
    const w = panelWeight(shot.shotType);
    if (current.length > 0 && used + w > PAGE_CAPACITY) flush();
    // dramatic establishing shots get their own splash page
    if (w >= 1 && current.length > 0) flush();
    current.push(shot);
    used += w;
    if (w >= 1) flush(); // splash closes the page
  }
  flush();

  return pages.map((pageShots, idx) => {
    const weights = pageShots.map((s) => panelWeight(s.shotType));
    const tpl = templateFor(weights, idx);
    return {
      sceneId: scene.id,
      sceneNumber: scene.number,
      sceneTitle: scene.title,
      indexInScene: idx,
      panels: pageShots.map((shot, i) => ({
        shot,
        colStart: tpl[i]?.colStart ?? 1,
        colSpan: tpl[i]?.colSpan ?? 6,
        rowSpan: tpl[i]?.rowSpan ?? 1,
        emphasis: tpl[i]?.emphasis ?? false,
      })),
    };
  });
}

/** Webtoon strip: every panel is a full-width row; height varies by shot type. */
export function stripHeight(shotType: string): number {
  switch (shotType) {
    case "ESTABLISHING": return 220;
    case "WIDE": return 180;
    case "LOW_ANGLE": return 170;
    case "MEDIUM": return 140;
    case "CLOSEUP": return 110;
    case "EXTREME_CLOSEUP": return 90;
    default: return 140;
  }
}

export const DYNAMIC_MOVEMENTS = new Set(["PAN", "TRACKING", "DOLLY_IN", "ORBIT", "CRANE"]);
