import type {
  Recording,
  Catalog,
  EpisodeDetails,
  PrepareProgress,
  LibraryPatch,
  PreparedEpisode,
  Asset,
  Episode,
} from "./types.ts";
import { strToU8 } from "fflate";
import { compress } from "./compression.ts";
import { makeArchive, readArchive } from "./archive.ts";
export const CHUNK_SIZE = 20 * 1024 * 1024;
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
export const hashBytes = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export const emptyCatalog = (): Catalog => ({
  version: 1,
  revision: "initial",
  campaigns: [],
  objects: {},
});
export function validateCatalog(catalog: Catalog) {
  if (
    catalog?.version !== 1 ||
    !Array.isArray(catalog.campaigns) ||
    !catalog.objects ||
    typeof catalog.objects !== "object"
  )
    throw Error("캠페인 목록의 형식이 올바르지 않습니다.");
  const ids = new Set();
  for (const c of catalog.campaigns) {
    if (!idPattern.test(c.id) || ids.has(c.id) || !Array.isArray(c.episodes))
      throw Error("캠페인 정보가 올바르지 않습니다.");
    ids.add(c.id);
    for (const e of c.episodes)
      if (!idPattern.test(e.id) || e.manifest !== `episodes/${e.id}.ccreplay`)
        throw Error("에피소드 경로가 올바르지 않습니다.");
  }
  for (const [hash, size] of Object.entries(catalog.objects))
    if (
      !hashPattern.test(hash) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > CHUNK_SIZE
    )
      throw Error("공용 자산 목록이 올바르지 않습니다.");
  return catalog;
}
export async function prepareEpisode(
  recording: Recording,
  catalog: Catalog,
  details: EpisodeDetails,
  onProgress: (progress: PrepareProgress) => void = () => {},
) {
  validateCatalog(catalog);
  const d = structuredClone(recording.data);
  d.assetStorage = "sha256-chunks-v1";
  if (d.reference)
    throw Error("빈 화면 참조 대신 실제 기록 파일을 선택하세요.");
  const campaignId = details.campaignId || crypto.randomUUID(),
    id = crypto.randomUUID();
  if (!idPattern.test(campaignId))
    throw Error("캠페인 ID가 올바르지 않습니다.");
  const existing = catalog.campaigns.find((c) => c.id === campaignId);
  const title = String(details.title || d.title || "이름 없는 에피소드")
    .trim()
    .slice(0, 200);
  const campaignTitle = String(
    existing?.title || details.campaignTitle || "새 캠페인",
  )
    .trim()
    .slice(0, 200);
  if (!title || !campaignTitle)
    throw Error("캠페인과 에피소드 제목을 입력하세요.");
  const files: Record<string, Uint8Array<ArrayBuffer>> = {},
    objects: Record<string, number> = {};
  let originalBytes = 0,
    newBytes = 0,
    done = 0;
  for (const a of d.assets || []) {
    const blob =
      recording.rawAssets?.get(a.url) ||
      (recording.assets.get(a.url)
        ? await (await fetch(recording.assets.get(a.url)!)).blob()
        : null);
    if (!blob)
      throw Error(
        "누락된 자산을 먼저 연결하세요: " + a.url.split("?")[0].slice(-100),
      );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    originalBytes += bytes.length;
    a.size = bytes.length;
    a.mime = blob.type;
    a.sha256 = await hashBytes(bytes);
    a.parts = [];
    for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
      const chunk = bytes.slice(start, start + CHUNK_SIZE),
        hash = await hashBytes(chunk);
      a.parts.push({ hash, size: chunk.length });
      objects[hash] = chunk.length;
      if (
        catalog.objects[hash] !== undefined &&
        catalog.objects[hash] !== chunk.length
      )
        throw Error("공용 자산 크기가 일치하지 않습니다.");
      if (catalog.objects[hash] === undefined && !files["assets/" + hash]) {
        files["assets/" + hash] = chunk;
        newBytes += chunk.length;
      }
    }
    onProgress({
      done: ++done,
      total: d.assets.length,
      newBytes,
      originalBytes,
    });
  }
  const manifest = `episodes/${id}.ccreplay`,
    archive = await makeArchive(d);
  if (archive.size > 95 * 1024 * 1024)
    throw Error(
      "회차 기록이 95 MiB를 넘습니다. 기록 구간을 나누어 저장하세요.",
    );
  files[manifest] = new Uint8Array(await archive.arrayBuffer());
  const episode = {
    id,
    title,
    ...(d.sampleKind === "snapshot" ? { sampleKind: "snapshot" } : {}),
    date:
      details.date ||
      new Date(d.startedAt || Date.now()).toISOString().slice(0, 10),
    duration: d.duration,
    manifest,
    bytes: archive.size,
    assetCount: d.assets?.length || 0,
    assetBytes: originalBytes,
    createdAt: new Date().toISOString(),
  };
  const campaign = existing
    ? { id: existing.id, title: existing.title }
    : {
        id: campaignId,
        title: campaignTitle,
        description: "",
        createdAt: new Date().toISOString(),
      };
  const patch = {
    format: "ccreplay-library-patch",
    version: 1,
    baseRevision: catalog.revision,
    campaign,
    episode,
    objects,
  };
  mergePatch(catalog, patch);
  return {
    patch,
    files,
    stats: {
      originalBytes,
      newBytes,
      reusedBytes: originalBytes - newBytes,
      manifestBytes: archive.size,
    },
  };
}
export function mergePatch(catalog: Catalog, patch: LibraryPatch) {
  validateCatalog(catalog);
  if (
    patch?.format !== "ccreplay-library-patch" ||
    patch.version !== 1 ||
    !idPattern.test(patch.campaign?.id) ||
    !idPattern.test(patch.episode?.id)
  )
    throw Error("등록 묶음의 형식이 올바르지 않습니다.");
  for (const [hash, size] of Object.entries(patch.objects || {}))
    if (
      !hashPattern.test(hash) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > CHUNK_SIZE
    )
      throw Error("등록 자산 정보가 올바르지 않습니다.");
  const next = structuredClone(catalog);
  let campaign = next.campaigns.find((c) => c.id === patch.campaign.id);
  if (!campaign) {
    campaign = { ...patch.campaign, episodes: [] };
    next.campaigns.push(campaign);
  }
  const prior = next.campaigns
    .flatMap((c) => c.episodes)
    .find((e) => e.id === patch.episode.id);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(patch.episode))
      throw Error("같은 ID의 다른 에피소드가 있습니다.");
    return next;
  }
  for (const [hash, size] of Object.entries(patch.objects || {})) {
    if (next.objects[hash] !== undefined && next.objects[hash] !== size)
      throw Error("기존 자산과 크기가 다릅니다.");
    next.objects[hash] = size;
  }
  campaign.episodes.push(patch.episode);
  campaign.episodes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  next.revision = crypto.randomUUID();
  validateCatalog(next);
  return next;
}
export async function patchBlob(prepared: PreparedEpisode) {
  const entries = {
    ...prepared.files,
    "patch.json": strToU8(JSON.stringify(prepared.patch, null, 2)),
  };
  return new Blob(
    [await compress({ operation: "zip", input: entries, level: 0 })],
    { type: "application/zip" },
  );
}
export async function unpackPatch(bytes: Uint8Array<ArrayBuffer>) {
  const files = await compress({ operation: "unzip", input: bytes });
  if (!files["patch.json"]) throw Error("patch.json이 없습니다.");
  const patch = JSON.parse(new TextDecoder().decode(files["patch.json"]));
  delete files["patch.json"];
  return { patch, files };
}
async function responseBytes(r: Response, limit: number) {
  // Fetch decodes Content-Encoding before exposing the body. Content-Length
  // describes the encoded transfer, which may be larger than a small asset.
  // Enforce the limit on decoded stream bytes instead.
  const reader = r.body!.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw Error("파일 크기가 한도를 넘습니다.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
export function libraryAssetLoader(
  baseURL: string | URL,
  onProgress: (bytes: number) => void = () => {},
  signal?: AbortSignal,
) {
  const cache = new Map();
  let total = 0;
  return async (a: Pick<Asset, "sha256" | "size" | "parts">) => {
    signal?.throwIfAborted();
    if (
      !hashPattern.test(a.sha256 || "") ||
      !Array.isArray(a.parts) ||
      a.parts.length > 100
    )
      throw Error("자산 참조가 올바르지 않습니다.");
    if (
      !Number.isSafeInteger(a.size) ||
      a.size < 0 ||
      a.size > 1024 * 1024 * 1024 ||
      a.parts.reduce((n, p) => n + (Number(p.size) || 0), 0) !== a.size
    )
      throw Error("자산 크기가 올바르지 않습니다.");
    const chunks = [];
    let size = 0;
    for (const part of a.parts) {
      signal?.throwIfAborted();
      if (
        !hashPattern.test(part.hash) ||
        !Number.isSafeInteger(part.size) ||
        part.size < 0 ||
        part.size > CHUNK_SIZE
      )
        throw Error("자산 조각 정보가 올바르지 않습니다.");
      let bytes = cache.get(part.hash);
      if (!bytes) {
        const r = await fetch(new URL("assets/" + part.hash, baseURL), {
          signal,
        });
        if (!r.ok)
          throw Error("공용 자산을 찾지 못했습니다: " + part.hash.slice(0, 12));
        bytes = await responseBytes(r, part.size);
        if (
          bytes.length !== part.size ||
          (await hashBytes(bytes)) !== part.hash
        )
          throw Error("공용 자산의 내용이 일치하지 않습니다.");
        total += bytes.length;
        if (total > 1024 * 1024 * 1024)
          throw Error("에피소드 자산이 너무 큽니다.");
        cache.set(part.hash, bytes);
        onProgress(total);
      }
      chunks.push(bytes);
      size += bytes.length;
    }
    if (size !== a.size) throw Error("원본 자산 크기가 일치하지 않습니다.");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if ((await hashBytes(bytes)) !== a.sha256)
      throw Error("원본 자산의 체크섬이 일치하지 않습니다.");
    return bytes;
  };
}
export async function loadEpisode(
  baseURL: string | URL,
  episode: Episode,
  onProgress?: (bytes: number) => void,
  signal?: AbortSignal,
  options: { progressive?: boolean } = {},
) {
  if (
    !idPattern.test(episode.id) ||
    episode.manifest !== `episodes/${episode.id}.ccreplay`
  )
    throw Error("에피소드 경로가 올바르지 않습니다.");
  signal?.throwIfAborted();
  const r = await fetch(new URL(episode.manifest, baseURL), { signal });
  if (!r.ok) throw Error("에피소드 기록을 불러오지 못했습니다.");
  return readArchive(
    new File(
      [await responseBytes(r, 95 * 1024 * 1024)],
      episode.id + ".ccreplay",
    ),
    {
      loadAsset: libraryAssetLoader(baseURL, onProgress, signal),
      signal,
      assetOrigin: options.progressive ? new URL(baseURL).origin : undefined,
      assetURL: options.progressive
        ? (asset) => {
            // Single-part content-addressed objects can be streamed by the browser.
            // Multi-part objects still require verified assembly before use.
            if (!Array.isArray(asset.parts) || asset.parts.length !== 1)
              return undefined;
            const part = asset.parts[0];
            if (
              !hashPattern.test(asset.sha256 || "") ||
              part.hash !== asset.sha256 ||
              !Number.isSafeInteger(part.size) ||
              part.size < 0 ||
              part.size > CHUNK_SIZE ||
              part.size !== asset.size
            )
              throw Error("자산 조각 정보가 올바르지 않습니다.");
            return new URL("assets/" + part.hash, baseURL).href;
          }
        : undefined,
    },
  );
}
