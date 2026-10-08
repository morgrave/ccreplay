import type { AudioEvent, Frame, RecordingData } from "./types.ts";
import { audioAt, frameAt, mediaPosition, messagesAt } from "./model.ts";

export interface TrimInfo {
  sourceStartedAt: number;
  sourceDuration: number;
  start: number;
  end: number;
  activityCount: number;
}

// Canonical comparison ignores object insertion order and capture-only fields.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
function frameValue(frame: Frame) {
  return canonical({
    room: frame.room,
    tokens: [...frame.tokens].sort((a, b) => a.id.localeCompare(b.id)),
    items: [...frame.items].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    ),
    bgm: frame.bgm,
    cellSize: frame.cellSize,
  });
}
function audioValue(event: AudioEvent) {
  return canonical({
    url: event.url,
    paused: !!event.paused,
    stopped: !!event.stopped,
    loop: !!event.loop,
    rate: event.rate || 1,
    volume: Math.round((event.volume || 0) * 100),
  });
}

/** Only meaningful room changes count; playback clocks, loops and DOM animation do not. */
export function trimIdleEdges(
  source: RecordingData,
  padding = 5000,
): RecordingData {
  if (!Number.isFinite(padding) || padding < 0)
    throw Error("앞뒤 여유 시간은 0 이상의 밀리초여야 합니다.");
  let first = Infinity,
    last = 0,
    activityCount = 0;
  const add = (t: number) => {
    if (t > 0 && t <= source.duration) {
      first = Math.min(first, t);
      last = Math.max(last, t);
      activityCount++;
    }
  };
  let previousFrame: string | undefined;
  for (const frame of source.frames) {
    const value = frameValue(frame);
    if (previousFrame !== undefined && value !== previousFrame) add(frame.t);
    previousFrame = value;
  }
  const messages = new Map<string, string>();
  for (const message of source.messages) {
    const { t, initial, ...state } = message;
    const value = canonical(state);
    if (!initial && value !== messages.get(message.id)) add(t);
    messages.set(message.id, value);
  }
  const audio = new Map<string, string>();
  for (const event of source.audio) {
    const value = audioValue(event);
    const old = audio.get(event.id);
    // The first paused/initial player is a baseline, not a session action.
    if (
      old !== undefined
        ? old !== value
        : !event.paused && !event.stopped && event.t > 1000
    )
      add(event.t);
    audio.set(event.id, value);
  }
  const start = activityCount ? Math.max(0, first - padding) : 0;
  const end = activityCount
    ? Math.min(source.duration, last + padding)
    : Math.min(source.duration, padding);
  const startedAt = source.startedAt || 0;
  const initialFrame = frameAt(source.frames, start);
  const frames = [
    ...(initialFrame ? [{ ...initialFrame, t: 0 }] : []),
    ...source.frames
      .filter((f) => f.t > start && f.t <= end)
      .map((f) => ({ ...f, t: f.t - start })),
  ];
  const chat = [
    ...messagesAt(source.messages, start).map((m) => ({
      ...m,
      t: 0,
      initial: true,
    })),
    ...source.messages
      .filter((m) => m.t > start && m.t <= end)
      .map((m) => ({ ...m, t: m.t - start })),
  ];
  const tracks = [
    ...audioAt(source.audio, start).map((a) => ({
      ...a,
      position: mediaPosition(a, start),
      t: 0,
    })),
    ...source.audio
      .filter((a) => a.t > start && a.t <= end)
      .map((a) => ({ ...a, t: a.t - start })),
  ];
  // Retain the latest complete DOM checkpoint and its mutations to reconstruct the
  // state at the new zero. Absolute rrweb timestamps intentionally remain unchanged:
  // the player seeks to startedAt, so this preparation history is never shown as idle time.
  let checkpoint = source.events.findIndex((e) => e.type === 2);
  source.events.forEach((event, index) => {
    if (event.type === 2 && event.timestamp <= startedAt + start)
      checkpoint = index;
  });
  let events = source.events;
  if (checkpoint >= 0) {
    const meta = source.events
      .slice(0, checkpoint)
      .reverse()
      .find((e) => e.type === 4);
    const cutoff = Math.max(
      startedAt + end,
      source.events[checkpoint].timestamp,
    );
    events = [
      ...(meta ? [meta] : []),
      ...source.events.slice(checkpoint).filter((e) => e.timestamp <= cutoff),
    ];
  }
  return {
    ...source,
    frames,
    messages: chat,
    audio: tracks,
    events,
    startedAt: startedAt + start,
    duration: end - start,
    trim: {
      sourceStartedAt: startedAt,
      sourceDuration: source.duration,
      start,
      end,
      activityCount,
    },
  };
}
