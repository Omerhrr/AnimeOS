"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import { X, Play, Pause, SkipBack, SkipForward, Loader2, Mountain } from "lucide-react";
import { api, type CharacterDesignDnaView, type EnvironmentDesignDnaView } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { StatusBadge, SHOT_TYPE_LABELS } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// BROWSER 3D PREVIEW (§37 / §42.1 design pass)
// Three.js is NOT the production renderer - it is the browser
// preview layer. The scene is built from live production state AND
// the production's DESIGN DNA (the same compiled character and
// environment structures the Blender worker renders from): the cast
// figure carries the character's hair, robes, accent and weapon
// energy; the set is the scene's environment (terrain, features,
// sky, weather). Camera grammar and render params come from the
// shot list and the scene's live tuning.
// ─────────────────────────────────────────────────────────────

interface ShotSpec {
  id: string;
  number: number;
  shotType: string;
  movement: string | null;
  duration: number;
  description: string;
  status: string;
  lens: string | null;
}

const RADII: Record<string, number> = {
  ESTABLISHING: 30, WIDE: 20, MEDIUM: 11, CLOSEUP: 5.5, EXTREME_CLOSEUP: 3.5, LOW_ANGLE: 7,
};
const HEIGHTS: Record<string, number> = {
  ESTABLISHING: 10, WIDE: 5, MEDIUM: 3.2, CLOSEUP: 3.6, EXTREME_CLOSEUP: 3.8, LOW_ANGLE: 1.2,
};

function cloudTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "rgba(210,225,235,0.55)");
  g.addColorStop(0.5, "rgba(180,200,215,0.22)");
  g.addColorStop(1, "rgba(160,185,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeRain(count: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = Math.random() * 30;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9fb8c8, size: 0.05, transparent: true, opacity: 0.35, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function makeSnow(count: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = Math.random() * 26;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe8eef8, size: 0.11, transparent: true, opacity: 0.65, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function makeEnergy(count: number, radius: number, color: string): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed: number[] = [];
  for (let i = 0; i < count; i++) {
    seed.push(Math.random() * Math.PI * 2, Math.random(), Math.random() * 0.6 + 0.4);
    pos[i * 3 + 1] = 0;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(color), size: 0.09, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.seed = seed;
  pts.userData.radius = radius;
  return pts;
}

// ── the DESIGNED figure (same DNA the Blender worker renders) ──

interface FigureRig {
  group: THREE.Group;
  weapon: THREE.Group | null;
  energy: THREE.Points | null;
  hair: THREE.Object3D | null;
}

function buildFigure(dna: CharacterDesignDnaView): FigureRig {
  const group = new THREE.Group();
  const robeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.robeColor), roughness: 0.82, metalness: 0.08 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.robeAccent), roughness: 0.65, metalness: 0.15 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.skinTone), roughness: 0.62 });
  const hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.hairColor), roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.8 });

  const scale = dna.build === "sturdy" ? 1.12 : dna.build === "heavy" ? 1.24 : 0.96;

  // robe body: layered cone + chest + sash
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.6 * scale, 2.0, 14), robeMat);
  robe.position.y = 1.0;
  group.add(robe);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.33 * scale, 14, 14), robeMat);
  chest.position.y = 2.0;
  chest.scale.set(1, 0.85, 0.8);
  group.add(chest);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.33 * scale, 0.045, 8, 20), accentMat);
  sash.position.y = 1.62;
  sash.rotation.x = Math.PI / 2;
  group.add(sash);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.66 * scale, 1.1, 12, 1, true), robeMat);
  skirt.position.y = 1.05;
  group.add(skirt);

  // head + hair per DNA
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 18), skinMat);
  head.position.y = 2.56;
  group.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.265, 16, 16), hairMat);
  hairCap.position.set(0, 2.62, 0.02);
  hairCap.scale.set(1, 0.9, 1);
  group.add(hairCap);
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 12), hairMat);
  hairBack.position.set(0, 2.44, 0.16);
  hairBack.scale.set(1, 1.3, 0.7);
  group.add(hairBack);
  let hair: THREE.Object3D = hairCap;
  const style = dna.hairStyle;
  if (style === "topknot") {
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 10), hairMat);
    knot.position.set(0, 2.88, 0);
    group.add(knot);
    hair = knot;
  } else if (style === "ponytail") {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 10), hairMat);
    tail.position.set(0, 2.26, 0.3);
    tail.rotation.x = -0.35;
    group.add(tail);
    hair = tail;
  } else if (style === "braid") {
    const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 10), hairMat);
    braid.position.set(0.06, 2.2, 0.24);
    braid.rotation.x = -0.2;
    group.add(braid);
    hair = braid;
  } else if (style === "long") {
    const mane = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 12), hairMat);
    mane.position.set(0, 2.14, 0.2);
    mane.scale.set(1, 1, 0.55);
    group.add(mane);
    hair = mane;
  }

  // arms (robe sleeves) + hands
  const armGeoL = new THREE.CylinderGeometry(0.06, 0.085 * scale, 0.95, 10);
  const armL = new THREE.Mesh(armGeoL, robeMat);
  armL.position.set(-0.42 * scale, 1.85, 0.1);
  armL.rotation.z = 0.5;
  group.add(armL);
  const armR = new THREE.Mesh(armGeoL.clone(), robeMat);
  armR.position.set(0.44 * scale, 1.95, 0.05);
  armR.rotation.z = -0.85;
  group.add(armR);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), skinMat);
  handL.position.set(-0.62 * scale, 1.42, 0.12);
  group.add(handL);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), skinMat);
  handR.position.set(0.68 * scale, 1.52, 0.08);
  group.add(handR);

  // weapon per DNA, gripped in the right hand
  let weapon: THREE.Group | null = null;
  const bladeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.bladeColor), emissive: new THREE.Color(dna.bladeColor),
    emissiveIntensity: 1.3, metalness: 0.85, roughness: 0.2,
  });
  if (dna.weaponType === "sword") {
    weapon = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.42, 0.016), bladeMat);
    blade.position.y = -0.82;
    weapon.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), accentMat);
    weapon.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.3, 8), darkMat);
    grip.position.y = 0.18;
    weapon.add(grip);
    weapon.position.set(0.76 * scale, 1.9, 0.12);
    weapon.rotation.z = 0.35;
    group.add(weapon);
  } else if (dna.weaponType === "staff") {
    weapon = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 8), darkMat);
    weapon.add(shaft);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), bladeMat);
    gem.position.y = 1.02;
    weapon.add(gem);
    weapon.position.set(0.76 * scale, 1.75, 0.12);
    weapon.rotation.z = 0.1;
    group.add(weapon);
  } else if (dna.weaponType === "spear") {
    weapon = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 2.2, 8), darkMat);
    weapon.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 10), bladeMat);
    tip.position.y = 1.2;
    weapon.add(tip);
    weapon.position.set(0.76 * scale, 1.8, 0.12);
    weapon.rotation.z = 0.12;
    group.add(weapon);
  }

  // blade energy particles
  const energy = weapon ? makeEnergy(120, 0.3, dna.bladeColor) : null;
  if (energy && weapon) {
    energy.position.copy(weapon.position);
    group.add(energy);
  }

  return { group, weapon, energy, hair };
}

// ── the DESIGNED set (same DNA the Blender worker renders) ──

