import test from "node:test";
import assert from "node:assert/strict";
import { CaptureProgress } from "../recorder/progress.ts";

test("recorder summaries count all channels and suppress BGM position-only log spam", () => {
  const progress = new CaptureProgress();
  progress.start(1000);
  const logs = progress.observe([
    { kind: "frame" },
    { kind: "message", channel: "main" },
    { kind: "message", channel: "other" },
    { kind: "message", channel: "custom", channelName: "QA" },
    { kind: "audio", id: "bgm", url: "test.wav", paused: false, position: 0 },
    { kind: "event" },
  ]);
  assert.ok(logs.some((log) => log.includes("메인")));
  assert.ok(logs.some((log) => log.includes("잡담")));
  assert.ok(logs.some((log) => log.includes("재생")));
  assert.ok(logs.some((log) => log.includes("QA")));
  assert.deepEqual(progress.snapshot(5000), {
    elapsed: 4000,
    frames: 1,
    messages: 3,
    audio: 1,
    events: 1,
  });
  assert.deepEqual(
    progress.observe([
      { kind: "audio", id: "bgm", url: "test.wav", paused: false, position: 5 },
    ]),
    [],
  );
  assert.ok(
    progress
      .observe([{ kind: "audio", id: "bgm", url: "test.wav", paused: true }])[0]
      .includes("일시 정지"),
  );
  progress.stop(6000);
  assert.equal(progress.snapshot(20000).elapsed, 5000);
});
