import type { ExternalRecord } from "../src/core/types.ts";

export interface RecorderProgress {
  phase: "connecting" | "recording" | "saving" | "complete";
  elapsed: number;
  frames: number;
  messages: number;
  audio: number;
  events: number;
  assets: number;
  assetErrors: number;
  pendingAssets: number;
  bytes: number;
}

/** Small, bounded UI summaries; the full data remains in the disk journal. */
export class CaptureProgress {
  private startedAt = 0;
  private stoppedAt = 0;
  private counts = { frames: 0, messages: 0, audio: 0, events: 0 };
  private audioStates = new Map<string, string>();
  start(now = Date.now()) {
    this.startedAt = now;
    this.stoppedAt = 0;
  }
  stop(now = Date.now()) {
    this.stoppedAt = now;
  }
  snapshot(now = Date.now()) {
    return {
      ...this.counts,
      elapsed: this.startedAt ? (this.stoppedAt || now) - this.startedAt : 0,
    };
  }
  observe(records: ExternalRecord[]): string[] {
    const logs: string[] = [];
    let frames = 0;
    const channels = new Map<string, number>();
    for (const r of records) {
      if (r.kind === "frame") {
        this.counts.frames++;
        frames++;
      }
      if (r.kind === "event") this.counts.events++;
      if (r.kind === "message") {
        this.counts.messages++;
        const channel = String(r.channelName || r.channel || "main").slice(
          0,
          80,
        );
        channels.set(channel, (channels.get(channel) || 0) + 1);
      }
      if (r.kind === "audio") {
        this.counts.audio++;
        const id = String(r.id);
        const state = JSON.stringify([
          r.url,
          r.paused,
          r.stopped,
          r.volume,
          r.loop,
        ]);
        if (this.audioStates.get(id) !== state) {
          this.audioStates.set(id, state);
          logs.push(
            `BGM · ${r.stopped ? "종료" : r.paused ? "일시 정지" : "재생"} · 트랙 ${id.slice(0, 50)}`,
          );
        }
      }
      if (r.kind === "warning")
        logs.push("주의 · " + String(r.text).slice(0, 400));
    }
    if (frames) logs.push(`방 상태 · ${frames}개 저장 (맵·토큰·패널·설정)`);
    for (const [id, count] of channels) {
      const name =
        (
          { main: "메인", info: "정보", other: "잡담" } as Record<
            string,
            string
          >
        )[id] || id;
      logs.push(
        `채팅 · ${name} · ${count}개 저장 (초기 대화·새 메시지·수정 포함)`,
      );
    }
    return logs;
  }
}