function buildSet(scene: THREE.Scene, env: EnvironmentDesignDnaView): { clouds: THREE.Mesh[]; weather: THREE.Points | null; kind: string } {
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(env.groundColor), roughness: 0.95 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(env.groundColor).multiplyScalar(1.7), roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(env.skyColor).multiplyScalar(0.55), roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.85 });
  const features = new Set(env.features);
  const night = env.timeOfDay === "night" || env.timeOfDay === "dusk";

  scene.background = new THREE.Color(env.skyColor);

  // base ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(34, 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  const terrain = env.terrain;
  if (terrain === "terrace") {
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.0, 0.5, 12), stoneMat);
    platform.position.set(0, 2.05, 0);
    scene.add(platform);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 0.4, 12), stoneMat);
    step.position.set(0, 1.7, 0);
    scene.add(step);
  } else if (terrain === "peak") {
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 8.5, 13, 10), stoneMat);
    peak.position.set(0, -4.4, 0);
    scene.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 10), stoneMat);
    cap.position.set(0, 2.3, 0);
    scene.add(cap);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.3, 0.45, 10), stoneMat);
    platform.position.set(0, 2.0, 0);
    scene.add(platform);
  } else if (terrain === "forest") {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 20;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.6 + Math.random() * 1.6, 8), woodMat);
      trunk.position.set(x, 1.3, z);
      scene.add(trunk);
      const fol = new THREE.Mesh(new THREE.SphereGeometry(1.1 + Math.random() * 0.9, 10, 10), darkMat);
      fol.position.set(x, 2.9 + Math.random(), z);
      fol.scale.y = 0.8;
      scene.add(fol);
    }
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 0.6, 12), stoneMat);
    mound.position.set(0, 1.9, 0);
    scene.add(mound);
  } else if (terrain === "gorge") {
    const stream = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 16),
      new THREE.MeshStandardMaterial({ color: 0x5a88a8, emissive: 0x2a4a5e, roughness: 0.15, metalness: 0.4 })
    );
    stream.rotation.x = -Math.PI / 2;
    stream.position.set(0, 0.03, -6);
    scene.add(stream);
    const falls = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 9),
      new THREE.MeshStandardMaterial({ color: 0xa8ccd8, emissive: 0x6a9ab0, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    falls.position.set(7, 4.4, -12);
    scene.add(falls);
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 8, 8), stoneMat);
      s.position.set((Math.random() - 0.5) * 10, 0.1, -2 - Math.random() * 8);
      s.scale.y = 0.5;
      scene.add(s);
    }
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.5, 10), stoneMat);
    slab.position.set(0, 1.95, 0);
    scene.add(slab);
  } else {
    // temple
    for (let i = 0; i < 5; i++) {
      const h = 1.4 + Math.random() * 2.4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, h, 10), stoneMat);
      col.position.set(i % 2 === 0 ? -3.4 : 3.4, h / 2, -1.5 + Math.floor(i / 2) * 2.6);
      if (i === 2) { col.rotation.z = Math.PI / 2.15; col.position.y = 0.35; }
      scene.add(col);
    }
    const altar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 1.0), stoneMat);
    altar.position.set(0, 0.42, 3.2);
    scene.add(altar);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.0, 0.4, 12), stoneMat);
    platform.position.set(0, 1.95, 0);
    scene.add(platform);
  }

  // ── features ──
  if (features.has("pillars")) {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * (Math.PI / 2);
      const h = 0.9 + Math.random() * 1.1;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, h, 8), stoneMat);
      p.position.set(Math.cos(a) * 4.6, 2.25 + h / 2 - 0.6, Math.sin(a) * 4.6);
      p.rotation.z = (Math.random() - 0.5) * 0.1;
      scene.add(p);
    }
  }
  if (features.has("bell")) {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), new THREE.MeshStandardMaterial({ color: 0x6a5624, metalness: 0.75, roughness: 0.4 }));
    bell.scale.y = 1.2;
    bell.position.set(-3.6, 3.1, 2.2);
    scene.add(bell);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), woodMat);
    post.position.set(-3.6, 2.4, 2.2);
    scene.add(post);
  }
  if (features.has("banners")) {
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), woodMat);
      pole.position.set(sx * 4.6, 3.0, -1.2);
      scene.add(pole);
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 1.3),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(env.fogColor).multiplyScalar(2.0), side: THREE.DoubleSide })
      );
      cloth.position.set(sx * 4.6, 3.1, -1.02);
      scene.add(cloth);
    }
  }
  if (features.has("pagoda")) {
    const pg = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const w = 1.7 - i * 0.4;
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(w, w, 1.0, 8), darkMat);
      tier.position.y = 0.5 + i * 1.15;
      pg.add(tier);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w + 0.65, 0.6, 8), darkMat);
      roof.position.y = 1.25 + i * 1.15;
      pg.add(roof);
    }
    pg.position.set(-14, 0, -20);
    scene.add(pg);
  }
  if (features.has("bamboo")) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 7 + Math.random() * 16;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4 + Math.random() * 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x4a6a3a, roughness: 0.7 }));
      b.position.set(Math.cos(a) * r, 2 + Math.random(), Math.sin(a) * r);
      b.rotation.z = (Math.random() - 0.5) * 0.14;
      scene.add(b);
    }
  }
  if (features.has("waterfall") && terrain !== "gorge") {
    const falls = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 7),
      new THREE.MeshStandardMaterial({ color: 0xa8ccd8, emissive: 0x6a9ab0, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    falls.position.set(9, 3.4, -14);
    scene.add(falls);
  }
  if (features.has("stream") && terrain !== "gorge") {
    const stream = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 12),
      new THREE.MeshStandardMaterial({ color: 0x5a88a8, emissive: 0x223a4a, roughness: 0.2, metalness: 0.35 })
    );
    stream.rotation.x = -Math.PI / 2;
    stream.position.set(0, 0.02, -7.5);
    scene.add(stream);
  }
  if (features.has("lanterns")) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 5 + i * (2 * Math.PI / 5);
      const lx = Math.cos(a) * 5.2, lz = Math.sin(a) * 5.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), woodMat);
      pole.position.set(lx, 0.8, lz);
      scene.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xe8a24a })
      );
      lamp.position.set(lx, 1.68, lz);
      scene.add(lamp);
    }
  }

  // moons (night/dusk only, like the worker)
  if (features.has("moons") && night) {
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8eef8 });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 24), moonMat);
    moon.position.set(-42, 34, -62);
    scene.add(moon);
    const moon2 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 20), new THREE.MeshBasicMaterial({ color: 0xcfd8e8 }));
    moon2.position.set(22, 40, -70);
    scene.add(moon2);
  } else if (env.timeOfDay === "day" || env.timeOfDay === "dawn") {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 20), new THREE.MeshBasicMaterial({ color: env.timeOfDay === "dawn" ? 0xe8b98a : 0xf2ede2 }));
    sun.position.set(-38, 30, -64);
    scene.add(sun);
  }

  // sea of clouds
  const clouds: THREE.Mesh[] = [];
  if (features.has("cloudsea")) {
    const cTex = cloudTexture();
    for (let i = 0; i < 14; i++) {
      const s = 16 + Math.random() * 24;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s * 0.55),
        new THREE.MeshBasicMaterial({ map: cTex, transparent: true, depthWrite: false, opacity: 0.45 + Math.random() * 0.3 })
      );
      m.position.set((Math.random() - 0.5) * 110, -3.4 + Math.random() * 2.5, (Math.random() - 0.5) * 110);
      m.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.25;
      m.userData.speed = 0.12 + Math.random() * 0.26;
      scene.add(m);
      clouds.push(m);
    }
  }

  // weather particles
  let weather: THREE.Points | null = null;
  if (env.weather === "storm" || env.weather === "rain") weather = makeRain(1400);
  else if (env.weather === "snow") weather = makeSnow(900);
  if (weather) scene.add(weather);

  return { clouds, weather, kind: terrain };
}

