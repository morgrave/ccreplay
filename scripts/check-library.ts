import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import {
  validateCatalog,
  hashBytes,
  SITE_BUDGET,
  CHUNK_SIZE,
} from "../src/core/library.ts";
import { validateRecording } from "../src/core/model.ts";
const root = resolve(process.argv[2] || "public/library");
const index = validateCatalog(
  JSON.parse(await readFile(join(root, "index.json"), "utf8")),
);
const objects = new Map();
let total = 0;
for (const [hash, size] of Object.entries(index.objects)) {
  const path = join(root, "assets", hash);
  if ((await lstat(path)).isSymbolicLink())
    throw Error("자산 symlink는 허용되지 않습니다.");
  const bytes = await readFile(path);
  if (bytes.length !== size || (await hashBytes(bytes)) !== hash)
    throw Error("공용 자산 검증 실패: " + hash);
  objects.set(hash, bytes);
}
for (const campaign of index.campaigns)
  for (const episode of campaign.episodes) {
    const bytes = await readFile(join(root, episode.manifest));
    let expanded = 0;
    const files = unzipSync(bytes, {
      filter: (f) => {
        expanded += f.originalSize;
        if (expanded > 1024 * 1024 * 1024)
          throw Error("회차 데이터가 너무 큽니다.");
        return f.name === "recording.json";
      },
    });
    const data = validateRecording(
      JSON.parse(strFromU8(files["recording.json"])),
    );
    if (data.assetStorage !== "sha256-chunks-v1")
      throw Error("에피소드는 공용 자산 형식이어야 합니다.");
    for (const a of data.assets || []) {
      let size = 0;
      const parts = [];
      for (const p of a.parts || []) {
        const bytes = objects.get(p.hash);
        if (!bytes || bytes.length !== p.size || p.size > CHUNK_SIZE)
          throw Error("회차에 필요한 자산이 없습니다: " + episode.title);
        parts.push(bytes);
        size += bytes.length;
      }
      if (
        size !== a.size ||
        (await hashBytes(Buffer.concat(parts))) !== a.sha256
      )
        throw Error("회차의 원본 자산 체크섬이 다릅니다: " + episode.title);
    }
  }
async function count(dir: string) {
  for (const name of await readdir(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name),
      s = await lstat(p);
    if (s.isSymbolicLink()) throw Error("라이브러리에 symlink가 있습니다.");
    if (s.isDirectory()) await count(p);
    else total += s.size;
  }
}
await count(root);
if (total > SITE_BUDGET)
  throw Error("라이브러리 용량이 GitHub Pages 예산을 초과했습니다.");
console.log(
  `Library OK: ${index.campaigns.length} campaigns, ${index.campaigns.flatMap((c) => c.episodes).length} episodes, ${index.objects ? Object.keys(index.objects).length : 0} shared objects, ${(total / 1024 / 1024).toFixed(2)} MiB`,
);
