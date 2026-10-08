import type { RecorderConfig } from "../recorder/config.ts";
import type { RecorderProgress } from "../recorder/progress.ts";

export interface StartRequest {
  roomId: string;
  title: string;
  duration: number;
  trim: boolean;
  padding: number;
}
export interface DesktopState {
  config?: RecorderConfig;
  configPath: string;
  outputDir: string;
  active: boolean;
  stopping: boolean;
  output?: string;
  error?: string;
  progress?: RecorderProgress;
  logs: { time: number; text: string }[];
}
export interface RecorderAPI {
  state(): Promise<DesktopState>;
  start(request: StartRequest): Promise<void>;
  stop(): Promise<void>;
  reload(): Promise<void>;
  openConfig(): Promise<void>;
  chooseOutput(): Promise<void>;
  openOutput(): Promise<void>;
  recover(): Promise<void>;
  subscribe(callback: (state: DesktopState) => void): () => void;
}
declare global {
  interface Window {
    recorder: RecorderAPI;
  }
}
