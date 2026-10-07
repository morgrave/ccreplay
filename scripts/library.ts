import { errorMessage } from "../src/core/errors.ts";
import {
  readFile,
  writeFile,
  mkdir,
  access,
  rename,
  lstat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { validateRecording } from "../src/core/model.ts";
import { readArchive } from "../src/core/archive.ts";
import {
  emptyCatalog,
  validateCatalog,
  prepareEpisode,
  unpackPatch,
  mergePatch,
  hashBytes,
} from "../src/core/library.ts";
const args = process.argv.slice(2),
  mode = args.shift(),
  file = args.shift();
const option = (name: string) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? undefined : args[i + 1];
};
const root = resolve(option("library") || "public/library");
async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function readCatalog() {
  const p = join(root, "index.json");
  return (await exists(p))
    ? validateCatalog(JSON.parse(await readFile(p, "utf8")))
    : emptyCatalog();
}
let lock,
  ownsLock = false;
try {
  if (!["import", "apply"].includes(mode || "") || !file)
    throw Error(
      '사용법: npm run library:import -- file.ccreplay --campaign "캠페인명" --title "에피소드명" [--campaign-id ID] [--date YYYY-MM-DD]\n또는: npm run library:apply -- 등록묶음.zip',
    );
  await mkdir(root, { recursive: true });
  lock = join(root, ".import-lock");
  await writeFile(lock, "locked", { flag: "wx" });
  ownsLock = true;
  for (const name of ["assets", "episodes", "index.json"])
    if (
      (await exists(join(root, name))) &&
      (await lstat(join(root, name))).isSymbolicLink()
    )
      throw Error("라이브러리 symlink는 허용되지 않습니다.");
  const catalog = await readCatalog();
  let prepared;
  if (mode === "apply")
    prepared = await unpackPatch(new Uint8Array(await readFile(file)));
  else {
    const recording = await readArchive(new File([await readFile(file)], file));
    try {
      const matches = catalog.campaigns.filter(
        (c) => c.title === option("campaign"),
      );
      if (matches.length > 1 && !option("campaign-id"))
        throw Error(
          "같은 이름의 캠페인이 여러 개입니다. --campaign-id를 지정하세요.",
        );
      prepared = await prepareEpisode(recording, catalog, {
        campaignId: option("campaign-id") || matches[0]?.id,
        campaignTitle: option("campaign"),
        title: option("title"),
        date: option("date"),
      });
    } finally {
      recording.release();
    }
  }
  const { patch, files } = prepared,
    next = mergePatch(catalog, patch);
  // Verify all objects and paths before writing. New episode IDs are immutable.
  for (const name of Object.keys(files))
    if (!/^assets\/[a-f0-9]{64}$/.test(name) && name !== patch.episode.manifest)
      throw Error("허용되지 않은 등록 경로입니다.");
  const verified = new Map();
  for (const [hash, size] of Object.entries(patch.objects)) {
    if (
      (await exists(join(root, "assets", hash))) &&
      (await lstat(join(root, "assets", hash))).isSymbolicLink()
    )
      throw Error("자산 symlink는 허용되지 않습니다.");
    const bytes =
      files["assets/" + hash] ||
      new Uint8Array(await readFile(join(root, "assets", hash)));
    if (
      bytes.length !== size ||
      (await hashBytes(new Uint8Array(bytes))) !== hash
    )
      throw Error("자산 검증 실패: " + hash);
    verified.set(hash, bytes);
  }
  const episodeBytes = files[patch.episode.manifest];
  if (!episodeBytes) throw Error("에피소드 데이터가 빠져 있습니다.");
  let expanded = 0;
  const manifest = unzipSync(episodeBytes, {
    filter: (f) => {
      expanded += f.originalSize;
      if (expanded > 1024 * 1024 * 1024)
        throw Error("회차 데이터가 너무 큽니다.");
      return f.name === "recording.json";
    },
  });
  const data = validateRecording(
    JSON.parse(strFromU8(manifest["recording.json"])),
  );
  if (data.assetStorage !== "sha256-chunks-v1")
    throw Error("공용 자산 회차 형식이 아닙니다.");
  for (const a of data.assets || []) {
    const parts = [];
    for (const part of a.parts || []) {
      const bytes = verified.get(part.hash);
      if (!bytes || bytes.length !== part.size)
        throw Error("회차 자산이 누락되었습니다.");
      parts.push(bytes);
    }
    const original = Buffer.concat(parts);
    if (original.length !== a.size || (await hashBytes(original)) !== a.sha256)
      throw Error("회차 원본 자산 체크섬이 다릅니다.");
  }
  if (episodeBytes.length !== patch.episode.bytes)
    throw Error("회차 파일 크기가 다릅니다.");
  if (
    (await exists(join(root, patch.episode.manifest))) &&
    (await hashBytes(await readFile(join(root, patch.episode.manifest)))) !==
      (await hashBytes(new Uint8Array(episodeBytes)))
  )
    throw Error("기존 에피소드를 덮어쓸 수 없습니다.");
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "episodes"), { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    const target = join(root, ...name.split("/"));
    if (!(await exists(target))) await writeFile(target, bytes, { flag: "wx" });
  }
  await writeFile(
    join(root, "index.json.next"),
    JSON.stringify(next, null, 2) + "\n",
  );
  await rename(join(root, "index.json.next"), join(root, "index.json"));
  console.log(
    JSON.stringify(
      {
        campaign: patch.campaign.title,
        episode: patch.episode.title,
        episodes: next.campaigns.flatMap((c) => c.episodes).length,
        objects: Object.keys(next.objects).length,
        ...("stats" in prepared ? (prepared.stats as object) : {}),
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(errorMessage(e));
  process.exitCode = 1;
} finally {
  if (ownsLock) {
    const { unlink } = await import("node:fs/promises");
    await unlink(lock!).catch(() => {});
  }
}
