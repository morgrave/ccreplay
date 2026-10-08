import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
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
let html = await readFile("index.html", "utf8");
const dataBase = process.env.CCREPLAY_DATA_BASE;
if (dataBase) {
  const url = new URL(dataBase);
  if (
    url.origin !== "https://raw.githubusercontent.com" ||
    !url.pathname.endsWith("/")
  )
    throw Error(
      "CCREPLAY_DATA_BASE must be a raw.githubusercontent.com directory URL",
    );
  html = html.replace(
    "<head>",
    `<head><meta name="ccreplay-data-base" content="${url.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`,
  );
}
// Prevent browsers from pairing new HTML/data configuration with cached code.
const revision = process.env.GITHUB_SHA;
if (revision && /^[a-f0-9]{40}$/.test(revision)) {
  html = html
    .replace('./app.js"', `./app.js?v=${revision}"`)
    .replace('./app.css"', `./app.css?v=${revision}"`);
}
await writeFile("dist/index.html", html);
await writeFile("dist/.nojekyll", "");
