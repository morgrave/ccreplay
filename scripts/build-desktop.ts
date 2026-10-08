import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("desktop-dist", { recursive: true });
await build({
  entryPoints: ["desktop/main.ts"],
  outfile: "desktop-dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron", "playwright", "css-tree"],
});
await build({
  entryPoints: ["desktop/preload.ts"],
  outfile: "desktop-dist/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["desktop/renderer.ts"],
  outfile: "desktop-dist/renderer.js",
  bundle: true,
  platform: "browser",
  target: "es2022",
});
await build({
  entryPoints: ["recorder/browser.ts"],
  outfile: "desktop-dist/capture.js",
  bundle: true,
  format: "iife",
  minify: true,
});
for (const file of ["index.html", "styles.css"])
  await copyFile("desktop/" + file, "desktop-dist/" + file);
console.log("데스크톱 기록기 빌드 완료");
