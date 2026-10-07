import test from "node:test";
import assert from "node:assert/strict";
import { roomEventFilter } from "../src/core/room-events.ts";
import type { SerializedNode } from "../src/replay/types.ts";

test("room notices are removed while ordinary chat text remains", () => {
  const filter = roomEventFilter();
  const notice: SerializedNode = {
    id: 20,
    type: 2,
    attributes: { role: "alert" },
    childNodes: [
      { id: 21, type: 3, textContent: "감시 모드가 활성화되어 있습니다." },
    ],
  };
  const chat: SerializedNode = { id: 22, type: 3, textContent: "일반 채팅" };
  filter({ type: 2, data: { node: { id: 19, childNodes: [notice, chat] } } });
  assert.equal(notice.childNodes![0].textContent, "");
  assert.equal(notice.attributes!.style, "display:none");
  assert.equal(chat.textContent, "일반 채팅");
  const update = filter({
    type: 3,
    data: {
      source: 0,
      texts: [
        { id: 21, value: "새 안내" },
        { id: 22, value: "수정한 채팅" },
      ],
    },
  });
  assert.deepEqual(update!.data.texts, [{ id: 22, value: "수정한 채팅" }]);
});
test("room templates exclude device viewport, camera, mouse, scrolling and hover content", () => {
  const filter = roomEventFilter();
  assert.deepEqual(
    filter({ type: 4, data: { width: 3840, height: 2160 } })!.data,
    { width: 1280, height: 720 },
  );
  for (const source of [1, 2, 3, 4, 5, 6, 12])
    assert.equal(filter({ type: 3, data: { source } }), null);
  const move = {
    id: 1,
    attributes: { style: "transform:translate(300px,600px)" },
    childNodes: [
      {
        id: 2,
        attributes: { style: "transform:scale(3)" },
        childNodes: [
          {
            id: 3,
            attributes: { "data-field-object": "token" },
            childNodes: [],
          },
        ],
      },
    ],
  };
  const tooltip = {
    id: 4,
    type: 2,
    attributes: { role: "tooltip", rr_scrollTop: 250 },
    childNodes: [{ id: 5, type: 3, textContent: "hovered memo" }],
  };
  filter({
    type: 2,
    data: {
      node: { id: 100, childNodes: [move, tooltip] },
      initialOffset: { top: 500, left: 0 },
    },
  });
  assert.equal(move.attributes.style, "transform:translate(0px,0px)");
  assert.equal(move.childNodes[0].attributes.style, "transform:scale(1)");
  assert.equal(tooltip.childNodes[0].textContent, "");
  assert.equal(tooltip.attributes.rr_scrollTop, undefined);
  const mutation = filter({
    type: 3,
    data: {
      source: 0,
      attributes: [
        { id: 1, attributes: { style: "transform:translate(999px,999px)" } },
        { id: 3, attributes: { style: "transform:translate(24px,48px)" } },
      ],
    },
  });
  assert.equal(
    mutation!.data.attributes![0].attributes.style,
    "transform:translate(0px,0px)",
  );
  assert.equal(
    mutation!.data.attributes![1].attributes.style,
    "transform:translate(24px,48px)",
  );
});
