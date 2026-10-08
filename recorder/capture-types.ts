import type { ExternalRecord } from "../src/core/types.ts";
declare global {
  interface Window {
    __ccReplayRecorder?: boolean;
    /** The headless host persists these batches before acknowledging a stop. */
    __ccReplaySink?: (batch: ExternalRecord[]) => void;
  }
  interface WindowEventMap {
    "ccreplay-start": CustomEvent;
  }
}
export interface ReduxStore {
  getState(): ExternalRecord;
  subscribe(listener: () => void): () => void;
}
