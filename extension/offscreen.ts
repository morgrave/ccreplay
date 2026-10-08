import { captureData, allowedAssetURL } from "../src/core/capture.ts";
import { errorMessage } from "../src/core/errors.ts";
import { isScriptResource } from "../src/core/resource-policy.ts";
import type { RecorderState } from "./types.ts";
import type { ExternalRecord } from "../src/core/types.ts";
import type { Zippable } from "fflate";
import { zipSync, strToU8 } from "fflate";
import { collectCSS } from "../src/core/css.ts";
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open("ccreplay-recorder", 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("records", { autoIncrement: true });
    r.result.createObjectStore("assets", { keyPath: "url" });
    r.result.createObjectStore("meta");
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function tx<T>(
  store: string,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode = "readwrite",
): Promise<T> {
  const db = await dbPromise;
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const request = action(t.objectStore(store));
    t.oncomplete = () => resolve(request?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
let state: RecorderState = {};
let pending = new Set();
let seen = new Set();
let ordered: Promise<unknown> = Promise.resolve();
let bytes = 0;
let fetchQueue: { url: string; resourceType?: string }[] = [];
let fetchWorkers = 0;
const downloadUrls = new Map();
const restored = tx("meta", (s) => s.get("state"), "readonly").then((s) => {
  state = s || {};
  if (state.active) {
    state.active = false;
    state.error =
      "브라우저가 종료되어 기록이 중단되었습니다. 남아 있는 데이터를 저장하세요.";
    return persist();
  }
});
function persist() {
  return tx("meta", (s) => s.put(state, "state"));
}
function fetchAsset(url: string, resourceType?: string) {
  if (isScriptResource(url)) return;
  if (seen.has(url)) return;
  seen.add(url);
  fetchQueue.push({ url, resourceType });
  pump();
}
function pump() {
  while (fetchWorkers < 4 && fetchQueue.length) {
    const { url, resourceType } = fetchQueue.shift()!;
    fetchWorkers++;
    let job!: Promise<void>;
    job = (async () => {
      try {
        if (!allowedAssetURL(url))
          throw Error("허용된 자산 호스트가 아닙니다.");
        const r = await fetch(url, {
          credentials: "omit",
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) throw Error("HTTP " + r.status);
        const size = Number(r.headers.get("content-length") || 0);
        if (size > 150 * 1024 * 1024) throw Error("개별 자산 150 MB 제한");
        const reader = r.body!.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 150 * 1024 * 1024 || bytes + total > 700 * 1024 * 1024) {
            await reader.cancel();
            throw Error("자산 용량 제한");
          }
          chunks.push(value);
        }
        bytes += total;
        let blob = new Blob(chunks, {
          type:
            r.headers.get("content-type")?.split(";")[0] ||
            "application/octet-stream",
        });
        if (blob.type === "text/css" || resourceType === "stylesheet") {
          const collected = collectCSS(await blob.text(), url);
          blob = new Blob([collected.css], { type: "text/css" });
          for (const child of collected.urls) fetchAsset(child.url, child.kind);
        }
        await tx("assets", (s) => s.put({ url, blob, mime: blob.type }));
      } catch (e) {
        await tx("assets", (s) => s.put({ url, error: errorMessage(e) }));
      } finally {
        fetchWorkers--;
        pending.delete(job);
        pump();
      }
    })();
    pending.add(job);
  }
}
async function waitAssets() {
  while (pending.size || fetchQueue.length)
    await Promise.allSettled([...pending]);
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.target !== "offscreen") return;
  (async () => {
    await restored;
    if (msg.type === "status")
      return {
        ...state,
        detail:
          state.detail ||
          `자산 ${seen.size}개 확인 · 다운로드 ${fetchQueue.length + fetchWorkers}개 대기`,
      };
    if (msg.type === "download-finished") {
      if (downloadUrls.has(msg.id)) {
        URL.revokeObjectURL(downloadUrls.get(msg.id));
        downloadUrls.delete(msg.id);
        if (msg.complete) {
          state.exported = true;
          state.detail = "파일 저장이 완료되었습니다.";
        } else {
          state.detail =
            "파일 저장이 취소되었거나 실패했습니다. 다시 저장하세요.";
        }
        await persist();
      }
      return { ok: true };
    }
    if (msg.type === "start") {
      for (const name of ["records", "assets"])
        await tx(name, (s) => s.clear());
      seen.clear();
      bytes = 0;
      state = {
        active: true,
        exists: true,
        exported: false,
        startedAt: msg.session.startedAt,
        roomUrl: msg.roomUrl,
        duration: 0,
      };
      await persist();
      return { ok: true };
    }
    if (msg.type === "batch") {
      if (!state.active) return { ok: false };
      const records = msg.batch.filter(
        (e: ExternalRecord) => e.kind !== "asset",
      );
      for (const e of msg.batch)
        if (e.kind === "asset") fetchAsset(e.url, e.resourceType);
      for (const e of records) {
        if (e.kind === "meta")
          Object.assign(state, {
            adapter: e.adapter,
            captureMode: e.captureMode,
            recordingStartedAt: e.startedAt,
          });
        if (e.kind === "warning") state.error = e.text;
      }
      ordered = ordered
        .then(() => tx("records", (s) => s.add(records)))
        .catch(async (e) => {
          state.error =
            "저장 공간이 부족하거나 기록을 저장하지 못했습니다: " +
            errorMessage(e);
          state.active = false;
          await persist();
        });
      await ordered;
      await persist();
      return { ok: true };
    }
    if (msg.type === "stop") {
      await ordered;
      state.active = false;
      state.duration =
        Date.now() -
        (state.recordingStartedAt || state.startedAt || Date.now());
      await persist();
      return { ok: true };
    }
    if (msg.type === "export") {
      if (state.active) throw Error("기록을 먼저 종료하세요.");
      state.detail = "자산 다운로드와 파일 묶기를 마무리하는 중…";
      await waitAssets();
      await ordered;
      const batches = await tx("records", (s) => s.getAll(), "readonly");
      const saved = await tx("assets", (s) => s.getAll(), "readonly");
      const records: ExternalRecord[] = batches.flat();
      const data = captureData(records, {
        startedAt: state.recordingStartedAt || state.startedAt || Date.now(),
        duration: state.duration,
        roomUrl: state.roomUrl,
      });
      const files: Zippable = {};
      for (const [i, a] of saved.entries()) {
        if (a.error) {
          data.warnings!.push(`자산 저장 실패: ${a.url} (${a.error})`);
          continue;
        }
        const path = "assets/" + i;
        data.assets.push({ url: a.url, path, mime: a.mime, size: a.blob.size });
        files[path] = [
          new Uint8Array(await a.blob.arrayBuffer()),
          { level: 0 },
        ];
      }
      files["recording.json"] = strToU8(JSON.stringify(data));
      const blob = new Blob([new Uint8Array(zipSync(files, { level: 6 }))], {
        type: "application/zip",
      });
      if (blob.size > 1024 * 1024 * 1024)
        throw Error("파일이 1 GB를 넘습니다. 짧은 구간으로 나누어 기록하세요.");
      const url = URL.createObjectURL(blob);
      const filename =
        "CCReplay-" +
        new Date(data.startedAt!).toISOString().replace(/[:.]/g, "-") +
        ".ccreplay";
      const result = await chrome.runtime.sendMessage({
        target: "download",
        url,
        filename,
      });
      if (result.error) {
        URL.revokeObjectURL(url);
        throw Error(result.error);
      }
      downloadUrls.set(result.id, url);
      state.detail = `파일 저장 대기 · 자산 ${data.assets.length}개 · 주의 ${data.warnings!.length}건`;
      await persist();
      return { ok: true };
    }
  })()
    .then(respond)
    .catch((e) => respond({ error: errorMessage(e) }));
  return true;
});
