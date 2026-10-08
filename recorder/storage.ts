import { appendFile, mkdir, readFile, writeFile, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { zip, strToU8, type Zippable } from "fflate";
import { captureData, allowedAssetURL } from "../src/core/capture.ts";
import { trimIdleEdges } from "../src/core/trim.ts";
import { collectCSS } from "../src/core/css.ts";
import {
  isReplayAsset,
  isScriptResource,
} from "../src/core/resource-policy.ts";
import type { ExternalRecord } from "../src/core/types.ts";

interface Session {
  startedAt: number;
  roomUrl: string;
  title?: string;
}
interface SavedAsset {
  url: string;
  hash?: string;
  mime?: string;
  size?: number;
  error?: string;
  ignored?: boolean;
}
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const assetLimit = 150 * 1024 * 1024;
const totalLimit = 700 * 1024 * 1024;

/** Append-only journals survive an interrupted browser/process. No cookies or store dump are saved. */
export class RecordingStore {
  private seen = new Set<string>();
  private queue: { url: string; kind?: string }[] = [];
  private jobs = new Set<Promise<void>>();
  private bytes = 0;
  private journalBytes = 0;
  private failure?: unknown;
  private writes = Promise.resolve();
  constructor(
    readonly directory: string,
    readonly session: Session,
    private request: typeof fetch = fetch,
  ) {}
  async init() {
    await mkdir(dirname(this.directory), { recursive: true });
    await mkdir(this.directory); // Refuse to overwrite an earlier session.
    await mkdir(join(this.directory, "assets"));
    await writeFile(
      join(this.directory, "session.json"),
      JSON.stringify(this.session),
    );
    await writeFile(join(this.directory, "records.ndjson"), "");
    await writeFile(join(this.directory, "assets.ndjson"), "");
  }
  append(records: ExternalRecord[]): Promise<void> {
    this.writes = this.writes.then(async () => {
      if (this.failure) throw this.failure;
      const text = records.map((r) => JSON.stringify(r) + "\n").join("");
      this.journalBytes += Buffer.byteLength(text);
      if (this.journalBytes > 256 * 1024 * 1024)
        throw Error(
          "기록 데이터가 256 MiB를 넘었습니다. 회차를 나누어 기록하세요.",
        );
      await appendFile(join(this.directory, "records.ndjson"), text);
      for (const r of records)
        if (r.kind === "asset") this.asset(r.url, r.resourceType);
    });
    return this.writes;
  }
  private asset(url: string, kind?: string) {
    if (isScriptResource(url) || this.seen.has(url)) return;
    this.seen.add(url);
    this.queue.push({ url, kind });
    this.pump();
  }
  private pump() {
    while (this.jobs.size < 4 && this.queue.length) {
      const next = this.queue.shift()!;
      const job = this.download(next.url, next.kind)
        .catch((error: unknown) => {
          this.failure = error;
        })
        .finally(() => {
          this.jobs.delete(job);
          this.pump();
        });
      this.jobs.add(job);
    }
  }
  private async download(url: string, kind?: string) {
    let saved: SavedAsset;
    try {
      if (!allowedAssetURL(url)) throw Error("허용된 자산 호스트가 아닙니다.");
      // Validate every redirect, not just the initial address.
      let target = url;
      let response: Response | undefined;
      for (let hop = 0; hop < 6; hop++) {
        if (!allowedAssetURL(target))
          throw Error("허용되지 않은 자산 리디렉션");
        response = await this.request(target, {
          redirect: "manual",
          credentials: "omit",
          signal: AbortSignal.timeout(30000),
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw Error("자산 리디렉션 주소 없음");
        target = new URL(location, target).href;
      }
      if (!response?.ok) throw Error("HTTP " + response?.status);
      let mime =
        response.headers.get("content-type")?.split(";")[0] ||
        "application/octet-stream";
      if (!isReplayAsset(mime)) {
        await response.body?.cancel();
        await appendFile(
          join(this.directory, "assets.ndjson"),
          JSON.stringify({ url, ignored: true }) + "\n",
        );
        return;
      }
      if (Number(response.headers.get("content-length")) > assetLimit) {
        await response.body?.cancel();
        throw Error("개별 자산 150 MiB 제한");
      }
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        this.bytes += value.length;
        if (size > assetLimit || this.bytes > totalLimit) {
          await reader.cancel();
          throw Error("자산 용량 제한");
        }
        chunks.push(value);
      }
      let bytes: Uint8Array = Buffer.concat(chunks);
      if (mime === "text/css" || kind === "stylesheet") {
        const css = collectCSS(new TextDecoder().decode(bytes), target);
        bytes = strToU8(css.css);
        mime = "text/css";
        for (const child of css.urls) this.asset(child.url, child.kind);
      }
      const id = hash(bytes);
      await writeFile(join(this.directory, "assets", id), bytes);
      saved = { url, hash: id, mime, size: bytes.length };
    } catch (error) {
      saved = {
        url,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await appendFile(
      join(this.directory, "assets.ndjson"),
      JSON.stringify(saved) + "\n",
    );
  }
  async finish() {
    try {
      await this.writes;
    } catch (error) {
      this.failure ||= error;
    }
    while (this.jobs.size) await Promise.all([...this.jobs]);
    if (this.failure) throw this.failure;
  }
}

async function readJournal<T>(
  path: string,
): Promise<{ records: T[]; truncated: boolean }> {
  const input = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  const records: T[] = [];
  let malformed = false;
  for await (const line of input) {
    if (!line.trim()) continue;
    if (malformed) throw Error("기록 중간의 데이터가 손상되었습니다: " + path);
    try {
      records.push(JSON.parse(line) as T);
    } catch {
      malformed = true;
    }
  }
  return { records, truncated: malformed };
}

export async function exportSession(
  directory: string,
  output: string,
  recovered = false,
  options: { trim?: boolean; padding?: number } = {},
) {
  const session: Session = JSON.parse(
    await readFile(join(directory, "session.json"), "utf8"),
  );
  const journal = await readJournal<ExternalRecord>(
    join(directory, "records.ndjson"),
  );
  const assets = await readJournal<SavedAsset>(
    join(directory, "assets.ndjson"),
  );
  const original = captureData(journal.records, session);
  const data = options.trim
    ? trimIdleEdges(original, options.padding)
    : original;
  if (!data.frames.length || !data.events.some((e) => e.type === 2))
    throw Error("방 상태와 초기 화면 기록이 없어 리플레이를 만들 수 없습니다.");
  if (recovered || journal.truncated || assets.truncated)
    data.warnings!.push(
      "중단된 자동 기록에서 복구했습니다. 마지막으로 저장된 시점까지만 재생됩니다.",
    );
  const saved = new Map(assets.records.map((a) => [a.url, a]));
  for (const r of journal.records)
    if (r.kind === "asset" && !isScriptResource(r.url) && !saved.has(r.url))
      saved.set(r.url, {
        url: r.url,
        error:
          "다운로드 완료 전에 기록이 중단되었거나 재생에 사용할 수 없는 형식입니다.",
      });
  const files: Zippable = {};
  for (const asset of saved.values()) {
    if (asset.ignored) continue;
    if (asset.error) {
      data.warnings!.push(`자산 저장 실패: ${asset.url} (${asset.error})`);
      continue;
    }
    if (!asset.hash || !/^[a-f0-9]{64}$/.test(asset.hash))
      throw Error("잘못된 자산 해시");
    const bytes = await readFile(join(directory, "assets", asset.hash));
    if (bytes.length !== asset.size || hash(bytes) !== asset.hash)
      throw Error("보관 자산 무결성 확인 실패: " + asset.hash);
    const path = "assets/" + asset.hash;
    files[path] = [bytes, { level: 0 }];
    data.assets.push({
      url: asset.url,
      path,
      mime: asset.mime!,
      size: bytes.length,
    });
  }
  files["recording.json"] = strToU8(JSON.stringify(data));
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 6 }, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
  await mkdir(dirname(output), { recursive: true });
  // Exclusive creation protects previous recordings, including on recovery.
  const file = await open(output, "wx");
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  return data;
}
