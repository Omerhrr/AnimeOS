# Ground truth for the S003 face: run the worker's own build path on a
# 2-frame clone of the real job, then dump the head-region layout and
# render with hair sets hidden.
import importlib.util, json, math, os, shutil, sys
import bpy

BR = "/home/z/my-project/AnimeOS/bridges/blender"
sys.path.insert(0, BR)
job_src = "/home/z/my-project/AnimeOS/public/renders/.job-cmuq3t0mu006mppgsd0z5m6s0.json"
job = json.load(open(job_src))

# rebuild the original payload wrapper: the state file stores the
# evidence, not the payload - so rebuild a minimal S003-like payload
# from the DB-driven defaults the worker accepts, with the production
# cast DNA assembled exactly like render.ts does (dna + designSpec +
# sheetDna + conformance markers).
import subprocess
out = subprocess.run(["node", "-e", """
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const project = await db.project.findFirst({ where: { title: 'Immortal Path' } });
  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } } }, orderBy: { number: 'asc' } });
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 3 }, include: { scene: true } });
  const cast = await db.character.findMany({ where: { projectId: project.id, name: { in: ['Lin Yue', 'Lin Yue - Clone 001'] } }, orderBy: [{ derivativeType: 'asc' }, { name: 'asc' }] });
  const castPayload = cast.map((c) => ({
    name: c.name, hairStyle: c.hairStyle, hairColor: c.hairColor, robeColor: c.robeColor,
    robeAccent: c.robeAccent, skinTone: c.skinTone, weaponType: c.weaponType, build: c.build,
    faceShape: c.faceShape, beard: c.beard, conformFactor: c.conformFactor,
    dna: c.dna ? JSON.parse(c.dna) : null,
    designSpec: c.designSpec ? JSON.parse(c.designSpec) : null,
    sheetDna: c.sheetDna ? JSON.parse(c.sheetDna) : null,
  }));
  console.log(JSON.stringify({
    jobId: 'face-truth', mode: 'PREVIEW',
    shot: { number: shot.number, description: shot.description, shotType: shot.shotType, lens: shot.lens,
            movement: shot.movement, poseStart: shot.poseStart, poseEnd: shot.poseEnd, duration: 0.08,
            dialogue: shot.dialogue, cast: castPayload },
    scene: { number: scene.number, title: scene.title, fogDensity: scene.fogDensity ?? 0.3,
             lightningIntensity: scene.lightningIntensity ?? 0.2, energyIntensity: 0.5,
             cameraDistance: 1.0, rimLightIntensity: 0.5 },
    project: { title: 'Immortal Path', visualStyle: 'DONGHUA', resolution: '512x288', fps: 24, renderLook: 'TOON' },
  }));
  await db.$disconnect();
})();
"""], capture_output=True, text=True, env={**os.environ, "DATABASE_URL": "file:/home/z/my-project/AnimeOS/db/custom.db"})
payload = json.loads(out.stdout.strip().splitlines()[-1])
job_path = "/tmp/turn113/face-truth-job.json"
out_dir = "/tmp/turn113/truth"
shutil.rmtree(out_dir, ignore_errors=True)
os.makedirs(out_dir, exist_ok=True)
json.dump({"jobId": "face-truth", "payload": payload, "outDir": out_dir}, open(job_path, "w"))

spec = importlib.util.spec_from_file_location("br", os.path.join(BR, "animeos_bridge.py"))
br = importlib.util.module_from_spec(spec); spec.loader.exec_module(br)
br.worker_run(job_path)

state = json.load(open(job_path))
print("TRUTH figureSource:", state.get("figureSource"))
print("TRUTH presence:", json.dumps((state.get("render") or {}).get("presence"))[:200])

scn = bpy.context.scene
def bbox(name):
    ob = scn.objects.get(name)
    if ob is None or ob.type != "MESH":
        return None
    zs = [(ob.matrix_world @ v.co).z for v in ob.data.vertices]
    ys = [(ob.matrix_world @ v.co).y for v in ob.data.vertices]
    xs = [(ob.matrix_world @ v.co).x for v in ob.data.vertices]
    return {"z": [round(min(zs), 3), round(max(zs), 3)], "y": [round(min(ys), 3), round(max(ys), 3)], "x": [round(min(xs), 3), round(max(xs), 3)]}
report = {}
for ob in scn.objects:
    b = bbox(ob.name)
    if b:
        report[ob.name] = b
print("TRUTH_BBOX " + json.dumps(report))
cam = scn.camera
print("TRUTH_CAM", cam.name if cam else None, [round(c, 3) for c in cam.matrix_world.translation] if cam else None)

# render the solved closeup framing with hair hidden, then with everything
cd = scn.camera
print("PROXYHIDE", scn.objects["HeadNormalProxy"].hide_render, "headhide", scn.objects["HeadMesh"].hide_render)
for tag, hide in (("noproxy", [n for n in scn.objects.keys() if n.startswith("HeadNormalProxy")]), ("nohead", ["HeadMesh", "HeadNormalProxy", "InkShell_HeadMesh", "InkShell_HeadNormalProxy"]), ("all", [])):
    for ob in scn.objects:
        ob.hide_render = False
    for n in hide:
        scn.objects[n].hide_render = True
    scn.render.filepath = f"/tmp/turn113/truth_{tag}.png"
    bpy.ops.render.render(write_still=True)
print("DONE")
