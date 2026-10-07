import test from "node:test";
import assert from "node:assert/strict";
import { zoomValue } from "../src/core/room-controls.ts";
test("zoom follows the recorded CCfolia slider bounds and step", () => {
  const slider = { min: "0.2", max: "2", step: "0.1" };
  assert.equal(zoomValue(0.05, slider), 0.2);
  assert.equal(zoomValue(5, slider), 2);
  assert.ok(Math.abs(zoomValue(1.11, slider) - 1.1) < 1e-10);
});
