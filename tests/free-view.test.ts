import test from "node:test";
import assert from "node:assert/strict";
import { cameraLayers, tooltipClass } from "../src/core/free-view.ts";
test("camera selection uses the map transform pair, not fixed UI ancestors", () => {
  const header = { style: { transform: "" } },
    move = {
      style: { transform: "translate(419px,-1853px)" },
      parentElement: header,
    };
  const scale = { style: { transform: "scale(1.1)" }, parentElement: move };
  const objects = [
    { parentElement: scale },
    { parentElement: scale },
    { parentElement: header },
  ];
  const result = cameraLayers({
    querySelectorAll: () => objects,
  } as unknown as Document);
  assert.deepEqual(result, [{ move, scale }]);
  assert.ok(
    !result.some((layer) => layer.move === header || layer.scale === header),
  );
});
test("tooltip styling comes from recorded CCfolia tooltip classes", () => {
  assert.equal(
    tooltipClass([
      {
        type: 3,
        data: {
          adds: [
            {
              node: {
                id: 100,
                attributes: {
                  class:
                    "MuiTooltip-tooltip MuiTooltip-tooltipPlacementTop css-recorded",
                },
              },
            },
          ],
        },
      },
    ]),
    "MuiTooltip-tooltip MuiTooltip-tooltipPlacementTop css-recorded",
  );
  assert.equal(
    tooltipClass([
      {
        type: 2,
        data: {
          node: { id: 100, attributes: { class: "unrelated" }, childNodes: [] },
        },
      },
    ]),
    "",
  );
});
