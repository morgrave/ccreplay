import type { ChatMessage, RoomEvent, Camera } from "../replay/types.ts";

// CCfolia/rrweb expose versioned, dynamic objects. Keep that boundary separate
// from the typed recording format used by the player and shared-asset library.
export type ExternalRecord = Record<string, any>;
export interface AudioEvent {
  initial?: boolean;
  id: string;
  t: number;
  url: string;
  position: number;
  volume: number;
  rate?: number;
  loop?: boolean;
  paused?: boolean;
  stopped?: boolean;
  name?: string;
}
export interface Asset {
  url: string;
  path: string;
  mime: string;
  size: number;
  sha256?: string;
  parts?: { hash: string; size: number }[];
}
export interface RecordingData {
  format: string;
  version: number;
  duration: number;
  title?: string;
  startedAt?: number;
  roomUrl?: string;
  captureMode?: string;
  frames: Frame[];
  messages: ChatMessage[];
  audio: AudioEvent[];
  events: ExternalRecord[];
  assets: Asset[];
  warnings?: string[];
  viewport?: { width: number; height: number };
  reference?: boolean;
  sampleKind?: string;
  assetStorage?: string;
  adapter?: boolean;
  audioSource?: "room-state-v1";
  trim?: import("./trim.ts").TrimInfo;
}
export interface Token {
  id: string;
  name: string;
  memo: string;
  text?: string;
  iconUrl: string;
  color: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  angle: number;
  status: { label: string; value: string | number; max: string | number }[];
}
export interface Frame {
  /** False for initial subscription/DOM hydration; omitted in legacy files. */
  activity?: boolean;
  t: number;
  room: ExternalRecord;
  tokens: Token[];
  items: ExternalRecord[];
  bgm: ExternalRecord[];
  cellSize: number;
  view?: Camera;
}
export interface Recording {
  data: RecordingData;
  assets: Map<string, string>;
  rawAssets?: Map<string, Blob>;
  /** Trusted library origin for browser-native progressive media loading. */
  assetOrigin?: string;
  resolveAsset?: (url: string) => Promise<Blob>;
  release(): void;
}
export interface Episode {
  id: string;
  title: string;
  date: string;
  duration: number;
  manifest: string;
  bytes: number;
  assetCount: number;
  assetBytes: number;
  createdAt: string;
  sampleKind?: string;
}
export interface Campaign {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  episodes: Episode[];
}
export interface Catalog {
  version: number;
  revision: string;
  campaigns: Campaign[];
  objects: Record<string, number>;
}
export interface LibraryPatch {
  format: string;
  version: number;
  baseRevision: string;
  campaign: Omit<Campaign, "episodes">;
  episode: Episode;
  objects: Record<string, number>;
}
export interface PreparedEpisode {
  patch: LibraryPatch;
  files: Record<string, Uint8Array<ArrayBuffer>>;
  stats: {
    originalBytes: number;
    newBytes: number;
    reusedBytes: number;
    manifestBytes: number;
  };
}
export interface EpisodeDetails {
  campaignId?: string;
  title?: string;
  campaignTitle?: string;
  date?: string;
}
export interface PrepareProgress {
  done: number;
  total: number;
  newBytes: number;
  originalBytes: number;
}
