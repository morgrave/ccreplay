import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareEpisode,
  mergePatch,
  emptyCatalog,
  hashBytes,
  libraryAssetLoader,
  patchBlob,
  unpackPatch,
  loadEpisode,
} from "../src/core/library.ts";
import { fixtureRecording } from "./fixtures/recording.ts";
function recording(url: string, bytes: string) {
  const data = fixtureRecording();
  data.assets = [
    { url, path: "assets/a", mime: "audio/wav", size: bytes.length },
  ];
  return {
    data,
    release() {},
    assets: new Map(),
    rawAssets: new Map([[url, new Blob([bytes], { type: "audio/wav" })]]),
  };
}
test("different URLs with identical bytes share assets; changed bytes at same URL remain independent", async () => {
  const initial = emptyCatalog(),
    first = await prepareEpisode(
      recording("https://a.test/1", "sound"),
      initial,
      { campaignTitle: "Campaign", title: "Day 1" },
    ),
    catalog = mergePatch(initial, first.patch);
  const same = await prepareEpisode(
    recording("https://b.test/signed?token=2", "sound"),
    catalog,
    { campaignId: first.patch.campaign.id, title: "Day 2" },
  );
  assert.equal(same.stats.newBytes, 0);
  assert.equal(same.stats.reusedBytes, 5);
  const changed = await prepareEpisode(
    recording("https://a.test/1", "new"),
    catalog,
    { campaignId: first.patch.campaign.id, title: "Day 3" },
  );
  assert.equal(changed.stats.newBytes, 3);
  const combined = mergePatch(mergePatch(catalog, same.patch), changed.patch);
  assert.equal(combined.campaigns[0].episodes.length, 3);
  assert.equal(Object.keys(combined.objects).length, 2);
  assert.equal(
    mergePatch(combined, same.patch).campaigns[0].episodes.length,
    3,
    "reapplying the same patch is idempotent",
  );
});

test("opening an episode fetches only its manifest and referenced assets", async () => {
  const prepared = await prepareEpisode(
    recording("https://test/a", "sound"),
    emptyCatalog(),
    { campaignTitle: "C", title: "E" },
  );
  const other = await prepareEpisode(
    recording("https://test/b", "unrelated"),
    emptyCatalog(),
    { campaignTitle: "Other", title: "Other episode" },
  );
  const files = { ...prepared.files, ...other.files };
  const original = globalThis.fetch;
  const requested: string[] = [];
  try {
    globalThis.fetch = async (url) => {
      const path = new URL(String(url)).pathname.replace("/repo/library/", "");
      requested.push(path);
      assert(files[path], "unexpected library request");
      return new Response(files[path]);
    };
    const result = await loadEpisode(
      "https://user.github.io/repo/library/",
      prepared.patch.episode,
    );
    assert.deepEqual(new Set(requested), new Set(Object.keys(prepared.files)));
    assert(!requested.some((path) => Object.hasOwn(other.files, path)));
    result.release();
  } finally {
    globalThis.fetch = original;
  }
});

