import type {
  ExternalRecord,
  Frame,
  AudioEvent,
  RecordingData,
} from "./types.ts";
import type { ChatMessage } from "../replay/types.ts";
import { replayWarnings } from "./resource-policy.ts";
export const FORMAT = "ccreplay";
export const VERSION = 1;
export const clamp = (n: unknown, min: number, max: number) =>
  Math.max(min, Math.min(max, Number(n) || 0));
export const escapeHTML = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c as "&"
      ],
  );
export const timeLabel = (ms: number) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return (
    (s >= 3600 ? String(Math.floor(s / 3600)).padStart(2, "0") + ":" : "") +
    String(Math.floor(s / 60) % 60).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0")
  );
};
const str = (s: unknown, max = 20000) => String(s ?? "").slice(0, max);
const num = (x: unknown, f = 0) => (Number.isFinite(Number(x)) ? Number(x) : f);
export function safeMediaURL(value: unknown) {
  try {
    const u = new URL(String(value || ""));
    return /^https?:$/.test(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function pickState(
  state: ExternalRecord,
  roomId: string,
  visibleItems: Record<string, ExternalRecord> = {},
) {
  const room = state?.entities?.rooms?.entities?.[roomId];
  if (!room)
    throw new Error(
      "코코포리아 방 상태를 찾지 못했습니다. 방을 완전히 연 뒤 다시 시작하세요.",
    );
  const pos = (o: ExternalRecord) => ({
    x: num(o.x),
    y: num(o.y),
    z: num(o.z),
    width: num(o.width, 2),
    height: num(o.height, 2),
    angle: num(o.angle),
  });
  const tokens = Object.entries<ExternalRecord>(
    state.entities.roomCharacters?.entities || {},
  )
    .filter(([, c]) => c?.active && (!c.roomId || c.roomId === roomId))
    .map(([id, c]) => ({
      id,
      ...pos(c),
      name: str(c.name),
      memo: str(c.memo),
      iconUrl: safeMediaURL(c.iconUrl),
      color: /^#[a-f\d]{3,8}$/i.test(c.color) ? c.color : "#c4bcab",
      status: c.hideStatus
        ? []
        : (c.status || []).map((s: ExternalRecord) => ({
            label: str(s.label, 100),
            value: str(s.value, 100),
            max: str(s.max, 100),
          })),
    }));
  const items = Object.entries<ExternalRecord>(
    state.entities.roomItems?.entities || {},
  )
    .filter(
      ([id, i]) => i && visibleItems[id] && (!i.roomId || i.roomId === roomId),
    )
    .map(([id, i]) => ({
      id,
      ...pos(i),
      imageUrl: safeMediaURL(visibleItems[id].imageUrl),
      text: !i.closed ? str(i.memo) : "",
      kind: "screen",
    }));
  const markers = Object.entries<ExternalRecord>(room.markers || {}).map(
    ([id, m]) => ({
      id,
      ...pos(m),
      imageUrl: safeMediaURL(m.imageUrl),
      text: str(m.text),
      kind: "marker",
    }),
  );
  return {
    room: {
      name: str(room.name, 300),
      backgroundUrl: safeMediaURL(room.backgroundUrl),
      foregroundUrl: safeMediaURL(room.foregroundUrl),
      fieldWidth: num(room.fieldWidth, 40),
      fieldHeight: num(room.fieldHeight, 30),
      fieldObjectFit: room.fieldObjectFit === "cover" ? "cover" : "fill",
      backgroundColor: /^#[a-f\d]{3,8}$/i.test(room.backgroundColor)
        ? room.backgroundColor
        : "#22252a",
      displayGrid: !!room.displayGrid,
      gridSize: num(room.gridSize, 1),
      sceneId: str(room.sceneId, 100),
    },
    tokens,
    items: [...items, ...markers],
    bgm: [
      {
        id: "bgm1",
        name: str(room.mediaName, 300),
        url: safeMediaURL(room.mediaUrl),
        volume: clamp(room.mediaVolume, 0, 1),
        loop: !!room.mediaRepeat,
      },
      {
        id: "bgm2",
        name: str(room.soundName, 300),
        url: safeMediaURL(room.soundUrl),
        volume: clamp(room.soundVolume, 0, 1),
        loop: !!room.soundRepeat,
      },
    ],
    view: {
      scale: num(state.app?.state?.roomScreenScale, 1),
      x: num(state.app?.state?.roomScreenPosition?.x),
      y: num(state.app?.state?.roomScreenPosition?.y),
    },
    cellSize: num(state.app?.state?.roomScreenCellSize, 24),
  };
}
export function pickMessages(
  state: ExternalRecord,
  roomId: string,
  includePrivate = false,
) {
  const uid = state.app?.user?.uid;
  const room = state.entities?.rooms?.entities?.[roomId];
  const groups = room?.messageGroups || [];
  const channelAllowed = (m: ExternalRecord) => {
    if (m.to)
      return !!(includePrivate && uid && (m.to === uid || m.from === uid));
    const group = groups.find((g: ExternalRecord) => g.id === m.channel);
    if (group)
      return (
        group.kind === "public" ||
        !!(includePrivate && uid && group.uids?.includes(uid))
      );
    return ["main", "info", "other", ...(room?.messageChannels || [])].includes(
      m.channel,
    );
  };
  return Object.entries<ExternalRecord>(
    state.entities?.roomMessages?.entities || {},
  )
    .filter(([, m]) => m && channelAllowed(m))
    .map(([id, m]) => ({
      id,
      name: str(m.name, 300),
      text: m.removed
        ? ""
        : m.extend?.roll?.secret && m.from !== uid
          ? "Secret dice 🎲"
          : str(m.text, 100000),
      channel: str(m.channel, 200),
      channelName: str(m.channelName || m.channel, 200),
      iconUrl: safeMediaURL(m.iconUrl),
      imageUrl: m.removed ? "" : safeMediaURL(m.imageUrl),
      color: /^#[a-f\d]{3,8}$/i.test(m.color) ? m.color : "#d8dbe1",
      removed: !!m.removed,
      edited: !!m.edited,
      private:
        !!m.to ||
        groups.some(
          (g: ExternalRecord) => g.id === m.channel && g.kind === "private",
        ),
      createdAt:
        num(m.createdAt?.seconds) * 1000 + num(m.createdAt?.nanoseconds) / 1e6,
    }));
}
export function frameAt<T extends { t: number }>(
  frames: T[],
  time: number,
): T | null {
  let lo = 0,
    hi = frames.length - 1,
    best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= time) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best < 0 ? null : frames[best];
}
export function messagesAt<
  T extends { id: string; t: number; removed?: boolean },
>(events: T[], time: number): T[] {
  const map = new Map();
  for (const m of events) {
    if (m.t > time) break;
    if (m.removed) map.delete(m.id);
    else map.set(m.id, m);
  }
  return [...map.values()];
}
export function audioAt<T extends { id: string; t: number; stopped?: boolean }>(
  events: T[],
  time: number,
): T[] {
  const map = new Map();
  for (const e of events) {
    if (e.t > time) break;
    if (e.stopped) map.delete(e.id);
    else map.set(e.id, e);
  }
  return [...map.values()];
}
export function mediaPosition(
  event: Pick<AudioEvent, "t" | "position" | "paused" | "rate">,
  time: number,
) {
  return Math.max(
    0,
    event.position +
      (event.paused ? 0 : ((time - event.t) / 1000) * (event.rate || 1)),
  );
}
export function validateRecording(data: ExternalRecord): RecordingData {
  if (data?.format !== FORMAT || data.version !== VERSION)
    throw new Error(
      "지원하지 않는 리플레이 형식입니다. CC Replay 기록 파일을 선택하세요.",
    );
  if (
    !Number.isFinite(data.duration) ||
    data.duration < 0 ||
    data.duration > 7 * 86400000
  )
    throw new Error("기록 길이가 올바르지 않습니다.");
  for (const k of ["frames", "messages", "audio", "events"]) {
    if (!Array.isArray(data[k]) || data[k].length > 2000000)
      throw new Error("기록 데이터가 올바르지 않거나 너무 큽니다.");
  }
  for (const k of ["frames", "messages", "audio"]) {
    let previous = -1;
    for (const e of data[k]) {
      if (
        !Number.isFinite(e.t) ||
        e.t < 0 ||
        e.t < previous ||
        e.t > data.duration + 2000
      )
        throw new Error("기록의 시간 순서가 올바르지 않습니다.");
      previous = e.t;
    }
  }
  for (const f of data.frames) {
    if (
      !f.room ||
      !Array.isArray(f.tokens) ||
      !Array.isArray(f.items) ||
      !Array.isArray(f.bgm)
    )
      throw new Error("장면 정보가 올바르지 않습니다.");
  }
  for (const e of data.audio) {
    if (
      !e.stopped &&
      (!Number.isFinite(e.position) || typeof e.url !== "string")
    )
      throw new Error("오디오 정보가 올바르지 않습니다.");
  }
  data.warnings = replayWarnings(data.warnings);
  return normalizeInitialMessages(data as RecordingData);
}

/** Older recorders timestamped the initial chat batch by observation delay. */
export function normalizeInitialMessages(data: RecordingData): RecordingData {
  const firstBatch = data.messages[0]?.t;
  const snapshot = data.events.find((event) => event.type === 2);
  const snapshotTime =
    snapshot && Number.isFinite(data.startedAt)
      ? snapshot.timestamp - data.startedAt!
      : -1;
  const legacyBatch =
    firstBatch !== undefined && firstBatch > 0 && firstBatch <= snapshotTime;
  const seen = new Set<string>();
  data.messages = data.messages
    .map((message) => {
      const first = !seen.has(message.id);
      seen.add(message.id);
      const existedBeforeStart =
        Number.isFinite(message.createdAt) &&
        message.createdAt! > 0 &&
        message.createdAt! <= (data.startedAt || 0);
      if (
        first &&
        !message.removed &&
        (message.initial === true ||
          (legacyBatch && message.t === firstBatch && existedBeforeStart))
      )
        return { ...message, t: 0, initial: true };
      return message;
    })
    .sort((a, b) => a.t - b.t);
  return data;
}
