export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export interface SerializedNode {
  id: number;
  type?: number;
  attributes?: Record<string, unknown>;
  textContent?: string;
  childNodes?: SerializedNode[];
}
export interface RoomEvent {
  type: number;
  timestamp?: number;
  data: {
    source?: number;
    node?: SerializedNode;
    initialOffset?: { top: number; left: number };
    adds?: { node: SerializedNode; parentId?: number }[];
    texts?: { id: number; value?: string }[];
    attributes?: { id: number; attributes: Record<string, unknown> }[];
    [key: string]: unknown;
  };
}
export interface ChatMessage {
  id: string;
  t: number;
  name: string;
  text: string;
  channel: string;
  channelName?: string;
  iconUrl?: string;
  /** CCfolia character portrait metadata, not an inline chat attachment. */
  imageUrl?: string;
  color?: string;
  createdAt?: number;
  /** Present in the first room-state snapshot, before recording changes. */
  initial?: boolean;
  removed?: boolean;
  private?: boolean;
  edited?: boolean;
}
