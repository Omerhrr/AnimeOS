// One-shot transform: inside bridges/blender/animeos_bridge.py replace
//   bpy.ops.mesh.primitive_X_add(<args>)
//   <var> = bpy.context.active_object
// with
//   <var> = prim(scn, bpy.ops.mesh.primitive_X_add<, args>)
// so the captured object is ALWAYS the one just created (background-
// mode operators can leave active_object stale - the 2m tile bug).
import fs from "fs";

const file = "bridges/blender/animeos_bridge.py";
let src = fs.readFileSync(file, "utf-8");

const re = /^([ \t]*)bpy\.ops\.mesh\.primitive_(\w+)_add\(([^`\n]*?)\)\n[ \t]*(\w+) = bpy\.context\.active_object\n/gm;

let count = 0;
src = src.replace(re, (full, indent, kind, args, varName) => {
  count += 1;
  const argPart = args.trim() ? `${args.trim().replace(/,\s*$/, "")}, ` : "";
  return `${indent}${varName} = prim(scn, bpy.ops.mesh.primitive_${kind}_add, ${argPart})\n`;
});

fs.writeFileSync(file, src);
console.log(`transformed ${count} add+capture pairs`);
