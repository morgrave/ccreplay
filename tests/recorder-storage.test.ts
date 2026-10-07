import type { ExternalRecord } from "../src/core/types.ts";
import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { readArchive } from "../src/core/archive.ts";
import { demoRecording } from "../src/core/demo.ts";
test("offscreen capture persists 150000 events, exports a valid archive, and protects unsaved data", async (t) => {
  let listener: (
      msg: ExternalRecord,
      sender: object,
      respond: (value: ExternalRecord) => void,
    ) => void,
    download: ExternalRecord;
  const nativeFetch = globalThis.fetch;
  const cdn = "https://storage.ccfolia-cdn.net/users/test/files/image";
  globalThis.fetch = (url, options) =>
    url === cdn
      ? Promise.resolve(
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
          }),
        )
      : nativeFetch(url, options);
  t.after(() => {
    globalThis.fetch = nativeFetch;
  });
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener(fn: typeof listener) {
          listener = fn;
        },
      },
      async sendMessage(msg: ExternalRecord) {
        if (msg.target === "download") {
          download = msg;
          return { id: 17 };
        }
        return {};
      },
    },
  } as unknown as typeof chrome;
  await import("../extension/offscreen.ts");
  const call = (type: string, props = {}) =>
    new Promise<ExternalRecord>((resolve) =>
      listener({ target: "offscreen", type, ...props }, {}, resolve),
    );
  await call("start", {
    session: { startedAt: Date.now() },
    roomUrl: "https://ccfolia.com/rooms/test",
  });
  const frame = demoRecording().frames[0];
  const batch = [
    { kind: "asset", url: cdn },
    {
      kind: "meta",
      adapter: true,
      startedAt: Date.now(),
      viewport: { width: 1280, height: 720 },
    },
    { kind: "frame", ...frame },
    ...Array.from({ length: 150000 }, (_, i) => ({
      kind: "event",
      event: {
        type: 5,
        timestamp: Date.now() + i,
        data: { tag: "test", payload: {} },
      },
    })),
  ];
  assert.equal((await call("batch", { batch })).ok, true);
  await call("stop");
  const result = await call("export");
  assert.equal(result.ok, true, result.error);
  assert.equal(
    (await call("status")).exported,
    false,
    "download request is not confirmation of saved bytes",
  );
  const blob = await (await fetch(download!.url)).blob();
  const recording = await readArchive(new File([blob], "test.ccreplay"));
  assert.equal(recording.data.events.length, 150000);
  assert.equal(recording.data.frames.length, 1);
  assert.ok(recording.rawAssets!.has(cdn), "CCfolia CDN image is embedded");
  assert.equal("video" in recording.data, false);
  recording.release();
  await call("download-finished", { id: 17, complete: true });
  assert.equal((await call("status")).exported, true);
});
