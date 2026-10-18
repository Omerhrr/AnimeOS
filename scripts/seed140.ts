// Direct auto-seed trigger (sandbox rebuild): calls ensureSeed() the
// same way GET /api/projects does, without the HTTP auth layer.
//
// THE 231 CUSTODY LAW: the seed also writes the box's LIVING identity
// (receipts/box-identity.json) on every rebirth. The watch's
// restore-custody check reads it file-vs-file against the restore
// receipt's project id, so a receipt whose complete:true was earned on
// a DEAD database never certifies the reborn one (the sixth death's
// own seam: the chain stopped on a carried claim while the fresh
// cast stood sheetless - the arms leg named "no sheeted cast (the
// DB's own truth)" in the same generation the verdict said the
// answer was in).
import { ensureSeed } from "../src/lib/seed";
import fs from "fs";

ensureSeed()
  .then((id) => {
    try {
      fs.writeFileSync(
        "receipts/box-identity.json",
        JSON.stringify({ projectId: id, seededAt: new Date().toISOString(), source: "seed140" }, null, 2),
      );
      console.log("box identity written: receipts/box-identity.json");
    } catch (e) {
      console.log(
        "box identity write failed (the custody check degrades honestly - the restore rides):",
        e instanceof Error ? e.message : String(e),
      );
    }
    console.log("seeded project:", id);
  })
  .finally(() => process.exit(0));
