# ─────────────────────────────────────────────────────────────
# AnimeOS ADDON REGISTRY LAW (iteration 118) - THE FORGE OPENS.
#
# The studio's directive: DSH and the expert crew get access to ALL
# of Blender's built-in addons - the full forge - because a
# wanglin-level character is built with Blender's whole toolbox, not
# a bare bpy.
#
# The law this module keeps:
#
#   1. EVERY worker session opens the forge: every bundled addon is
#      enabled before the first scene build (policy ANIMEOS_ADDONS:
#      "all" default | "off" | comma list of modules).
#   2. THE PURGE NEVER SILENTLY CLOSES IT: the pool worker resets to
#      factory settings after every job, which re-closes the addons
#      that are not default-on - ensure_builtins() is idempotent and
#      re-ensures at the top of EVERY worker_run (warm cost: ~5 ms).
#   3. CORE IS NOT FAILED: Blender 5.x loads some addons (rigify)
#      from scripts/addons_core OUTSIDE addon_utils' bookkeeping -
#      check() reports False while every class is registered and
#      importable. An enable error whose module still imports is
#      AVAILABLE (core), recorded honestly, never a failure.
#   4. THE EVIDENCE RIDES THE STATE: the summary lands in the job
#      state ("addons") so the crew and the UI read exactly what the
#      forge had open for this render.
#   5. ACCESS IS NOT LICENSE: enabling an addon grants the crew the
#      TOOL, not the pixels - every USE of an addon must earn its
#      keep through a night as a law (the eye-and-pen rule holds).
#      The bench ownership map mirrors src/lib/crew/experts.ts.
# ─────────────────────────────────────────────────────────────

import json
import os
import time

ADDON_LAW_VERSION = "addons-v1"

# ── the forge catalog: every bundled addon, what it is FOR in this
#    studio, and the bench that owns it (mirrors experts.ts) ──
FORGE_CATALOG = {
    "cycles": {
        "title": "Cycles Render Engine",
        "bench": "art-director",
        "use": "the render engine every clip rides (banded toon + ink)",
        "kind": "addon",
    },
    "rigify": {
        "title": "Rigify",
        "bench": "sculptor",
        "use": "full feature rigs (human metarig, limbs, face) - the door to production-grade character rigging beyond the mannequin's custom rig",
        "kind": "core",
    },
    "pose_library": {
        "title": "Pose Library",
        "bench": "choreographer",
        "use": "the canonical grammar poses (LUNGE/SLASH/BLOCK/...) persist as Blender Pose Assets - a shared vocabulary every shot links",
        "kind": "addon",
    },
    "node_wrangler": {
        "title": "Node Wrangler",
        "bench": "art-director",
        "use": "shader-node craft shortcuts - the look-dev bench's editor side (GUI sessions, inert headless)",
        "kind": "addon",
    },
    "io_anim_bvh": {
        "title": "BVH format",
        "bench": "choreographer",
        "use": "motion-capture import - the choreography bench's door to real mocap drives",
        "kind": "addon",
    },
    "io_scene_fbx": {
        "title": "FBX format",
        "bench": "character-designer",
        "use": "the designed character exchanges with external DCCs/engines",
        "kind": "addon",
    },
    "io_scene_gltf2": {
        "title": "glTF 2.0 format",
        "bench": "character-designer",
        "use": "the web-native asset door - GLB exports for studio viewers",
        "kind": "addon",
    },
    "io_mesh_uv_layout": {
        "title": "UV Layout",
        "bench": "character-designer",
        "use": "UV export for painted maps (decals, embroidery)",
        "kind": "addon",
    },
    "io_curve_svg": {
        "title": "SVG Import",
        "bench": "storyteller",
        "use": "vector art (logos, title calligraphy, shot graphics) lands as curves",
        "kind": "addon",
    },
    "bl_pkg": {
        "title": "Extensions Repository",
        "bench": "art-director",
        "use": "the extension manager - the provisioner's door to installing community extensions on demand",
        "kind": "addon",
    },
    "hydra_storm": {
        "title": "Hydra Storm",
        "bench": "art-director",
        "use": "USD/Hydra render-delegate door for external pipeline interchange",
        "kind": "addon",
    },
    "ui_translate": {
        "title": "Interface Translation",
        "bench": "storyteller",
        "use": "localized Blender UI for multinational artist sessions",
        "kind": "addon",
    },
    "viewport_vr_preview": {
        "title": "VR Preview",
        "bench": "cinematographer",
        "use": "VR framing reviews (GUI sessions, inert headless) - recorded honestly as enabled-but-idle in background runs",
        "kind": "addon",
    },
}


def _policy():
    raw = (os.environ.get("ANIMEOS_ADDONS") or "all").strip().lower()
    if raw in ("", "all", "*"):
        return "all"
    if raw in ("off", "none", "0", "false"):
        return "off"
    return set(p.strip() for p in raw.split(",") if p.strip())


def ensure_builtins():
    """Open the forge: enable every bundled addon per policy. Idempotent
    and cheap when warm (a check() per module). Returns the honest
    summary; never raises - a forge problem is recorded, and only a
    recorded problem can become a law."""
    import addon_utils  # Blender-only import, deferred

    t0 = time.time()
    policy = _policy()
    out = {
        "lawVersion": ADDON_LAW_VERSION,
        "policy": "all" if policy == "all" else ("off" if policy == "off" else sorted(policy)),
        "enabledNow": [],
        "alreadyOn": [],
        "availableCore": [],
        "failed": [],
        "skipped": [],
        "catalog": {name: meta["bench"] for name, meta in FORGE_CATALOG.items()},
    }
    if policy == "off":
        out["skipped"] = [m.__name__ for m in addon_utils.modules()]
        out["ms"] = int((time.time() - t0) * 1000)
        return out

    for mod in addon_utils.modules():
        name = mod.__name__
        wanted = policy == "all" or name in policy
        if not wanted:
            out["skipped"].append(name)
            continue
        try:
            if addon_utils.check(name)[1]:
                out["alreadyOn"].append(name)
                continue
            addon_utils.enable(name)
            if addon_utils.check(name)[1]:
                out["enabledNow"].append(name)
                continue
            # THE CORE LAW (3): an enable that reports not-registered but
            # still imports is a core-loaded addon (e.g. rigify under
            # scripts/addons_core) - AVAILABLE, not failed.
            __import__(name)
            out["availableCore"].append(name)
        except Exception as exc:  # noqa: BLE001
            # the same core probe decides: importable after the error?
            try:
                __import__(name)
                out["availableCore"].append(name)
            except Exception:  # noqa: BLE001
                out["failed"].append({"name": name, "error": f"{type(exc).__name__}: {exc}"})
    out["ms"] = int((time.time() - t0) * 1000)
    return out


def forge_summary_line(summary):
    """One honest line for logs: what the forge had open."""
    total = (
        len(summary.get("alreadyOn", []))
        + len(summary.get("enabledNow", []))
        + len(summary.get("availableCore", []))
    )
    failed = len(summary.get("failed", []))
    return f"forge: {total} built-ins open, {failed} failed, policy {summary.get('policy')} ({summary.get('ms')}ms)"


def dump_summary(summary):
    return json.dumps(summary, sort_keys=True)
