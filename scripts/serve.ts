import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const buildRoot = resolve("dist"),
  libraryRoot = resolve("public/library");
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url || "/", "http://localhost").pathname,
    );
    const isLibrary = pathname.startsWith("/library/");
    const isPreview = pathname === "/welcome.ccreplay";
    const root = isLibrary
      ? libraryRoot
      : isPreview
        ? resolve("public")
        : buildRoot;
    const relative = isLibrary ? pathname.slice("/library".length) : pathname;
    const file = resolve(
      root,
      "." + (relative === "/" ? "/index.html" : relative),
    );
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.setHeader(
      "Content-Type",
      (
        {
          html: "text/html; charset=utf-8",
          js: "text/javascript",
          css: "text/css",
          svg: "image/svg+xml",
          json: "application/json",
          zip: "application/zip",
        } as Record<string, string>
      )[extname(file).slice(1)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(4173, "127.0.0.1", () => console.log("Local: http://127.0.0.1:4173"));
