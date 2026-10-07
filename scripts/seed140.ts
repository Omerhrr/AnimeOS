// Direct auto-seed trigger (sandbox rebuild): calls ensureSeed() the
// same way GET /api/projects does, without the HTTP auth layer.
import { ensureSeed } from "../src/lib/seed";
ensureSeed().then((id) => console.log("seeded project:", id)).finally(() => process.exit(0));
