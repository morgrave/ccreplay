import test from "node:test";
import assert from "node:assert/strict";
import { RoomAudio } from "../recorder/room-audio.ts";
test("room effect playTime triggers once and old effect subscriptions stay silent", () => {
  const audio = new RoomAudio(1000);
  const effect = {
    playTime: 900,
    soundUrl: "https://ccfolia.com/effect.mp3",
    soundVolume: 0.5,
  };
  assert.deepEqual(audio.observeEffects({ effect }, 0), []);
  effect.playTime = 1200;
  assert.equal(audio.observeEffects({ effect }, 200).length, 1);
  assert.deepEqual(audio.observeEffects({ effect }, 5000), []);
});
test("room subscriptions record BGM even if no browser player exists, without polling samples", () => {
  const capture = new RoomAudio();
  const room = {
    mediaUrl: "https://ccfolia.com/music.mp3",
    mediaVolume: 0.5,
    mediaRepeat: true,
    mediaRef: "a",
  };
  assert.equal(capture.observe(room, 0)[0].initial, true);
  for (let t = 1; t <= 10000; t++)
    assert.equal(capture.observe(room, t).length, 0);
  room.mediaVolume = 0.8;
  const volume = capture.observe(room, 20000)[0];
  assert.equal(volume.position, 20);
  assert.equal(volume.volume, 0.8);
  room.mediaRef = "b";
  assert.equal(capture.observe(room, 25000)[0].position, 0);
  room.mediaUrl = "";
  assert.equal(capture.observe(room, 30000)[0].stopped, true);
  assert.equal(capture.observe(room, 40000).length, 0);
  room.mediaUrl = "https://ccfolia.com/music.mp3";
  assert.equal(capture.observe(room, 50000)[0].position, 0);
});
test("the first new BGM after an initially silent room is an activity", () => {
  const capture = new RoomAudio();
  assert.deepEqual(capture.observe({}, 0), []);
  assert.equal(
    capture.observe({ mediaUrl: "https://ccfolia.com/music.mp3" }, 5000)[0]
      .initial,
    false,
  );
});
