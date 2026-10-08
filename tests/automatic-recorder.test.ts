import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, appendFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecordingStore, exportSession } from "../recorder/storage.ts";
import { roomURL } from "../recorder/url.ts";
import { readArchive } from "../src/core/archive.ts";
import { fixtureRecording } from "./fixtures/recording.ts";

test("automatic recorder accepts public room URLs and validates duration/output options", () => {
  assert.equal(
    roomURL("https://ccfolia.com/rooms/abc?x=1#hash"),
    "https://ccfolia.com/rooms/abc",
  );
  for (const url of [
    "http://ccfolia.com/rooms/x",
    "https://ccfolia.com.evil.test/rooms/x",
    "https://user@ccfolia.com/rooms/x",
    "https://ccfolia.com/",
  ])
    assert.throws(() => roomURL(url));
});

test("unattended journal exports initial state, ordered changes and recursive CSS assets; recovery preserves partial data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ccreplay-auto-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = "https://storage.ccfolia-cdn.net/test/";
  const requests: string[] = [];
  const store = new RecordingStore(
    join(directory, "session"),
    { startedAt: 1000, roomUrl: "https://ccfolia.com/rooms/test" },
    async (url) => {
      requests.push(String(url));
      if (url === base + "app")
        return new Response("alert(1)", {
          headers: { "content-type": "text/javascript" },
        });
      if (url === base + "redirect")
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        });
      if (url === base + "theme.css")
        return new Response(
          '@font-face{font-family:sample;src:url("font.woff2")} .scene{background:url("image.png")}',
          { headers: { "content-type": "text/css" } },
        );
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      });
    },
  );
  await store.init();
  const fixture = fixtureRecording();
  await Promise.all([
    store.append([
      { kind: "meta", startedAt: 1200, adapter: true },
      { kind: "frame", ...fixture.frames[0], t: 0 },
      {
        kind: "event",
        event: {
          type: 2,
          timestamp: 1200,
          data: {
            node: { type: 0, id: 1, childNodes: [] },
            initialOffset: { top: 0, left: 0 },
          },
        },
      },
      { kind: "message", ...fixture.messages[0], t: 0, initial: true },
      { kind: "asset", url: base + "theme.css", resourceType: "stylesheet" },
      { kind: "asset", url: base + "theme.css" },
      { kind: "asset", url: base + "app" },
      { kind: "asset", url: base + "ignored.js" },
      { kind: "asset", url: base + "redirect" },
    ]),
    store.append([
      { kind: "frame", ...fixture.frames[1], t: 500 },
      { kind: "end", t: 1000 },
    ]),
  ]);
  await store.finish();
  const output = join(directory, "recording.ccreplay");
  const data = await exportSession(store.directory, output);
  assert.equal(data.startedAt, 1200);
  assert.equal(data.duration, 1000);
  assert.deepEqual(
    data.frames.map((f) => f.t),
    [0, 500],
  );
  assert.equal(data.messages[0].t, 0);
  assert.equal(data.assets.length, 3);
  assert.equal(requests.filter((url) => url.endsWith("theme.css")).length, 1);
  assert.ok(
    !requests.some(
      (url) => url.includes("127.0.0.1") || url.endsWith("ignored.js"),
    ),
  );
  assert.ok(data.warnings!.some((warning) => warning.includes("리디렉션")));
  assert.ok(!data.warnings!.some((warning) => warning.includes(base + "app")));
  const replay = await readArchive(
    new File([await readFile(output)], "recording.ccreplay"),
  );
  assert.equal(replay.data.frames.length, 2);
  assert.equal(replay.data.messages[0].t, 0);
  assert.ok(replay.rawAssets!.has(base + "font.woff2"));
  replay.release();
  await assert.rejects(exportSession(store.directory, output), /EEXIST/);
  await appendFile(join(store.directory, "records.ndjson"), '{"kind":"frame"');
  const recovered = await exportSession(
    store.directory,
    join(directory, "recovered.ccreplay"),
    true,
  );
  assert.equal(recovered.frames.length, 2);
  assert.ok(recovered.warnings!.some((warning) => warning.includes("복구")));
  await appendFile(
    join(store.directory, "records.ndjson"),
    '\n{"kind":"end","t":2}\n',
  );
  await assert.rejects(
    exportSession(store.directory, join(directory, "corrupt.ccreplay")),
    /중간/,
  );
});

test("corrupted downloaded assets fail export rather than producing a damaged replay", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ccreplay-auto-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new RecordingStore(
    join(directory, "session"),
    { startedAt: 1, roomUrl: "https://ccfolia.com/rooms/test" },
    async () =>
      new Response("bytes", { headers: { "content-type": "image/png" } }),
  );
  await store.init();
  await store.append([
    { kind: "frame", ...fixtureRecording().frames[0] },
    { kind: "event", event: { type: 2, timestamp: 1 } },
    { kind: "asset", url: "https://storage.ccfolia-cdn.net/test/image" },
  ]);
  await store.finish();
  const asset = JSON.parse(
    (await readFile(join(store.directory, "assets.ndjson"), "utf8")).trim(),
  );
  await writeFile(join(store.directory, "assets", asset.hash), "wrong");
  await assert.rejects(
    exportSession(store.directory, join(directory, "bad.ccreplay")),
    /무결성/,
  );
});