test("leaving an episode aborts loading before requesting the next asset", async () => {
  const source = recording("https://test/a", "sound");
  source.data.assets.push({
    url: "https://test/b",
    path: "assets/b",
    mime: "audio/wav",
    size: 6,
  });
  source.rawAssets.set("https://test/b", new Blob(["second"]));
  const prepared = await prepareEpisode(source, emptyCatalog(), {
    campaignTitle: "C",
    title: "E",
  });
  const controller = new AbortController();
  const original = globalThis.fetch;
  const requested: string[] = [];
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options?.signal, controller.signal);
      const path = new URL(String(url)).pathname.replace("/repo/library/", "");
      requested.push(path);
      return new Response(prepared.files[path]);
    };
    await assert.rejects(
      () =>
        loadEpisode(
          "https://user.github.io/repo/library/",
          prepared.patch.episode,
          () => controller.abort(),
          controller.signal,
        ),
      { name: "AbortError" },
    );
    assert.equal(
      requested.length,
      2,
      "only manifest and first asset were requested",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("progressive episodes return media URLs before downloading media; export still verifies bytes", async () => {
  const prepared = await prepareEpisode(
    recording("https://test/music", "sound"),
    emptyCatalog(),
    { campaignTitle: "C", title: "E" },
  );
  const base =
    "https://raw.githubusercontent.com/user/repo/revision/public/library/";
  const requests: string[] = [];
  const progress: { bytes: number; phase: string }[] = [];
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const path = String(url).slice(base.length);
      requests.push(path);
      return new Response(prepared.files[path]);
    };
    const result = await loadEpisode(
      base,
      prepared.patch.episode,
      (bytes, phase) => progress.push({ bytes, phase }),
      undefined,
      { progressive: true },
    );
    assert.deepEqual(requests, [prepared.patch.episode.manifest]);
    assert.deepEqual(progress.at(-1), {
      bytes: prepared.patch.episode.bytes,
      phase: "preparing",
    });
    assert.ok(
      progress.some(
        (p) =>
          p.phase === "recording" && p.bytes === prepared.patch.episode.bytes,
      ),
    );
    assert.ok(!progress.some((p) => p.phase === "assets"));
    assert.equal(result.assetOrigin, "https://raw.githubusercontent.com");
    assert(
      result.assets.get("https://test/music")?.startsWith(base + "assets/"),
    );
    const blob = await result.resolveAsset!("https://test/music");
    assert.equal(await blob.text(), "sound");
    assert.equal(requests.length, 2);
    result.release();
  } finally {
    globalThis.fetch = original;
  }
});
test("patch archive is additive and never contains an authoritative catalog replacement", async () => {
  const p = await prepareEpisode(
    recording("https://test/a", "a"),
    emptyCatalog(),
    { campaignTitle: "C", title: "E" },
  );
  const packed = await patchBlob(p);
  const loaded = await unpackPatch(new Uint8Array(await packed.arrayBuffer()));
  assert.deepEqual(loaded.patch, p.patch);
  assert(!Object.keys(loaded.files).some((x) => x.includes("index.json")));
  assert(loaded.files[p.patch.episode.manifest]);
});
test("shared asset loader validates each part and complete file, preserving Pages subdirectory", async () => {
  const bytes = new TextEncoder().encode("asset"),
    hash = await hashBytes(bytes),
    original = globalThis.fetch;
  let fetched;
  try {
    globalThis.fetch = async (url) => {
      fetched = String(url);
      return new Response(bytes);
    };
    const asset = { sha256: hash, size: 5, parts: [{ hash, size: 5 }] };
    assert.deepEqual(
      await libraryAssetLoader(new URL("https://user.github.io/repo/library/"))(
        asset,
      ),
      bytes,
    );
    assert.equal(fetched, "https://user.github.io/repo/library/assets/" + hash);
    globalThis.fetch = async () => new Response("wrong");
    await assert.rejects(
      () =>
        libraryAssetLoader(new URL("https://user.github.io/repo/library/"))(
          asset,
        ),
      /일치/,
    );
    await assert.rejects(
      () =>
        libraryAssetLoader(new URL("https://user.github.io/repo/library/"))({
          ...asset,
          parts: [{ hash: "../secret", size: 5 }],
        }),
      /올바르지/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("shared assets use decoded body size rather than compressed transfer length", async () => {
  const bytes = new TextEncoder().encode("asset");
  const hash = await hashBytes(bytes);
  const asset = {
    sha256: hash,
    size: bytes.length,
    parts: [{ hash, size: bytes.length }],
  };
  const original = globalThis.fetch;
  try {
    // Browser Fetch exposes the decoded body while retaining wire headers.
    globalThis.fetch = async () =>
      new Response(bytes, {
        headers: { "content-encoding": "gzip", "content-length": "25" },
      });
    assert.deepEqual(
      await libraryAssetLoader("https://user.github.io/repo/library/")(asset),
      bytes,
    );
    globalThis.fetch = async () =>
      new Response("asset-too-large", {
        headers: { "content-encoding": "gzip", "content-length": "3" },
      });
    await assert.rejects(
      () => libraryAssetLoader("https://user.github.io/repo/library/")(asset),
      /파일 크기가 한도를 넘습니다/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
