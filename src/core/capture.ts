import type { ExternalRecord, RecordingData } from "./types.ts";

/** Shared by the extension exporter and the unattended recorder. */
export function captureData(
  records: ExternalRecord[],
  session: {
    startedAt: number;
    duration?: number;
    roomUrl?: string;
    title?: string;
  },
): RecordingData {
  const meta = records.find((r) => r.kind === "meta");
  const data: RecordingData = {
    format: "ccreplay",
    version: 1,
    title:
      session.title ||
      records.find((r) => r.kind === "frame")?.room?.name ||
      "코코포리아 세션",
    startedAt: meta?.startedAt || session.startedAt,
    roomUrl: session.roomUrl,
    duration: records.reduce(
      (max, r) => Math.max(max, Number(r.t) || 0),
      session.duration || 0,
    ),
    frames: records.filter(
      (r) => r.kind === "frame",
    ) as RecordingData["frames"],
    messages: records.filter(
      (r) => r.kind === "message",
    ) as RecordingData["messages"],
    audio: records.filter((r) => r.kind === "audio") as RecordingData["audio"],
    events: records.filter((r) => r.kind === "event").map((r) => r.event),
    assets: [],
    warnings: records
      .filter((r) => r.kind === "warning")
      .map((r) => String(r.text)),
    captureMode: meta?.captureMode || "room-state",
    adapter: !!meta?.adapter,
  };
  if (!data.audio.length && data.frames.some((f) => f.bgm?.some((b) => b.url)))
    data.warnings!.push(
      "BGM은 설정되어 있지만 실제 재생 위치를 발견하지 못했습니다. 방에서 음원을 재생한 후 기록해 주세요.",
    );
  return data;
}

export function allowedAssetURL(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.hostname === "ccfolia.com" ||
        u.hostname.endsWith(".ccfolia.com") ||
        [
          "storage.ccfolia-cdn.net",
          "firebasestorage.googleapis.com",
          "storage.googleapis.com",
          "fonts.googleapis.com",
          "fonts.gstatic.com",
        ].includes(u.hostname) ||
        u.hostname.endsWith(".firebasestorage.app"))
    );
  } catch {
    return false;
  }
}
