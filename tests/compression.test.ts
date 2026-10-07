import test from "node:test";
import assert from "node:assert/strict";
import { compress } from "../src/core/compression.ts";

test("large compressed manifests round-trip and invalid ZIPs reject", async () => {
  const input = new TextEncoder().encode(
    JSON.stringify({
      events: Array.from({ length: 20000 }, (_, id) => ({
        id,
        text: "replay event",
      })),
    }),
  );
  const zip = await compress({
    operation: "zip",
    input: { "recording.json": input, "ignored.txt": input },
  });
  const files = await compress({
    operation: "unzip",
    input: zip,
    recordingOnly: true,
  });
  assert.deepEqual(files["recording.json"], input);
  assert.equal(files["ignored.txt"], undefined);
  await assert.rejects(
    compress({ operation: "unzip", input: new Uint8Array([1, 2, 3]) }),
  );
});

test("browser worker load failures reject rather than leaving the operation pending", async () => {
  const oldWindow = globalThis.window,
    oldWorker = globalThis.Worker;
  let terminated = false;
  globalThis.window = {} as Window & typeof globalThis;
  globalThis.Worker = class {
    onerror!: (event: { preventDefault(): void }) => void;
    postMessage() {
      queueMicrotask(() => this.onerror({ preventDefault() {} }));
    }
    terminate() {
      terminated = true;
    }
  } as unknown as typeof Worker;
  try {
    await assert.rejects(
      compress({ operation: "unzip", input: new Uint8Array() }),
      /압축 처리기/,
    );
    assert.equal(terminated, true);
  } finally {
    if (oldWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else globalThis.window = oldWindow;
    if (oldWorker === undefined) Reflect.deleteProperty(globalThis, "Worker");
    else globalThis.Worker = oldWorker;
  }
});
