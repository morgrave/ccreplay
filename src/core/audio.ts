import type { AudioEvent, RecordingData } from "./types.ts";
interface Player {
  audio: HTMLAudioElement;
  src: string;
  pendingPosition?: number;
  readyHandler?: boolean;
  starting?: boolean;
}
import { audioAt, mediaPosition, clamp } from "./model.ts";
export class AudioEngine {
  events: AudioEvent[];
  players: Map<string, Player>;
  failed: Set<string>;
  constructor(
    data: RecordingData,
    private assets: Map<string, string>,
    private onError: (message: string) => void,
  ) {
    this.events = data.audio;
    this.assets = assets;
    this.onError = onError;
    this.players = new Map();
    this.failed = new Set();
  }
  sync(time: number, playing: boolean, speed = 1, volume = 1) {
    const active = new Set();
    for (const event of audioAt(this.events, time)) {
      if (event.paused) continue;
      const src = this.assets.get(event.url);
      if (!src) {
        if (!this.failed.has(event.url)) {
          this.failed.add(event.url);
          this.onError(
            "저장되지 않은 음원이 있어 일부 소리를 재생할 수 없습니다.",
          );
        }
        continue;
      }
      active.add(event.id);
      let item = this.players.get(event.id);
      if (!item || item.src !== src) {
        item?.audio.pause();
        const audio = new Audio(src);
        audio.preload = "metadata";
        audio.onerror = () =>
          this.onError("이 브라우저에서 재생할 수 없는 음원입니다.");
        item = { audio, src };
        this.players.set(event.id, item);
      }
      const a = item.audio;
      a.loop = !!event.loop;
      a.volume = clamp(event.volume * volume, 0, 1);
      a.playbackRate = clamp(speed * (event.rate || 1), 0.0625, 16);
      let position = mediaPosition(event, time);
      if (a.loop && Number.isFinite(a.duration) && a.duration > 0)
        position %= a.duration;
      if (Number.isFinite(a.duration))
        position = Math.min(position, a.duration);
      if (a.readyState >= 1 && Math.abs(a.currentTime - position) > 0.25) {
        try {
          a.currentTime = position;
        } catch {}
      } else if (a.readyState < 1) item.pendingPosition = position;
      if (!item.readyHandler) {
        item.readyHandler = true;
        a.addEventListener("loadedmetadata", () => {
          if (item.pendingPosition != null)
            try {
              a.currentTime =
                a.loop && a.duration > 0
                  ? item.pendingPosition % a.duration
                  : Math.min(
                      item.pendingPosition,
                      a.duration || item.pendingPosition,
                    );
            } catch {}
        });
      }
      const ended =
        !event.loop &&
        Number.isFinite(a.duration) &&
        mediaPosition(event, time) >= a.duration;
      if (playing && !ended && a.paused && !item.starting) {
        item.starting = true;
        a.play()
          .catch((e) => {
            if (e.name === "NotAllowedError")
              this.onError(
                "소리 재생이 차단되었습니다. 재생 버튼을 다시 눌러주세요.",
              );
          })
          .finally(() => (item.starting = false));
      } else if (!playing || event.paused) a.pause();
    }
    for (const [id, item] of this.players)
      if (!active.has(id)) {
        item.audio.pause();
        this.players.delete(id);
      }
  }
  stop() {
    for (const item of this.players.values()) {
      item.audio.onerror = null;
      item.audio.pause();
      item.audio.removeAttribute("src");
      item.audio.load();
    }
    this.players.clear();
  }
}
