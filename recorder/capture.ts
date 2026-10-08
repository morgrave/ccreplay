import { discoverRoomRuntime } from "./room-runtime.ts";
import type { RoomEvent } from "../src/replay/types.ts";
import type { ReduxStore } from "./capture-types.ts";
import type { ExternalRecord } from "../src/core/types.ts";
import { roomEventFilter } from "../src/core/room-events.ts";
import { isScriptResource } from "../src/core/resource-policy.ts";
import { record } from "@rrweb/record";
import { createStyleCollector } from "./capture-styles.ts";
import { pickState, pickMessages } from "../src/core/model.ts";
import { RoomActivity } from "./activity.ts";
import { RoomAudio } from "./room-audio.ts";
(() => {
  if (window.__ccReplayRecorder) return;
  window.__ccReplayRecorder = true;
  let stopAll: (() => void) | null;
  window.addEventListener("ccreplay-start", () => {
    if (stopAll) return;
    const started = Date.now();
    const activity = new RoomActivity(started);
    const roomAudio = new RoomAudio(started);
    const time = () => Date.now() - started;
    let batch: ExternalRecord[] = [];
    const push = (kind: string, data: ExternalRecord) => {
      batch.push({ kind, ...data });
      if (batch.length >= 100) flush();
    };
    const flush = () => {
      if (batch.length) {
        window.__ccReplaySink?.(batch);
        batch = [];
      }
    };
    const roomId = location.pathname.split("/")[2];
    let store: ReduxStore | undefined;
    function discover() {
      const runtime = discoverRoomRuntime();
      store = runtime.store;
    }
    discover();
    if (!store) {
      push("warning", {
        t: 0,
        text: "코코포리아 상태 연결 실패: DOM만 기록됩니다. 토큰·채팅·BGM 상태 기록을 보장할 수 없습니다.",
      });
    }
    const assets = new Set();
    function asset(url: string, resourceType?: string) {
      if (
        !url ||
        assets.has(url) ||
        !/^https?:/.test(url) ||
        isScriptResource(url)
      )
        return;
      assets.add(url);
      push("asset", { url, resourceType });
    }
    function findAssets(value: unknown) {
      if (typeof value === "string") {
        if (/^https?:\/\//.test(value) && value.length < 10000) asset(value);
        for (const match of value.matchAll(
          /url\(["']?(https?:[^)'"\s]+)["']?\)/g,
        ))
          asset(match[1]);
      } else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value))
          if (!["text", "memo", "name"].includes(k)) findAssets(v);
    }
    let lastState = "";
    const lastMessages = new Map();
    let capturedInitialMessages = false;
    let unsubscribe: (() => void) | undefined;
    function snapshot() {
      if (!store) return;
      try {
        const s = store.getState();
        for (const event of roomAudio.observeEffects(s.entities?.roomEffects?.entities || {}, time())) {
          push("audio", event);
          asset(event.url);
        }
        for (const event of roomAudio.observe(
          s.entities?.rooms?.entities?.[roomId] || {},
          time(),
        )) {
          push("audio", event);
          asset(event.url);
        }
        const visibleItems: Record<string, { imageUrl: string }> = {};
        for (const el of document.querySelectorAll("[data-field-object]")) {
          const img = el.querySelector("img");
          visibleItems[el.getAttribute("data-field-object")!] = {
            imageUrl: img?.currentSrc || img?.src || "",
          };
        }
        const frame = pickState(s, roomId, visibleItems);
        const meaningful = activity.observe(s, roomId);
        const { view: ignoredView, ...roomFrame } = frame;
        const encoded = JSON.stringify(roomFrame);
        if (encoded !== lastState || meaningful) {
          push("frame", {
            t: lastState ? time() : 0,
            ...roomFrame,
            activity: meaningful,
          });
          lastState = encoded;
          findAssets(roomFrame);
        }
        const messages = pickMessages(s, roomId, true);
        for (const m of messages) {
          const encoded = JSON.stringify(m);
          if (lastMessages.get(m.id) !== encoded) {
            const initial =
              !capturedInitialMessages ||
              (!lastMessages.has(m.id) &&
                m.createdAt > 0 &&
                m.createdAt <= started);
            lastMessages.set(m.id, encoded);
            push("message", {
              ...m,
              t: initial ? 0 : time(),
              ...(initial ? { initial: true } : {}),
            });
            asset(m.iconUrl);
            asset(m.imageUrl);
          }
        }
        capturedInitialMessages = true;
      } catch (e) {
        push("warning", {
          t: time(),
          text: e instanceof Error ? e.message : String(e),
        });
      }
    }
    snapshot();
    if (store) unsubscribe = store.subscribe(snapshot);
    let snapshotPending = false;
    const changes = new MutationObserver(() => {
      if (snapshotPending) return;
      snapshotPending = true;
      requestAnimationFrame(() => {
        snapshotPending = false;
        snapshot();
      });
    });
    changes.observe(document.querySelector("#root") || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "style", "data-field-object"],
    });
    const cleanup: (() => void)[] = [];
    const filterRoomEvent = roomEventFilter();
    const styles = createStyleCollector(asset, record.mirror, location.href);
    const rrstop = record({
      emit(e) {
        const filtered = filterRoomEvent(e as RoomEvent);
        if (!filtered) return;
        styles.event(filtered);
        push("event", { event: filtered });
      },
      checkoutEveryNms: 60000,
      maskAllInputs: true,
      recordCanvas: false,
      inlineStylesheet: true,
      collectFonts: true,
      sampling: { mousemove: false, mouseInteraction: false },
      blockSelector: 'input[type="password"], [data-ccreplay-ignore]',
    });
    const imageLoaded = (e: Event) => {
      if (e.target instanceof HTMLImageElement)
        styles.resource(e.target.currentSrc || e.target.src);
    };
    document.addEventListener("load", imageLoaded, true);
    cleanup.push(() => document.removeEventListener("load", imageLoaded, true));
    for (const img of document.images)
      styles.resource(img.currentSrc || img.src);
    for (const link of document.querySelectorAll<HTMLLinkElement>(
      "link[rel=stylesheet]",
    ))
      styles.resource(link.href, location.href, "stylesheet");
    const discovery = setInterval(() => {
      discover();
      if (!unsubscribe && store) {
        unsubscribe = store.subscribe(snapshot);
      }
      snapshot();
    }, 1500);
    const flusher = setInterval(flush, 250);
    push("meta", {
      adapter: !!store,
      startedAt: started,
      title: document.title,
      captureMode: "room-state",
      audioSource: "room-state-v1",
    });
    flush();
    stopAll = () => {
      rrstop?.();
      unsubscribe?.();
      changes.disconnect();
      clearInterval(discovery);
      clearInterval(flusher);
      cleanup.forEach((fn) => fn());
      snapshot();
      push("end", { t: time() });
      flush();
      stopAll = null;
    };
    window.addEventListener("pagehide", () => stopAll?.(), { once: true });
  });
  window.addEventListener("ccreplay-stop", () => stopAll?.());
})();
