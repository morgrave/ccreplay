import test from "node:test";
import assert from "node:assert/strict";
import { scrollStateAt } from "../src/core/scroll.ts";
test("seeking restores snapshot scroll, subsequent scroll, and checkpoint reset", () => {
  const events = [
    {
      type: 2,
      timestamp: 100,
      data: {
        node: {
          id: 1,
          childNodes: [{ id: 2, attributes: { rr_scrollTop: 2961 } }],
        },
      },
    },
    { type: 3, timestamp: 200, data: { source: 3, id: 2, x: 0, y: 120 } },
    { type: 2, timestamp: 300, data: { node: { id: 1, childNodes: [] } } },
  ];
  assert.equal(scrollStateAt(events, 150).get(2)!.y, 2961);
  assert.equal(scrollStateAt(events, 250).get(2)!.y, 120);
  assert.equal(scrollStateAt(events, 350).size, 0);
  assert.equal(scrollStateAt(events, 50).size, 0);
});
