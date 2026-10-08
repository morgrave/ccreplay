import { pickState } from "../src/core/model.ts";
import type { ExternalRecord } from "../src/core/types.ts";

/** Compare server room data, never DOM image loading or viewer layout. */
export class RoomActivity {
  private previous = new Map<string, string>();
  private initialized = false;
  constructor(private startedAt: number) {}
  observe(state: ExternalRecord, roomId: string): boolean {
    const entities = state.entities || {};
    const items = entities.roomItems?.entities || {};
    const visible = Object.fromEntries(
      Object.entries<ExternalRecord>(items)
        .filter(([, item]) => item?.active !== false)
        .map(([id, item]) => [
          id,
          { imageUrl: item.closed ? item.coverImageUrl : item.imageUrl },
        ]),
    );
    const frame = pickState(state, roomId, visible);
    const next = new Map<string, string>();
    let changed = false;
    const compare = (key: string, value: unknown, raw?: ExternalRecord) => {
      const encoded = JSON.stringify(value);
      next.set(key, encoded);
      if (!this.initialized || this.previous.get(key) === encoded) return;
      // A newly delivered old document is initial subscription hydration.
      const modified = timestamp(raw?.updatedAt) || timestamp(raw?.createdAt);
      if (!this.previous.has(key) && modified > 0 && modified <= this.startedAt)
        return;
      changed = true;
    };
    const room = entities.rooms?.entities?.[roomId];
    compare("room", {
      ...frame.room,
      bgm: frame.bgm,
      mediaRef: room?.mediaRef,
      soundRef: room?.soundRef,
    });
    for (const token of frame.tokens)
      compare(
        "token:" + token.id,
        token,
        entities.roomCharacters?.entities?.[token.id],
      );
    for (const item of frame.items)
      compare("item:" + item.id, item, items[item.id]);
    if (this.initialized)
      for (const key of this.previous.keys())
        if (!next.has(key)) changed = true;
    this.previous = next;
    this.initialized = true;
    return changed;
  }
}

export function timestamp(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value && typeof value === "object" && "seconds" in value) {
    const t = value as { seconds: number; nanoseconds?: number };
    return Number(t.seconds) * 1000 + Number(t.nanoseconds || 0) / 1e6;
  }
  return 0;
}
