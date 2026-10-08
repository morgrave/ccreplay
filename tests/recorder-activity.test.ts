import test from "node:test";
import assert from "node:assert/strict";
import { RoomActivity } from "../recorder/activity.ts";

test("room activity excludes viewer layout and late old documents but retains genuine token and BGM changes", () => {
  const state = {
    app: { state: { roomScreenCellSize: 24 } },
    entities: {
      rooms: {
        entities: {
          test: {
            name: "Room",
            mediaUrl: "https://ccfolia.com/bgm",
            mediaRef: "initial",
          },
        },
      },
      roomCharacters: {
        entities: {} as Record<
          string,
          { active: boolean; x: number; updatedAt: number }
        >,
      },
    },
  };
  const activity = new RoomActivity(100000);
  assert.equal(activity.observe(state, "test"), false);
  state.app.state.roomScreenCellSize = 30;
  assert.equal(activity.observe(state, "test"), false);
  state.entities.roomCharacters.entities.old = {
    active: true,
    x: 0,
    updatedAt: 90000,
  };
  assert.equal(activity.observe(state, "test"), false);
  state.entities.roomCharacters.entities.old.x = 10;
  assert.equal(activity.observe(state, "test"), true);
  state.entities.roomCharacters.entities.new = {
    active: true,
    x: 0,
    updatedAt: 110000,
  };
  assert.equal(activity.observe(state, "test"), true);
  state.entities.rooms.entities.test.mediaRef = "restart";
  assert.equal(activity.observe(state, "test"), true);
});
