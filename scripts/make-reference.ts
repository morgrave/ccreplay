import type { ExternalRecord, Asset } from "../src/core/types.ts";
import { errorMessage } from "../src/core/errors.ts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { makeArchive } from "../src/core/archive.ts";
import { collectCSS, absoluteURL } from "../src/core/css.ts";
const snapshot = JSON.parse(
  await readFile("work/qa/source-snapshot.json", "utf8"),
);
const base = "https://ccfolia.com/rooms/3I0wcF7Mh",
  queue = new Set<string>(),
  blobs = [],
  assets: Asset[] = [],
  warnings = [];
const enqueue = (u: string) => {
  if (/^https:\/\//.test(u)) queue.add(u);
  return u;
};
function visit(n: ExternalRecord) {
  if (n.type === 3 && n.isStyle) {
    const c = collectCSS(n.textContent, base);
    n.textContent = c.css;
    c.urls.forEach((x) => enqueue(x.url));
  }
  if (n.attributes) {
    const a = n.attributes;
    if (n.tagName === "link" && a.rel === "stylesheet")
      a.href = enqueue(absoluteURL(a.href, base));
    else if (n.tagName === "link") a.href = "";
    if (a.src) a.src = enqueue(absoluteURL(a.src, base));
    if (a.style) {
      const c = collectCSS(a.style, base, "declarationList");
      a.style = c.css;
      c.urls.forEach((x) => enqueue(x.url));
    }
  }
  for (const c of n.childNodes || []) visit(c);
}
visit(snapshot.node);
const seen = new Set();
while (queue.size) {
  const u = queue.values().next().value!;
  queue.delete(u);
  if (seen.has(u)) continue;
  seen.add(u);
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw Error(String(r.status));
    let blob = await r.blob();
    if (blob.type.startsWith("text/css")) {
      const c = collectCSS(await blob.text(), u);
      c.urls.forEach((x) => enqueue(x.url));
      blob = new Blob([c.css], { type: "text/css" });
    }
    const path = "assets/" + assets.length;
    assets.push({ url: u, path, mime: blob.type, size: blob.size });
    blobs.push({ path, blob });
  } catch (e) {
    warnings.push("참조 자산 저장 실패: " + u + " (" + errorMessage(e) + ")");
  }
}
const startedAt = Date.now(),
  data = {
    format: "ccreplay",
    version: 1,
    title: "엑스페리온 단편 테스트방 · 화면 참조",
    startedAt,
    duration: 0,
    frames: [],
    messages: [],
    audio: [],
    events: [
      {
        type: 4,
        timestamp: startedAt,
        data: { href: base, width: snapshot.width, height: snapshot.height },
      },
      {
        type: 2,
        timestamp: startedAt + 1,
        data: { node: snapshot.node, initialOffset: { top: 0, left: 0 } },
      },
    ],
    viewport: { width: snapshot.width, height: snapshot.height },
    assets,
    warnings,
    reference: true,
  };
await mkdir("public", { recursive: true });
const blob = await makeArchive(data, blobs);
await writeFile(
  "work/qa/source-reference.ccreplay",
  new Uint8Array(await blob.arrayBuffer()),
);
// Ship a neutral empty-room reference. No account, room URL, chat, or token state is included.
function neutralize(n: ExternalRecord) {
  if (n.type === 3 && n.textContent?.includes("엑스페리온 단편 테스트방"))
    n.textContent = n.textContent.replaceAll(
      "엑스페리온 단편 테스트방",
      "CC Replay",
    );
  for (const key of Object.keys(n.attributes || {})) {
    if (
      ["href", "content", "value"].includes(key) &&
      String(n.attributes[key]).includes("3I0wcF7Mh")
    )
      n.attributes[key] = "";
  }
  for (const c of n.childNodes || []) neutralize(c);
}
neutralize(snapshot.node);
data.title = "CC Replay";
data.events[0].data.href = "https://ccfolia.com/";
data.events[1].data.node = snapshot.node;
await writeFile(
  "public/welcome.ccreplay",
  new Uint8Array(await (await makeArchive(data, blobs)).arrayBuffer()),
);
console.log(
  JSON.stringify({ assets: assets.length, bytes: blob.size, warnings }),
);
