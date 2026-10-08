import "../extension/recorder.ts";
import { discoverRoomRuntime } from "../extension/room-runtime.ts";
import type { ExternalRecord } from "../src/core/types.ts";

declare global {
  interface Window {
    __ccReplayWrite: (batch: ExternalRecord[]) => Promise<void>;
    __ccReplayAuto: {
      ready(): boolean;
      start(): void;
      stop(): Promise<void>;
    };
  }
}
let writes = Promise.resolve();
let failure: unknown;
window.__ccReplaySink = (batch) => {
  writes = writes
    .then(() => window.__ccReplayWrite(batch))
    .catch((error: unknown) => {
      failure = error;
    });
};
window.__ccReplayAuto = {
  ready() {
    const store = discoverRoomRuntime().store;
    const id = location.pathname.split("/")[2];
    return (
      !!store?.getState()?.entities?.rooms?.entities?.[id] &&
      !!document.querySelector("#root > *")
    );
  },
  start() {
    window.dispatchEvent(
      new CustomEvent("ccreplay-start", { detail: { channel: "headless" } }),
    );
  },
  async stop() {
    window.dispatchEvent(new Event("ccreplay-stop"));
    await writes;
    if (failure) throw failure;
  },
};