export function CinematicPreview() {
  const { previewSceneId, previewShotNumber, closePreview } = useStudio();
  const mountRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [activeShot, setActiveShot] = useState(previewShotNumber);
  const playRef = useRef(true);
  const activeShotRef = useRef(activeShot);

  useEffect(() => {
    playRef.current = playing;
  }, [playing]);
  useEffect(() => {
    activeShotRef.current = activeShot;
  }, [activeShot]);

  const analysisQ = useQuery({
    queryKey: ["sceneAnalysis", previewSceneId],
    queryFn: () => api.sceneAnalysis(previewSceneId!),
    enabled: Boolean(previewSceneId),
  });

  const shots: ShotSpec[] = useMemo(
    () => (analysisQ.data?.scene.shots ?? []).map((s) => ({
      id: s.id, number: s.number, shotType: s.shotType, movement: s.movement,
      duration: s.duration, description: s.description, status: s.status, lens: s.lens,
    })),
    [analysisQ.data]
  );

  const design = analysisQ.data?.design ?? null;
  const hero = design?.cast?.[0] ?? null;
  const second = design?.cast?.[1] ?? null;
  const env = design?.environment ?? null;

  const params = useMemo(() => {
    const s = analysisQ.data?.scene;
    return {
      fogDensity: s?.fogDensity ?? 0.45,
      lightningIntensity: s?.lightningIntensity ?? 0.55,
      energyIntensity: s?.energyIntensity ?? 0.6,
      cameraDistance: s?.cameraDistance ?? 1,
      rimLightIntensity: s?.rimLightIntensity ?? 0.5,
    };
  }, [analysisQ.data]);

  // Keep latest params in a ref for the render loop
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || shots.length === 0) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fogColor = env?.fogColor ?? "#0a1018";
    scene.background = new THREE.Color(env?.skyColor ?? "#05070d");
    const fog = new THREE.FogExp2(new THREE.Color(fogColor).getHex(), 0.02 + paramsRef.current.fogDensity * 0.05);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 400);

    // ── Lighting (key color from the environment DNA) ─────
    const hemi = new THREE.HemisphereLight(new THREE.Color(env?.skyColor ?? 0x3a4a5a), 0x0a0c10, 0.5);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(new THREE.Color(env?.keyLight ?? "#cfe0ee"), 0.85);
    keyLight.position.set(-18, 26, -12);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0x8fe8d0, 0.4 * paramsRef.current.rimLightIntensity);
    rim.position.set(6, 4, 10);
    scene.add(rim);
    const lightningLight = new THREE.DirectionalLight(0xdfe9ff, 0);
    lightningLight.position.set(10, 30, 6);
    scene.add(lightningLight);
    const weaponLight = new THREE.PointLight(
      new THREE.Color(hero?.bladeColor ?? "#5eead4"),
      hero ? 1.2 * paramsRef.current.energyIntensity : 0, 18, 1.6
    );
    scene.add(weaponLight);

    // ── stars on night skies ──────────────────────────────
    const night = env ? env.timeOfDay === "night" || env.timeOfDay === "dusk" : true;
    if (night) {
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(700 * 3);
      for (let i = 0; i < 700; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.42;
        const r = 160;
        starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = r * Math.cos(phi) + 20;
        starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaebfd4, size: 0.5, transparent: true, opacity: 0.7 })));
    }

    // far mountain silhouettes frame every terrain
    const farMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(env?.skyColor ?? "#0d151a").multiplyScalar(0.7), roughness: 1 });
    for (const [x, z, h, w] of [[-60, -70, 46, 30], [55, -80, 52, 36], [90, -40, 34, 24], [-95, -30, 30, 22]] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6, 1), farMat);
      cone.position.set(x, h / 2 - 8, z);
      cone.rotation.y = Math.random() * Math.PI;
      scene.add(cone);
    }

    // ── the DESIGNED set ───────────────────────────────────
    const { clouds, weather } = env
      ? buildSet(scene, env)
      : { clouds: [] as THREE.Mesh[], weather: null as THREE.Points | null };

    // ── the DESIGNED cast ─────────────────────────────────
    let heroRig: FigureRig | null = null;
    let secondRig: FigureRig | null = null;
    if (hero) {
      heroRig = buildFigure(hero);
      heroRig.group.position.y = 2.55;
      scene.add(heroRig.group);
    }
    if (second) {
      secondRig = buildFigure(second);
      secondRig.group.position.set(2.6, 2.55, 2.2);
      secondRig.group.rotation.y = Math.PI + 0.5; // faces the hero across the set
      scene.add(secondRig.group);
    }

    // ── Lightning bolt ────────────────────────────────────
    const boltMat = new THREE.LineBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0.9 });
    let bolt: THREE.Line | null = null;
    let boltLife = 0;
    let flashIntensity = 0;
    let nextFlash = 1.2 + Math.random() * 2;

    // ── Animation state ───────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    let shotClock = 0;
    const baseSky = new THREE.Color(env?.skyColor ?? "#05070d");

    function cameraPose(shot: ShotSpec, t: number) {
      // t: 0..1 through the shot
      const type = shot.shotType;
      const movement = shot.movement ?? "STATIC";
      const dist = (RADII[type] ?? 11) * paramsRef.current.cameraDistance;
      const height = HEIGHTS[type] ?? 3.4;
      const baseAngle = 0.9 + shot.number * 0.7;

      let angle = baseAngle;
      let radius = dist;
      let y = height;
      let lateral = 0;
      let lookY = type === "CLOSEUP" || type === "EXTREME_CLOSEUP" ? 2.55 : 2.2;
      let lookX = 0;

      if (movement === "ORBIT") angle = baseAngle + (t - 0.5) * 0.9;
      if (movement === "DOLLY_IN") radius = dist * (1 - 0.25 * t);
      if (movement === "TRACKING") lateral = (t - 0.5) * dist * 0.35;
      if (movement === "PAN") lookX = Math.sin(t * Math.PI) * 6 - 2;
      if (movement === "CRANE") { y = height + (1 - t) * 7; radius = dist * (1 + 0.12 * t); }
      if (movement === "STATIC") { angle += Math.sin(t * Math.PI * 2) * 0.008; }

      const cx = Math.sin(angle) * radius + lateral;
      const cz = Math.cos(angle) * radius;
      const target = new THREE.Vector3(lookX, lookY, 0);
      camera.position.set(cx, y + Math.sin(t * 30) * 0.01, cz);
      camera.lookAt(target);
    }

    function spawnBolt() {
      if (bolt) {
        scene.remove(bolt);
        bolt.geometry.dispose();
      }
      const pts: THREE.Vector3[] = [];
      const x0 = (Math.random() - 0.5) * 80;
      const z0 = -60 - Math.random() * 30;
      let x = x0, z = z0;
      const steps = 9;
      for (let i = 0; i <= steps; i++) {
        const yy = 28 - (i / steps) * 34;
        pts.push(new THREE.Vector3(x, yy, z));
        x += (Math.random() - 0.5) * 7;
        z += (Math.random() - 0.5) * 4;
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      bolt = new THREE.Line(geo, boltMat);
      scene.add(bolt);
      boltLife = 0.14;
    }

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;
      const p = paramsRef.current;

      // fog responds to live params
      fog.density = 0.018 + p.fogDensity * 0.05;
      rim.intensity = 0.4 * p.rimLightIntensity;
      if (heroRig?.weapon) {
        const blade = heroRig.weapon.children[0] as THREE.Mesh | undefined;
        if (blade && (blade.material as THREE.MeshStandardMaterial).emissive) {
          (blade.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + 1.8 * p.energyIntensity;
        }
      }
      if (heroRig?.energy) {
        (heroRig.energy.material as THREE.PointsMaterial).opacity = 0.25 + 0.75 * p.energyIntensity;
      }

      // shot timing
      const shot = shots.find((s) => s.number === activeShotRef.current) ?? shots[0];
      if (playRef.current) {
        shotClock += dt;
        if (shotClock >= shot.duration) {
          shotClock = 0;
          const idx = shots.findIndex((s) => s.number === activeShotRef.current);
          const next = shots[(idx + 1) % shots.length];
          activeShotRef.current = next.number;
          setActiveShot(next.number);
        }
      }
      cameraPose(shot, Math.min(1, shotClock / Math.max(0.001, shot.duration)));

      // figure life: idle breathing, robe sway, weapon drift
      if (heroRig) {
        heroRig.group.position.y = 2.55 + Math.sin(time * 1.1) * 0.03;
        heroRig.group.rotation.y = Math.sin(time * 0.22) * 0.15;
        if (heroRig.hair) heroRig.hair.rotation.z = Math.sin(time * 1.4) * 0.08;
        if (heroRig.weapon) heroRig.weapon.rotation.z = 0.35 + Math.sin(time * 1.2) * 0.03;
        if (heroRig.energy && heroRig.weapon) {
          const seed = (heroRig.energy.userData.seed as number[]) ?? [];
          const ePos = heroRig.energy.geometry.attributes.position as THREE.BufferAttribute;
          const eRadius = (heroRig.energy.userData.radius as number) ?? 0.3;
          for (let i = 0; i < seed.length / 3; i++) {
            const a = seed[i * 3] + time * (1.5 + seed[i * 3 + 2] * 2);
            const h = seed[i * 3 + 1] * 1.5 - 0.75;
            ePos.setXYZ(i, Math.cos(a) * eRadius * seed[i * 3 + 2], h, Math.sin(a) * eRadius * seed[i * 3 + 2]);
          }
          ePos.needsUpdate = true;
          heroRig.energy.position.copy(heroRig.weapon.position);
          weaponLight.position.set(
            heroRig.group.position.x + heroRig.weapon.position.x,
            heroRig.group.position.y + heroRig.weapon.position.y - 0.5,
            heroRig.weapon.position.z + 0.1
          );
        }
      }
      if (secondRig) {
        secondRig.group.position.y = 2.55 + Math.sin(time * 1.1 + 1.3) * 0.025;
        secondRig.group.rotation.y = Math.PI + 0.5 + Math.sin(time * 0.18 + 1) * 0.12;
      }

      // clouds drift
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 80) c.position.x = -80;
      }

      // weather particles (rain falls fast + slants, snow falls slow)
      if (weather) {
        const wPos = weather.geometry.attributes.position as THREE.BufferAttribute;
        const isSnow = env?.weather === "snow";
        const fall = isSnow ? 2.2 : 14;
        for (let i = 0; i < wPos.count; i++) {
          let y = wPos.getY(i) - dt * (fall + (i % 5));
          let x = wPos.getX(i) + dt * (isSnow ? 0.4 : 1.6);
          if (y < -6) { y = 24 + Math.random() * 6; x = (Math.random() - 0.5) * 60; }
          wPos.setY(i, y);
          wPos.setX(i, x);
        }
        wPos.needsUpdate = true;
      }

      // lightning (storm or high intensity)
      nextFlash -= dt;
      if (nextFlash <= 0) {
        flashIntensity = 1.2 + Math.random() * 2.2;
        if (Math.random() < 0.4) spawnBolt();
        nextFlash = 2.2 + Math.random() * 5.5 - p.lightningIntensity * 1.6;
      }
      flashIntensity = Math.max(0, flashIntensity - dt * 9);
      lightningLight.intensity = flashIntensity * p.lightningIntensity;
      (scene.background as THREE.Color).setRGB(
        Math.max(0.02, baseSky.r) + flashIntensity * 0.10 * p.lightningIntensity,
        Math.max(0.027, baseSky.g) + flashIntensity * 0.11 * p.lightningIntensity,
        Math.max(0.05, baseSky.b) + flashIntensity * 0.16 * p.lightningIntensity
      );
      if (bolt && boltLife > 0) {
        boltLife -= dt;
        if (boltLife <= 0) {
          scene.remove(bolt);
          bolt.geometry.dispose();
          bolt = null;
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const mat = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // env/hero/second are part of the scene definition: the effect
    // rebuilds whenever the design DNA or the shot list changes
  }, [shots, hero, second, env]);

  const scene = analysisQ.data?.scene;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col">
      {/* Top bar */}
      <div className="h-13 shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-black/60">
        <Mountain className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            Cinematic Preview - Scene {scene?.number} “{scene?.title}”
          </div>
          <div className="text-[10px] text-muted-foreground">
            Design-driven blocking preview (Three.js) · cast + environment from live production designs - not the production renderer
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground hidden md:flex">
          {hero && (
            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
              <span className="inline-block h-2 w-2 rounded-full mr-1 align-middle" style={{ background: hero.robeColor }} />
              {hero.name}
            </span>
          )}
          {second && (
            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
              <span className="inline-block h-2 w-2 rounded-full mr-1 align-middle" style={{ background: second.robeColor }} />
              {second.name}
            </span>
          )}
          {env && <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{env.name} · {env.terrain} · {env.timeOfDay} · {env.weather}</span>}
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">fog {params.fogDensity.toFixed(2)}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">⚡ {params.lightningIntensity.toFixed(2)}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">energy {params.energyIntensity.toFixed(2)}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">cam ×{params.cameraDistance.toFixed(2)}</span>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={closePreview} aria-label="Close preview">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 3D viewport */}
      <div className="relative flex-1 min-h-0">
        <div ref={mountRef} className="absolute inset-0" />
        {shots.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {/* Letterbox bars */}
        <div className="pointer-events-none absolute top-0 inset-x-0 h-[6%] bg-black/80" />
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-[6%] bg-black/80" />
      </div>

      {/* Shot controls */}
      <div className="shrink-0 border-t border-white/10 bg-black/60 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="icon" variant="outline" className="h-8 w-8 border-white/15 bg-white/5" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8 border-white/15 bg-white/5" aria-label="Previous shot"
            onClick={() => {
              const idx = shots.findIndex((s) => s.number === activeShot);
              const prev = shots[(idx - 1 + shots.length) % shots.length];
              if (prev) setActiveShot(prev.number);
            }}>
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8 w-8 border-white/15 bg-white/5" aria-label="Next shot"
            onClick={() => {
              const idx = shots.findIndex((s) => s.number === activeShot);
              const next = shots[(idx + 1) % shots.length];
              if (next) setActiveShot(next.number);
            }}>
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
          <div className="flex gap-1.5 flex-wrap ml-2">
            {shots.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveShot(s.number)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-[11px] border transition-colors flex items-center gap-1.5",
                  activeShot === s.number
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-white/[0.03] border-white/10 text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="font-mono">{String(s.number).padStart(3, "0")}</span>
                <span className="hidden sm:inline">{SHOT_TYPE_LABELS[s.shotType] ?? s.shotType}</span>
                <StatusBadge status={s.status} />
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed line-clamp-1">
          {shots.find((s) => s.number === activeShot)?.description ?? ""}
        </p>
      </div>
    </div>
  );
}
