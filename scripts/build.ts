import { build } from "esbuild";
import {
  mkdir,
  copyFile,
  readFile,
  writeFile,
  readdir,
  stat,
  rm,
} from "node:fs/promises";
import { zipSync } from "fflate";
import { resolve, dirname } from "node:path";
const out = resolve("dist");
if (dirname(out) !== process.cwd()) throw Error("Unexpected build output path");
await rm(out, { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/app.js",
  minify: true,
  sourcemap: false,
});
await build({
  entryPoints: ["src/archive-worker.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/archive-worker.js",
  minify: true,
});
await copyFile("index.html", "dist/index.html");
await copyFile("public/welcome.ccreplay", "dist/welcome.ccreplay");
async function copyTree(from: string, to: string) {
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    const src = from + "/" + name,
      dest = to + "/" + name;
    if ((await stat(src)).isDirectory()) await copyTree(src, dest);
    else await copyFile(src, dest);
  }
}
await copyTree("public/library", "dist/library");
await writeFile("dist/.nojekyll", "");
await mkdir("dist/recorder", { recursive: true });
for (const f of ["manifest.json", "popup.html", "popup.css", "offscreen.html"])
  await copyFile("extension/" + f, "dist/recorder/" + f);
await build({
  entryPoints: [
    "extension/background.ts",
    "extension/popup.ts",
    "extension/bridge.ts",
    "extension/recorder.ts",
    "extension/offscreen.ts",
  ],
  bundle: true,
  format: "iife",
  outdir: "dist/recorder",
  minify: true,
});
const files: Record<string, Uint8Array> = {};
for (const f of await readdir("dist/recorder"))
  files[f] = new Uint8Array(await readFile("dist/recorder/" + f));
await writeFile("dist/ccreplay-recorder.zip", zipSync(files));
