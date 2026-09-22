"use client";

// Procedural panel sketches for the comic view.
// Deterministic per shot number — same shot always sketches the same art.
// Art style adapts to the comic format: manhua ink-wash colour,
// manhwa flat pastel, manga monochrome + screentone.

import { useMemo } from "react";
import type { ComicFormat } from "@/lib/comic/layout";

const PALETTES: Record<ComicFormat, { sky: string; far: string; near: string; figure: string; accent: string; mono: boolean }> = {
  MANHUA: { sky: "#dbe7f3", far: "#9db4cf", near: "#3d5a80", figure: "#22304a", accent: "#4f8a8b", mono: false },
  MANHWA: { sky: "#e8e4f0", far: "#c3b8dc", near: "#7a6fa8", figure: "#413a5c", accent: "#e0a899", mono: false },
  MANGA: { sky: "#efefef", far: "#c9c9c9", near: "#5a5a5a", figure: "#1c1c1c", accent: "#8a8a8a", mono: true },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PanelArtProps {
  shotType: string;
  movement: string | null;
  weather: string | null;
  timeOfDay: string | null;
  seed: number;
  format: ComicFormat;
}

export function PanelArt({ shotType, movement, weather, timeOfDay, seed, format }: PanelArtProps) {
  const art = useMemo(() => {
    const rnd = mulberry32(seed * 2654435761);
    const pal = PALETTES[format];
    const night = (timeOfDay ?? "").toUpperCase().includes("NIGHT");
    const rain = (weather ?? "").toLowerCase().includes("rain");
    const storm = (weather ?? "").toLowerCase().includes("storm") || (weather ?? "").toLowerCase().includes("lightning");
    const sky = night && !pal.mono ? "#2a3350" : pal.sky;

    const elements: React.ReactNode[] = [];
    const speed = movement && ["PAN", "TRACKING", "DOLLY_IN", "ORBIT", "CRANE"].includes(movement);

    // Sky / base wash
    elements.push(<rect key="bg" x="0" y="0" width="100" height="60" fill={sky} />);

    if (shotType === "ESTABLISHING" || shotType === "WIDE") {
      const horizon = 34 + rnd() * 6;
      // sun / moon
      const cx = 20 + rnd() * 60;
      elements.push(<circle key="sun" cx={cx} cy={night ? 16 : 14} r={night ? 4 : 5} fill={pal.mono ? "#d8d8d8" : night ? "#e8e3d0" : "#f2e9c9"} opacity="0.9" />);
      // far ridge
      let d = `M0 ${horizon}`;
      for (let x = 0; x <= 100; x += 12) d += ` L${x + 6} ${horizon - 8 - rnd() * 10} L${x + 12} ${horizon}`;
      d += ` L100 60 L0 60 Z`;
      elements.push(<path key="far" d={d} fill={pal.far} opacity="0.75" />);
      // near ridge
      let d2 = `M0 ${horizon + 8}`;
      for (let x = 0; x <= 100; x += 18) d2 += ` L${x + 9} ${horizon - 2 - rnd() * 12} L${x + 18} ${horizon + 8}`;
      d2 += ` L100 60 L0 60 Z`;
      elements.push(<path key="near" d={d2} fill={pal.near} opacity="0.9" />);
      elements.push(<rect key="ground" y={horizon + 8} width="100" height={60 - horizon - 8} fill={pal.near} />);
      // lone pagoda silhouette (donghua flavour)
      const px = 12 + rnd() * 76;
      elements.push(
        <g key="pagoda" fill={pal.figure} opacity="0.85">
          <rect x={px - 1} y={horizon - 12} width="2" height="10" />
          <rect x={px - 4} y={horizon - 13} width="8" height="1.6" />
          <rect x={px - 3} y={horizon - 17} width="6" height="4" />
          <rect x={px - 5} y={horizon - 18} width="10" height="1.4" />
        </g>
      );
    } else if (shotType === "LOW_ANGLE") {
      // looking up: figure looming, clouds behind
      for (let i = 0; i < 3; i++) {
        const cy = 12 + i * 14 + rnd() * 4;
        elements.push(<ellipse key={`cl${i}`} cx={15 + rnd() * 70} cy={cy} rx={14 + rnd() * 10} ry={5 + rnd() * 3} fill={pal.mono ? "#e2e2e2" : "#ffffff"} opacity="0.5" />);
      }
      elements.push(
        <g key="fig" fill={pal.figure}>
          <circle cx="50" cy="34" r="9" />
          <path d="M34 60 Q36 46 50 45 Q64 46 66 60 Z" />
          <path d="M38 30 Q40 20 50 20 Q60 20 62 30 Q56 24 50 24 Q44 24 38 30 Z" fill={pal.accent} opacity="0.8" />
        </g>
      );
    } else if (shotType === "EXTREME_CLOSEUP") {
      // the eye
      elements.push(<ellipse key="eye" cx="50" cy="30" rx="30" ry="14" fill={pal.mono ? "#f5f5f5" : "#fdfbf5"} stroke={pal.figure} strokeWidth="1.4" />);
      elements.push(<circle key="iris" cx="50" cy="30" r="8" fill={pal.accent} opacity={pal.mono ? 0.55 : 0.9} />);
      elements.push(<circle key="pupil" cx="50" cy="30" r="3.6" fill={pal.figure} />);
      elements.push(<circle key="glint" cx="47.5" cy="27.5" r="1.6" fill="#ffffff" />);
      elements.push(<path key="lid" d="M20 30 Q50 12 80 30" fill="none" stroke={pal.figure} strokeWidth="1.6" />);
      elements.push(<path key="lid2" d="M22 33 Q50 44 78 33" fill="none" stroke={pal.figure} strokeWidth="1" opacity="0.7" />);
    } else if (shotType === "CLOSEUP") {
      // head + shoulders
      elements.push(<rect key="wash" x="0" y="0" width="100" height="60" fill={pal.mono ? "#e6e6e6" : pal.far} opacity="0.35" />);
      elements.push(
        <g key="fig" fill={pal.figure}>
          <circle cx="50" cy="32" r="13" />
          <path d="M28 60 Q32 46 50 46 Q68 46 72 60 Z" />
        </g>
      );
      elements.push(<path key="hair" d="M37 30 Q39 17 50 17 Q61 17 63 30 Q56 22 50 22 Q44 22 37 30 Z" fill={pal.accent} opacity="0.85" />);
    } else {
      // MEDIUM + default: three-quarter figure
      elements.push(<rect key="wash" x="0" y="0" width="100" height="60" fill={pal.mono ? "#e9e9e9" : pal.far} opacity="0.3" />);
      elements.push(
        <g key="fig" fill={pal.figure}>
          <circle cx="48" cy="26" r="8" />
          <path d="M36 60 Q38 40 48 38 Q58 40 60 60 Z" />
          <path d="M58 44 L72 34 L74 37 L60 47 Z" />
        </g>
      );
      // sword energy arc (donghua flavour)
      elements.push(<path key="qi" d="M64 40 Q78 30 88 16" fill="none" stroke={pal.accent} strokeWidth="2.4" opacity="0.75" strokeLinecap="round" />);
      elements.push(<path key="qi2" d="M66 44 Q80 36 92 24" fill="none" stroke={pal.accent} strokeWidth="1" opacity="0.4" strokeLinecap="round" />);
    }

    // speed lines for dynamic movement
    if (speed) {
      const lines: React.ReactNode[] = [];
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + rnd() * 0.2;
        const r1 = 34 + rnd() * 8;
        const x1 = 50 + Math.cos(ang) * r1 * 1.6;
        const y1 = 30 + Math.sin(ang) * r1;
        const x2 = 50 + Math.cos(ang) * 90;
        const y2 = 30 + Math.sin(ang) * 56;
        lines.push(<line key={`sp${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={pal.mono ? "#3a3a3a" : pal.figure} strokeWidth={0.7 + rnd() * 0.6} opacity="0.4" />);
      }
      elements.push(<g key="speed">{lines}</g>);
    }

    // rain / storm hatching
    if (rain || storm) {
      const drops: React.ReactNode[] = [];
      for (let i = 0; i < 26; i++) {
        const x = rnd() * 100;
        const y = rnd() * 60;
        drops.push(<line key={`r${i}`} x1={x} y1={y} x2={x - 1.6} y2={y + 4.5} stroke={pal.mono ? "#555" : "#7d90b5"} strokeWidth="0.55" opacity="0.6" />);
      }
      elements.push(<g key="rain">{drops}</g>);
      if (storm) {
        elements.push(
          <path key="bolt" d="M70 4 L62 20 L68 20 L58 38 L66 22 L60 22 Z" fill={pal.mono ? "#2c2c2c" : "#f3e27e"} opacity="0.9" />
        );
      }
    }

    // manga screentone overlay
    if (pal.mono) {
      elements.push(
        <g key="tone" opacity="0.16">
          <defs>
            <pattern id={`tone-${seed}`} width="3" height="3" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="0.55" fill="#222" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="60" fill={`url(#tone-${seed})`} />
        </g>
      );
    }

    return elements;
  }, [shotType, movement, weather, timeOfDay, seed, format]);

  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      {art}
    </svg>
  );
}
