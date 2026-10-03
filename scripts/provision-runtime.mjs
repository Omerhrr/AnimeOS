import { provisionBlender, runtimeBlenderBin } from "../src/lib/blender/runtime.ts";
const r = await provisionBlender();
console.log("PROVISION:", JSON.stringify(r).slice(0, 300));
console.log("BIN:", runtimeBlenderBin());
process.exit(0);
