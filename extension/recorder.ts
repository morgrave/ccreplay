import { discoverRoomRuntime } from "./room-runtime.ts";
import type { RoomEvent } from "../src/replay/types.ts";
import type { ReduxStore } from "./types.ts";
import type { ExternalRecord } from "../src/core/types.ts";
import { roomEventFilter } from "../src/core/room-events.ts";
import { isScriptResource } from "../src/core/resource-policy.ts";
import { record } from "@rrweb/record";
import { createStyleCollector } from "./capture-styles.ts";
import { pickState, pickMessages } from "../src/core/model.ts";
(() => {
  if (window.__ccReplayRecorder) return;
  window.__ccReplayRecorder = true;
  let stopAll: (() => void) | null;
  window.addEventListener("ccreplay-start", (event) => {
    if (stopAll) return;
    const channel = event.detail.channel;
    const started = Date.now();
    const time = () => Date.now() - started;
    let batch: ExternalRecord[] = [];
    const push = (kind: string, data: ExternalRecord) => {
      batch.push({ kind, ...data });
      if (batch.length >= 100) flush();
    };
    const flush = () => {
      if (batch.length) {
        if (window.__ccReplaySink) window.__ccReplaySink(batch);
        else
          window.postMessage(
            { source: "ccreplay", channel, batch },
            location.origin,
          );
        batch = [];
      }
    };
    const roomId = location.pathname.split("/")[2];
    let store: ReduxStore | undefined;
    let classes = new Set<ExternalRecord>();
    function discover() {
      const runtime = discoverRoomRuntime();
      store = runtime.store;
      for (const playerClass of runtime.classes) classes.add(playerClass);
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
        const visibleItems: Record<string, { imageUrl: string }> = {};
        for (const el of document.querySelectorAll("[data-field-object]")) {
          const img = el.querySelector("img");
          visibleItems[el.getAttribute("data-field-object")!] = {
            imageUrl: img?.currentSrc || img?.src || "",
          };
        }
        const frame = pickState(s, roomId, visibleItems);
        const { view: ignoredView, ...roomFrame } = frame;
        const encoded = JSON.stringify(roomFrame);
        if (encoded !== lastState) {
          push("frame", { t: lastState ? time() : 0, ...roomFrame });
          lastState = encoded;
          findAssets(roomFrame);
        }
        const messages = pickMessages(s, roomId, true);
        for (const m of messages) {
          const encoded = JSON.stringify(m);
          if (lastMessages.get(m.id) !== encoded) {
            lastMessages.set(m.id, encoded);
            push("message", {
              ...m,
              t: capturedInitialMessages ? time() : 0,
              ...(!capturedInitialMessages ? { initial: true } : {}),
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
    const players = new Map<HTMLMediaElement, ExternalRecord>();
    const nativeAudio = new Set<HTMLMediaElement>();
    let nextId = 0;
    const seenAudio = new WeakSet();
    const cleanup: (() => void)[] = [];
    function captureAudio() {
      const active = new Set();
      const discovered = [...classes].flatMap((c) => c.players || []);
      const known = new Set(discovered.map((p) => p.audioElement));
      const list = [
        ...discovered,
        ...[
          ...document.querySelectorAll<HTMLMediaElement>("audio,video"),
          ...nativeAudio,
        ]
          .filter((a) => !known.has(a))
          .map((a) => ({ audioElement: a })),
      ];
      for (const player of list) {
        const a = player.audioElement;
        if (!a || !/^https?:/.test(a.currentSrc || a.src)) continue;
        const key = a;
        active.add(key);
        let entry = players.get(key);
        if (!entry) {
          entry = { id: "audio-" + nextId++, last: null, player };
          players.set(key, entry);
        }
        entry.player = player;
        const url = a.currentSrc || a.src;
        asset(url);
        const value = {
          t: time(),
          id: entry.id,
          url,
          position: Number.isFinite(a.currentTime) ? a.currentTime : 0,
          paused: a.paused || a.ended,
          loop: a.loop,
          volume: a.muted
            ? 0
            : Math.max(
                0,
                Math.min(1, player.gainNode?.gain?.value ?? a.volume),
              ),
          rate: a.playbackRate,
        };
        const old = entry.last;
        const expected = old
          ? old.position +
            ((value.t - old.t) / 1000) * (old.paused ? 0 : old.rate)
          : 0;
        if (
          !old ||
          old.url !== url ||
          old.paused !== value.paused ||
          old.loop !== value.loop ||
          old.rate !== value.rate ||
          Math.abs(old.volume - value.volume) > 0.008 ||
          Math.abs(expected - value.position) > 0.12 ||
          value.t - old.t >= 5000
        ) {
          push("audio", value);
          entry.last = value;
        }
        if (!seenAudio.has(a)) {
          seenAudio.add(a);
          for (const type of [
            "playing",
            "pause",
            "seeked",
            "ratechange",
            "volumechange",
            "ended",
          ]) {
            const cb = () => captureAudio();
            a.addEventListener(type, cb);
            cleanup.push(() => a.removeEventListener(type, cb));
          }
        }
      }
      for (const [key, entry] of players) {
        if (!active.has(key)) {
          push("audio", { t: time(), id: entry.id, stopped: true });
          players.delete(key);
        }
      }
    }
    const restores: (() => void)[] = [];
    let discoveryPending = false;
    for (const name of ["load", "play"] as const) {
      const original = HTMLMediaElement.prototype[name];
      function wrapped(this: HTMLMediaElement, ...args: []) {
        nativeAudio.add(this);
        captureAudio();
        if (!discoveryPending) {
          discoveryPending = true;
          setTimeout(() => {
            discoveryPending = false;
            discover();
            captureAudio();
          }, 0);
        }
        return Reflect.apply(original, this, args);
      }
      Object.assign(HTMLMediaElement.prototype, { [name]: wrapped });
      restores.push(() => {
        if (HTMLMediaElement.prototype[name] === wrapped)
          Object.assign(HTMLMediaElement.prototype, { [name]: original });
      });
    }
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
    const poll = setInterval(captureAudio, 50);
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
    });
    captureAudio();
    flush();
    stopAll = () => {
      rrstop?.();
      unsubscribe?.();
      changes.disconnect();
      clearInterval(poll);
      clearInterval(discovery);
      clearInterval(flusher);
      restores.forEach((fn) => fn());
      cleanup.forEach((fn) => fn());
      snapshot();
      captureAudio();
      push("end", { t: time() });
      flush();
      stopAll = null;
    };
    window.addEventListener("pagehide", () => stopAll?.(), { once: true });
  });
  window.addEventListener("ccreplay-stop", () => stopAll?.());
})();
