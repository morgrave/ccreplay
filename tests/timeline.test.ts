import test from "node:test";
import assert from "node:assert/strict";
import { bindTimeline } from "../src/replay/timeline.ts";

class Range extends EventTarget {
  value = "0";
  setPointerCapture() {}
  emit(type: string, extra = {}) {
    this.dispatchEvent(Object.assign(new Event(type), extra));
  }
}
function setup() {
  const input = new Range(),
    commits: number[] = [],
    previews: number[] = [];
  let begins = 0;
  bindTimeline(input as unknown as HTMLInputElement, {
    begin() {
      begins++;
    },
    preview(value) {
      previews.push(value);
    },
    commit(value) {
      commits.push(value);
    },
  });
  return { input, commits, previews, begins: () => begins };
}
test("100 drag updates preview immediately and restore the room only once on release", () => {
  const { input, commits, previews, begins } = setup();
  input.emit("pointerdown", { pointerId: 1 });
  for (let i = 1; i <= 100; i++) {
    input.value = String(i);
    input.emit("input");
  }
  assert.equal(previews.length, 100);
  assert.equal(begins(), 1);
  assert.deepEqual(commits, []);
  input.emit("pointerup");
  input.emit("change");
  input.emit("lostpointercapture");
  assert.deepEqual(commits, [100]);
});
test("held arrow keys defer changes until keyup; accessible change and blur also commit", () => {
  const { input, commits } = setup();
  for (let i = 1; i <= 5; i++) {
    input.emit("keydown", { key: "ArrowRight" });
    input.value = String(i);
    input.emit("input");
    input.emit("change");
  }
  assert.deepEqual(commits, []);
  input.emit("keyup", { key: "ArrowRight" });
  assert.deepEqual(commits, [5]);
  input.value = "10";
  input.emit("input");
  input.emit("change");
  input.emit("pointerdown");
  input.value = "20";
  input.emit("input");
  input.emit("blur");
  assert.deepEqual(commits, [5, 10, 20]);
});
