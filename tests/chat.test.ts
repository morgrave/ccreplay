import test from "node:test";
import assert from "node:assert/strict";
import { channelMessages, ChatTimeline } from "../src/replay/chat.ts";
import { tokenTooltipStyle } from "../src/replay/tooltip.ts";
import { normalizeInitialMessages } from "../src/core/model.ts";
import { fixtureRecording } from "./fixtures/recording.ts";
test("channel selection respects time, edits and deletion without leaking other tabs", () => {
  const messages = [
    { id: "a", t: 0, channel: "main", text: "first" },
    { id: "b", t: 0, channel: "other", text: "chat" },
    { id: "a", t: 10, channel: "main", text: "edited" },
    { id: "b", t: 20, channel: "other", removed: true },
  ].map((message) => ({ name: "speaker", text: "", ...message }));
  assert.equal(channelMessages(messages, 0, "main")[0].text, "first");
  assert.equal(channelMessages(messages, 15, "main")[0].text, "edited");
  assert.equal(channelMessages(messages, 15, "other").length, 1);
  assert.equal(channelMessages(messages, 20, "other").length, 0);
  assert.equal(channelMessages(messages, 20, "info").length, 0);
});

test("indexed chat seeks preserve edits, moves, deletion and reinserted order", () => {
  const messages = [
    { id: "a", t: 0, channel: "main", text: "first" },
    { id: "b", t: 0, channel: "main", text: "second" },
    { id: "c", t: 0, channel: "other", text: "chat" },
    { id: "a", t: 10, channel: "main", text: "edited" },
    { id: "b", t: 20, channel: "main", removed: true },
    { id: "a", t: 30, channel: "other", text: "moved" },
    { id: "d", t: 40, channel: "main", text: "fourth" },
    { id: "b", t: 50, channel: "main", text: "returned" },
  ].map((message) => ({ name: "speaker", text: "", ...message }));
  const timeline = new ChatTimeline(messages);
  for (const time of [50, 0, 35, 15, 25, 50, -1, 0, 60, 10]) {
    for (const channel of ["main", "other", "info"])
      assert.deepEqual(
        timeline.at(time, channel),
        channelMessages(messages, time, channel),
      );
  }
});

test("chat snapshots are reused between events and across unrelated channel changes", () => {
  const timeline = new ChatTimeline([
    { id: "a", t: 0, channel: "main", name: "A", text: "first" },
    { id: "b", t: 10, channel: "other", name: "B", text: "other" },
    { id: "a", t: 20, channel: "main", name: "A", text: "edited" },
  ]);
  const initial = timeline.at(0, "main");
  assert.equal(timeline.at(5, "main"), initial);
  assert.equal(timeline.at(15, "main"), initial);
  assert.equal(timeline.at(0, "main"), initial);
  const edited = timeline.at(20, "main");
  assert.notEqual(edited, initial);
  assert.equal(edited[0].text, "edited");
  assert.equal(timeline.at(30, "main"), edited);
});

test("legacy initial chat is visible at zero without moving new messages or later edits", () => {
  const data = fixtureRecording();
  data.startedAt = 1000;
  data.events = [{ type: 2, timestamp: 1099 }];
  data.messages = [
    {
      id: "old",
      t: 25,
      channel: "main",
      name: "A",
      text: "already present",
      createdAt: 900,
    },
    {
      id: "new",
      t: 25,
      channel: "main",
      name: "B",
      text: "new message",
      createdAt: 1025,
    },
    {
      id: "later",
      t: 200,
      channel: "main",
      name: "C",
      text: "loaded later",
      createdAt: 800,
    },
    {
      id: "old",
      t: 300,
      channel: "main",
      name: "A",
      text: "edit",
      createdAt: 900,
      edited: true,
    },
    { id: "old", t: 400, channel: "main", name: "A", text: "", removed: true },
  ];
  normalizeInitialMessages(data);
  assert.deepEqual(
    channelMessages(data.messages, 0, "main").map((m) => m.text),
    ["already present"],
  );
  assert.equal(data.messages.find((m) => m.id === "new")?.t, 25);
  assert.equal(data.messages.find((m) => m.id === "later")?.t, 200);
  assert.equal(
    channelMessages(data.messages, 350, "main").find((m) => m.id === "old")
      ?.text,
    "edit",
  );
  assert(
    !channelMessages(data.messages, 450, "main").some((m) => m.id === "old"),
  );
  const once = JSON.stringify(data.messages);
  normalizeInitialMessages(data);
  assert.equal(JSON.stringify(data.messages), once);
});

test("explicit initial state works without a legacy snapshot timing inference", () => {
  const data = fixtureRecording();
  data.messages = [
    {
      id: "a",
      t: 25,
      channel: "info",
      name: "A",
      text: "initial info",
      initial: true,
    },
  ];
  normalizeInitialMessages(data);
  assert.equal(
    channelMessages(data.messages, 0, "info")[0].text,
    "initial info",
  );
});
test("token tooltip preserves the verified CCfolia theme rather than MUI defaults", () => {
  assert.equal(tokenTooltipStyle.fontSize, "0.75rem");
  assert.equal(tokenTooltipStyle.backgroundColor, "rgb(22, 22, 22)");
  assert.equal(tokenTooltipStyle.whiteSpace, "pre-wrap");
});
