import test from "node:test";
import assert from "node:assert/strict";
import { trimIdleEdges } from "../src/core/trim.ts";
import { validateRecording, mediaPosition } from "../src/core/model.ts";
import { fixtureRecording } from "./fixtures/recording.ts";
import type { RecordingData } from "../src/core/types.ts";

function longSession(): RecordingData {
  const fixture = fixtureRecording();
  return {
    ...fixture,
    startedAt: 100000,
    duration: 24 * 3600000,
    frames: [{ ...fixture.frames[0], t: 0 }],
    messages: [{ ...fixture.messages[0], t: 0, initial: true }],
    audio: [
      {
        id: "bgm",
        t: 0,
        url: "https://example.com/song",
        position: 0,
        volume: 1,
        loop: true,
        rate: 1,
        paused: false,
      },
    ],
    events: [
      { type: 4, timestamp: 100000, data: {} },
      { type: 2, timestamp: 100010, data: {} },
    ],
  };
}
test("24-hour recording trims to four hours of activity with padding and preserves interior gaps", () => {
  const source = longSession();
  const hour = 3600000;
  source.frames.push({
    ...source.frames[0],
    t: 10 * hour,
    room: { ...source.frames[0].room, name: "changed" },
  });
  source.messages.push({
    ...source.messages[0],
    id: "later",
    initial: false,
    t: 14 * hour,
    text: "last message",
  });
  // Clock checkpoints/loop wrap do not keep a full day of idle BGM.
  for (let t = 5000; t < source.duration; t += 5000)
    source.audio.push({ ...source.audio[0], t, position: (t / 1000) % 180 });
  const checkpoint = source.startedAt! + 9 * hour;
  source.events.push(
    { type: 2, timestamp: checkpoint, data: {} },
    { type: 3, timestamp: checkpoint + 1000, data: { source: 0 } },
    { type: 2, timestamp: source.startedAt! + 23 * hour, data: {} },
  );
  const result = trimIdleEdges(source);
  validateRecording(result);
  assert.equal(result.duration, 4 * hour + 10000);
  assert.equal(result.trim!.start, 10 * hour - 5000);
  assert.equal(result.startedAt, source.startedAt! + result.trim!.start);
  assert.equal(result.frames[0].t, 0);
  assert.equal(result.frames[1].t, 5000);
  assert.equal(result.messages[0].t, 0);
  assert.equal(result.messages[1].t, 4 * hour + 5000);
  assert.equal(result.audio[0].t, 0);
  const prior = source.audio.filter((a) => a.t <= result.trim!.start).at(-1)!;
  assert.equal(
    result.audio[0].position,
    mediaPosition(prior, result.trim!.start),
  );
  assert.ok(
    result.events.some((e) => e.type === 2 && e.timestamp === checkpoint),
  );
  assert.ok(
    !result.events.some(
      (e) => e.timestamp > source.startedAt! + result.trim!.end,
    ),
  );
  assert.equal(
    source.duration,
    24 * hour,
    "input remains intact for full export",
  );
});
test("initial state and duplicate samples do not count as activity; zero-padding keeps a valid snapshot", () => {
  const source = longSession();
  source.frames.push({ ...source.frames[0], t: 10000 });
  source.messages.push({ ...source.messages[0], initial: false, t: 15000 });
  source.audio.push({ ...source.audio[0], t: 20000, position: 20 });
  const result = trimIdleEdges(source);
  assert.equal(result.duration, 5000);
  assert.equal(result.trim!.activityCount, 0);
  const still = trimIdleEdges(source, 0);
  assert.equal(still.duration, 0);
  assert.equal(still.events.length, 2);
  assert.equal(still.frames.length, 1);
  validateRecording(still);
});
test("chat edits/deletion and BGM controls count as changes; initial objects have correct state after a cut", () => {
  const source = longSession();
  source.messages.push(
    {
      ...source.messages[0],
      t: 60000,
      initial: false,
      text: "edited",
      edited: true,
    },
    { ...source.messages[0], t: 120000, initial: false, removed: true },
  );
  source.audio.push(
    { ...source.audio[0], t: 180000, volume: 0.5 },
    { ...source.audio[0], t: 240000, stopped: true },
  );
  const result = trimIdleEdges(source, 0);
  assert.equal(result.trim!.start, 60000);
  assert.equal(result.duration, 180000);
  assert.equal(result.messages[0].text, "edited");
  assert.equal(result.messages[0].initial, true);
  assert.equal(result.messages[1].removed, true);
  assert.equal(result.audio[0].position, 60);
  assert.equal(result.audio.at(-1)!.stopped, true);
  validateRecording(result);
});
