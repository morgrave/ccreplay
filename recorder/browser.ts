import "./capture.ts";
import { discoverRoomRuntime } from "./room-runtime.ts";
import { pickMessages } from "../src/core/model.ts";
import type { ExternalRecord } from "../src/core/types.ts";

declare global {
  interface Window {
    __ccReplayWrite: (batch: ExternalRecord[]) => Promise<void>;
    __ccReplayAuto: {
      preparationKey(): string;
      ready(): boolean;
      start(): void;
      stop(): Promise<void>;
      chatStatus(): {
        selected: string;
        channels: string[];
        loading: Record<string, boolean>;
        loaded: Record<string, boolean>;
        counts: Record<string, number>;
      };
      selectChat(channel: string): boolean;
    };
  }
}
let writes = Promise.resolve();
let failure: unknown;
window.__ccReplaySink = (batch) => {
  writes = writes
    .then(() => window.__ccReplayWrite(batch))
    .catch((error: unknown) => {
      failure = error;
    });
};
window.__ccReplayAuto = {
  preparationKey() {
    const s = discoverRoomRuntime().store?.getState();
    const id = location.pathname.split("/")[2];
    return JSON.stringify([
      s?.entities?.rooms?.entities?.[id],
      s?.entities?.roomCharacters?.entities,
      s?.entities?.roomItems?.entities,
      s ? pickMessages(s, id) : [],
    ]);
  },
  selectChat(channel) {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[role="tablist"] button',
    )) {
      if (button.disabled) continue;
      let value = button.id;
      const key = Object.keys(button).find((key) =>
        key.startsWith("__reactFiber$"),
      );
      let fiber = key ? (button as unknown as ExternalRecord)[key] : undefined;
      for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
        if (typeof fiber.memoizedProps?.value === "string") {
          value = fiber.memoizedProps.value;
          break;
        }
      }
      if (value === channel) {
        button.click();
        return true;
      }
    }
    return false;
  },
  chatStatus() {
    const state = discoverRoomRuntime().store?.getState();
    const room =
      state?.entities?.rooms?.entities?.[location.pathname.split("/")[2]];
    const channels = [
      ...new Set<string>([
        "main",
        "info",
        "other",
        ...(room?.messageChannels || []),
        ...(room?.messageGroups || [])
          .filter((g: ExternalRecord) => g.kind === "public")
          .map((g: ExternalRecord) => String(g.id)),
      ]),
    ];
    const counts: Record<string, number> = {};
    for (const message of Object.values<ExternalRecord>(
      state?.entities?.roomMessages?.entities || {},
    )) {
      if (!message.to && channels.includes(message.channel))
        counts[message.channel] = (counts[message.channel] || 0) + 1;
    }
    return {
      selected: state?.app?.state?.roomChatTab || "main",
      channels,
      counts,
      loading: state?.app?.state?.roomChatChannelLoading || {},
      loaded: state?.app?.state?.roomChatChannelLoaded || {},
    };
  },
  ready() {
    const store = discoverRoomRuntime().store;
    const id = location.pathname.split("/")[2];
    return (
      !!store?.getState()?.entities?.rooms?.entities?.[id] &&
      !!document.querySelector("#root > *")
    );
  },
  start() {
    window.dispatchEvent(new CustomEvent("ccreplay-start"));
  },
  async stop() {
    window.dispatchEvent(new Event("ccreplay-stop"));
    await writes;
    if (failure) throw failure;
  },
};
