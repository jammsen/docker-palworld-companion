import { mkdir, readFile, stat } from "node:fs/promises";
import { build } from "esbuild";

const pkg = JSON.parse(await readFile("package.json", "utf8"));

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/companion.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  sourcemap: false,
  minify: false,
  define: {
    COMPANION_VERSION: JSON.stringify(pkg.version),
    // Inlined stylesheet - same declare-const pattern as COMPANION_VERSION,
    // so `npm run dev` (tsx, no loaders) can fall back to reading the file
    COMPANION_STYLE_CSS: JSON.stringify(await readFile("public/style.css", "utf8")),
  },
  // Optional native accelerators probed via try/catch require() inside
  // ws/@discordjs - left unresolved on purpose, the probes fail cleanly at
  // runtime and the libraries fall back to their pure-JS paths
  external: ["zlib-sync", "bufferutil", "utf-8-validate", "erlpack"],
  // Some transitive CJS dependencies expect require() to exist in ESM output
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

const bundleBytes = (await stat("dist/companion.mjs")).size;
console.log(
  `palworld-companion ${pkg.version} bundled to dist/companion.mjs (${(bundleBytes / 1024 / 1024).toFixed(1)} MB)`,
);
