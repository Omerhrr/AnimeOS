"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import { X, Play, Pause, SkipBack, SkipForward, Loader2, Mountain } from "lucide-react";
import { api } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { StatusBadge, SHOT_TYPE_LABELS } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// BROWSER 3D PREVIEW (§37)
// Three.js is NOT the production renderer — it is the browser
// preview layer. The scene is built from live production state:
// shot list (camera spec), scene render params (tuned by DSH).
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

function makeEnergy(count: number, radius: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed: number[] = [];
  for (let i = 0; i < count; i++) {
    seed.push(Math.random() * Math.PI * 2, Math.random(), Math.random() * 0.6 + 0.4);
    pos[i * 3 + 1] = 0;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x7dfce0, size: 0.09, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.seed = seed;
  pts.userData.radius = radius;
  return pts;
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
    scene.background = new THREE.Color(0x05070d);
    const fog = new THREE.FogExp2(0x0a1018, 0.02 + paramsRef.current.fogDensity * 0.05);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 400);

    // ── Lighting ──────────────────────────────────────────
    const hemi = new THREE.HemisphereLight(0x3a4a5a, 0x0a0c10, 0.5);
    scene.add(hemi);
    const moonLight = new THREE.DirectionalLight(0xcfe0ee, 0.85);
    moonLight.position.set(-18, 26, -12);
    scene.add(moonLight);
    const rim = new THREE.DirectionalLight(0x8fe8d0, 0.4 * paramsRef.current.rimLightIntensity);
    rim.position.set(6, 4, 10);
    scene.add(rim);
    const lightningLight = new THREE.DirectionalLight(0xdfe9ff, 0);
    lightningLight.position.set(10, 30, 6);
    scene.add(lightningLight);
    const swordLight = new THREE.PointLight(0x5eead4, 1.2 * paramsRef.current.energyIntensity, 18, 1.6);
    scene.add(swordLight);

    // ── Sky: stars + moon ─────────────────────────────────
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

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xdfe9f2 })
    );
    moon.position.set(-55, 48, -95);
    scene.add(moon);

    // ── Mountain ranges ───────────────────────────────────
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x121c1a, roughness: 0.95, metalness: 0.05 });
    const farMat = new THREE.MeshStandardMaterial({ color: 0x0d151a, roughness: 1 });
    function ridge(x: number, z: number, h: number, w: number, mat: THREE.Material) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6, 1), mat);
      cone.position.set(x, h / 2 - 8, z);
      cone.rotation.y = Math.random() * Math.PI;
      scene.add(cone);
    }
    ridge(-60, -70, 46, 30, farMat);
    ridge(55, -80, 52, 36, farMat);
    ridge(90, -40, 34, 24, farMat);
    ridge(-95, -30, 30, 22, farMat);
    ridge(-28, -55, 26, 18, rockMat);
    ridge(34, -60, 30, 20, rockMat);

    // Main peak the character stands on
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 9, 14, 8), rockMat);
    peak.position.set(0, -5, 0);
    scene.add(peak);
    const peakCap = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.4, 8), rockMat);
    peakCap.position.set(0, 2.8, 0);
    scene.add(peakCap);
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.8, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a2622, roughness: 0.9 })
    );
    platform.position.set(0, 2.3, 0);
    scene.add(platform);

    // ── Sea of clouds below ───────────────────────────────
    const cTex = cloudTexture();
    const clouds: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i++) {
      const s = 18 + Math.random() * 26;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s * 0.55),
        new THREE.MeshBasicMaterial({ map: cTex, transparent: true, depthWrite: false, opacity: 0.5 + Math.random() * 0.3 })
      );
      m.position.set((Math.random() - 0.5) * 130, -4 + Math.random() * 3, (Math.random() - 0.5) * 130);
      m.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.25;
      m.userData.speed = 0.15 + Math.random() * 0.3;
      scene.add(m);
      clouds.push(m);
    }

    // ── Rain ──────────────────────────────────────────────
    const rain = makeRain(1400);
    scene.add(rain);

    // ── The cultivator (stylized) ─────────────────────────
    const figure = new THREE.Group();
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x11231d, roughness: 0.85, metalness: 0.1 });
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.1, 10), robeMat);
    robe.position.y = 1.05;
    figure.add(robe);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), robeMat);
    chest.position.y = 2.05;
    chest.scale.set(1, 0.85, 0.8);
    figure.add(chest);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.7 })
    );
    head.position.y = 2.58;
    figure.add(head);
    const topknot = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6 }));
    topknot.position.y = 2.92;
    figure.add(topknot);
    // left arm
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6), robeMat);
    armL.position.set(-0.42, 1.85, 0.1);
    armL.rotation.z = 0.5;
    figure.add(armL);
    // right arm holds the sword
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6), robeMat);
    armR.position.set(0.44, 1.95, 0.05);
    armR.rotation.z = -0.85;
    figure.add(armR);

    // Sword
    const swordGroup = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 1.5, 0.016),
      new THREE.MeshStandardMaterial({
        color: 0xbfeee4, emissive: 0x5eead4, emissiveIntensity: 1.4 * paramsRef.current.energyIntensity,
        metalness: 0.9, roughness: 0.15,
      })
    );
    blade.position.y = -0.85;
    swordGroup.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x2b3a36, metalness: 0.8, roughness: 0.4 }));
    swordGroup.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.8 }));
    grip.position.y = 0.2;
    swordGroup.add(grip);
    swordGroup.position.set(0.78, 1.95, 0.12);
    swordGroup.rotation.z = 0.35;
    figure.add(swordGroup);

    // Blade energy particles
    const energy = makeEnergy(120, 0.3);
    energy.position.copy(swordGroup.position);
    figure.add(energy);

    figure.position.y = 2.55;
    scene.add(figure);

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
      swordLight.intensity = 1.4 * p.energyIntensity;
      (blade.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + 1.8 * p.energyIntensity;
      (energy.material as THREE.PointsMaterial).opacity = 0.25 + 0.75 * p.energyIntensity;

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

      // figure life
      figure.position.y = 2.55 + Math.sin(time * 1.1) * 0.03;
      robe.rotation.y = Math.sin(time * 0.7) * 0.05;
      figure.rotation.y = Math.sin(time * 0.22) * 0.15;
      topknot.rotation.z = Math.sin(time * 1.4) * 0.08;
      swordGroup.rotation.z = 0.35 + Math.sin(time * 1.2) * 0.03;

      // energy particles swirl around the blade
      const seed = (energy.userData.seed as number[]) ?? [];
      const ePos = energy.geometry.attributes.position as THREE.BufferAttribute;
      const eRadius = (energy.userData.radius as number) ?? 0.3;
      for (let i = 0; i < seed.length / 3; i++) {
        const a = seed[i * 3] + time * (1.5 + seed[i * 3 + 2] * 2);
        const h = seed[i * 3 + 1] * 1.5 - 0.75;
        ePos.setXYZ(i, Math.cos(a) * eRadius * seed[i * 3 + 2], h, Math.sin(a) * eRadius * seed[i * 3 + 2]);
      }
      ePos.needsUpdate = true;
      energy.position.copy(swordGroup.position);
      swordLight.position.set(swordGroup.position.x, figure.position.y + swordGroup.position.y - 0.5, swordGroup.position.z + 0.1);

      // clouds drift
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 80) c.position.x = -80;
      }

      // rain
      const rPos = rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rPos.count; i++) {
        let y = rPos.getY(i) - dt * (14 + (i % 5));
        let x = rPos.getX(i) + dt * 1.6;
        if (y < -6) { y = 24 + Math.random() * 6; x = (Math.random() - 0.5) * 60; }
        rPos.setY(i, y);
        rPos.setX(i, x);
      }
      rPos.needsUpdate = true;

      // lightning
      nextFlash -= dt;
      if (nextFlash <= 0) {
        flashIntensity = 1.2 + Math.random() * 2.2;
        if (Math.random() < 0.4) spawnBolt();
        nextFlash = 2.2 + Math.random() * 5.5 - p.lightningIntensity * 1.6;
      }
      flashIntensity = Math.max(0, flashIntensity - dt * 9);
      lightningLight.intensity = flashIntensity * p.lightningIntensity;
      (scene.background as THREE.Color).setRGB(
        0.02 + flashIntensity * 0.10 * p.lightningIntensity,
        0.027 + flashIntensity * 0.11 * p.lightningIntensity,
        0.05 + flashIntensity * 0.16 * p.lightningIntensity
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
  }, [shots]);

  const scene = analysisQ.data?.scene;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col">
      {/* Top bar */}
      <div className="h-13 shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-black/60">
        <Mountain className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            Cinematic Preview — Scene {scene?.number} “{scene?.title}”
          </div>
          <div className="text-[10px] text-muted-foreground">
            Browser preview (Three.js) · driven by live production state — not the production renderer
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground hidden md:flex">
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">fog {params.fogDensity.toFixed(2)}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">⚡ {params.lightningIntensity.toFixed(2)}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">energy {params.energyIntensity.toFixed(2)}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">cam ×{params.cameraDistance.toFixed(2)}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">rim {params.rimLightIntensity.toFixed(2)}</span>
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
