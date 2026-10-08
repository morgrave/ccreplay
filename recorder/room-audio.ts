import { clamp, safeMediaURL } from "../src/core/model.ts";
import { mediaPosition } from "../src/core/model.ts";
import type { AudioEvent, ExternalRecord } from "../src/core/types.ts";

/** Room subscriptions are authoritative; browser autoplay/mute is viewer state. */
export class RoomAudio {
  private initialized = false;
  private tracks = new Map<
    string,
    { key: string; ref: unknown; event: AudioEvent }
  >();
  private effects = new Map<string, number>();
  constructor(private startedAt = Date.now()) {}
  observeEffects(
    effects: Record<string, ExternalRecord>,
    t: number,
  ): AudioEvent[] {
    const events: AudioEvent[] = [];
    for (const [id, effect] of Object.entries(effects)) {
      const playTime = Number(effect.playTime) || 0;
      const old = this.effects.get(id);
      this.effects.set(id, playTime);
      if (playTime === old || playTime <= this.startedAt) continue;
      const url = safeMediaURL(effect.soundUrl);
      if (url)
        events.push({
          id: "room-effect-" + id,
          t,
          url,
          position: 0,
          volume: clamp(effect.soundVolume, 0, 1),
          loop: false,
          paused: false,
          initial: false,
        });
    }
    return events;
  }
  observe(room: ExternalRecord, t: number): AudioEvent[] {
    const events: AudioEvent[] = [];
    for (const [prefix, id] of [
      ["media", "room-bgm1"],
      ["sound", "room-bgm2"],
    ]) {
      const url = safeMediaURL(room[prefix + "Url"]);
      const ref = room[prefix + "Ref"];
      const volume = clamp(room[prefix + "Volume"], 0, 1);
      const loop = !!room[prefix + "Repeat"];
      const name = String(room[prefix + "Name"] || "");
      const key = JSON.stringify([url, ref, volume, loop, name]);
      const previous = this.tracks.get(id);
      if (previous?.key === key || (!previous && !url)) continue;
      const restart =
        !previous || previous.event.url !== url || previous.ref !== ref;
      const event: AudioEvent = {
        id,
        t,
        url,
        name,
        volume,
        loop,
        rate: 1,
        position: restart ? 0 : mediaPosition(previous.event, t),
        paused: !url,
        stopped: !url,
        initial: !this.initialized,
      };
      this.tracks.set(id, { key, ref, event });
      events.push(event);
    }
    this.initialized = true;
    return events;
  }
}
