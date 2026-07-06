import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Thin wrapper around `next dev` that sets NODE_PATH to this package's own
 * node_modules before spawning.
 *
 * Why: `next.config.ts` sets `turbopack.root` to the monorepo root so Turbopack can
 * trace `../shared` imports used by the Help Center content. That's correct for
 * resolving app source files, but Turbopack's PostCSS child process resolves the
 * `tailwindcss` / `@tailwindcss/postcss` modules relative to `turbopack.root` too —
 * which doesn't have its own `node_modules` — so every page fails to compile with
 * "Can't resolve 'tailwindcss'" (a known upstream Turbopack/monorepo-root bug,
 * see vercel/next.js#92060 and #92452). Explicitly setting NODE_PATH to this
 * package's node_modules restores resolution without weakening `turbopack.root`.
 *
 * Usage: node scripts/run-next-dev.mjs -- <...next dev args>
 */
const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(webRoot, "node_modules");
const nextBin = path.join(nodeModules, "next", "dist", "bin", "next");

const args = process.argv.slice(2);

// Invoke Next's bin script directly via `node` rather than the .cmd/.bin shim — avoids
// Windows shell quoting issues with spaces in the (OneDrive) path and needing shell:true.
const child = spawn(process.execPath, [nextBin, "dev", ...args], {
  cwd: webRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_PATH: nodeModules,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
