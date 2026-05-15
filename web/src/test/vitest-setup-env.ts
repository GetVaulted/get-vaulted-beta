/**
 * Load `.env` / `.env.local` before test files (and their static imports) run.
 * Does not invent credentials — integration tests still need a real Postgres URL in env.
 */
import path from "node:path";
import { config } from "dotenv";

const root = process.cwd();
config({ path: path.join(root, ".env"), quiet: true });
config({ path: path.join(root, ".env.local"), override: true, quiet: true });
