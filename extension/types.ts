import type { ExternalRecord } from "../src/core/types.ts";
export interface RecorderState {
  active?: boolean;
  exists?: boolean;
  exported?: boolean;
  startedAt?: number;
  recordingStartedAt?: number;
  duration?: number;
  roomUrl?: string;
  captureMode?: string;
  adapter?: boolean;
  error?: string;
  detail?: string;
}
export interface Session {
  tabId?: number;
  channel?: string;
  startedAt?: number;
  active?: boolean;
}
declare global {
  interface Window {
    __ccReplayBridge?: boolean;
    __ccReplayRecorder?: boolean;
  }
  interface WindowEventMap {
    "ccreplay-start": CustomEvent<{ channel: string }>;
  }
}
export interface ReduxStore {
  getState(): ExternalRecord;
  subscribe(listener: () => void): () => void;
}
