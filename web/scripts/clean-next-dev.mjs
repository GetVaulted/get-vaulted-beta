import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("Removed .next — restart with: npm run dev");
} catch (e) {
  console.error("Could not remove .next (stop `npm run dev` first if files are locked):", e);
  process.exit(1);
}
