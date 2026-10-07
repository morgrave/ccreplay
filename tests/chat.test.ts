import test from "node:test";
import assert from "node:assert/strict";
import { channelMessages } from "../src/replay/chat.ts";
import { tokenTooltipStyle } from "../src/replay/tooltip.ts";
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
test("token tooltip preserves the verified CCfolia theme rather than MUI defaults", () => {
  assert.equal(tokenTooltipStyle.fontSize, "0.75rem");
  assert.equal(tokenTooltipStyle.backgroundColor, "rgb(22, 22, 22)");
  assert.equal(tokenTooltipStyle.whiteSpace, "pre-wrap");
});
