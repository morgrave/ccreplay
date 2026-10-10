import type { ChatMessage } from "./types.ts";
import { cameraLayers } from "../core/free-view.ts";

export const channelLabels: Record<string, string> = {
  main: "메인",
  info: "정보",
  other: "잡담",
};
export function channelMessages(
  events: ChatMessage[],
  time: number,
  channel: string,
): ChatMessage[] {
  const latest = new Map<string, ChatMessage>();
  for (const message of events) {
    if (message.t > time) break;
    if (message.removed) latest.delete(message.id);
    else latest.set(message.id, message);
  }
  return [...latest.values()].filter((message) => message.channel === channel);
}

interface MessageState {
  message: ChatMessage;
  /** Map insertion order, including a fresh position after a deletion. */
  order: number;
}

/** Reuse channel snapshots until one of their message events is crossed. */
export class ChatTimeline {
  private cursor = 0;
  private state = new Map<string, MessageState>();
  private channels = new Map<string, ChatMessage[]>();
  private changes: {
    before: MessageState | undefined;
    after: MessageState | undefined;
  }[];

  constructor(private events: ChatMessage[]) {
    const state = new Map<string, MessageState>();
    this.changes = events.map((message, index) => {
      const before = state.get(message.id);
      const after = message.removed
        ? undefined
        : { message, order: before?.order ?? index };
      if (after) state.set(message.id, after);
      else state.delete(message.id);
      return { before, after };
    });
  }

  at(time: number, channel: string): ChatMessage[] {
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.events[middle].t <= time) low = middle + 1;
      else high = middle;
    }
    while (this.cursor < low) this.apply(this.cursor++, false);
    while (this.cursor > low) this.apply(--this.cursor, true);
    let rows = this.channels.get(channel);
    if (!rows) {
      rows = [...this.state.values()]
        .filter((entry) => entry.message.channel === channel)
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.message);
      this.channels.set(channel, rows);
    }
    return rows;
  }

  private apply(index: number, reverse: boolean): void {
    const { before, after } = this.changes[index];
    if (before) this.channels.delete(before.message.channel);
    if (after) this.channels.delete(after.message.channel);
    const value = reverse ? before : after;
    const id = this.events[index].id;
    if (value) this.state.set(id, value);
    else this.state.delete(id);
  }
}

/** Connect the existing CCfolia drawer and tabs to the recorded message state. */
export class RoomChat {
  private selected = "main";
  private collapsed = false;
  private scroll = new Map<string, number>();
  private row: HTMLElement | null = null;
  private rendered: ChatMessage[] | null = null;
  private live: HTMLElement | null = null;
  private rowDocument: Document | null = null;
  private rowCache = new WeakMap<ChatMessage, HTMLElement>();
  private timeline: ChatTimeline;
  private names = new Map(
    Object.entries(channelLabels).map(([id, label]) => [label, id]),
  );
  private revision = 0;
  private bound = new WeakSet<HTMLElement>();
  private refresh: () => void = () => {};
  constructor(
    messages: ChatMessage[],
    private asset: (url: string) => string,
  ) {
    this.timeline = new ChatTimeline(messages);
    for (const message of messages)
      if (!channelLabels[message.channel])
        this.names.set(message.channelName || message.channel, message.channel);
  }

  sync(doc: Document, time: number): void {
    this.refresh = () => this.sync(doc, time);
    const original = doc.querySelector<HTMLElement>(
      '[role="log"]:not([data-replay-chat])',
    );
    const drawer = original?.closest<HTMLElement>(".MuiDrawer-paper");
    if (!original || !drawer) return;
    if (!this.row?.querySelector(".MuiAvatar-root")) {
      const rows = [
        ...original.querySelectorAll<HTMLElement>(".MuiListItem-root"),
      ];
      const template =
        rows.find((row) => row.querySelector(".MuiAvatar-root")) || rows[0];
      if (
        template &&
        (!this.row || template.querySelector(".MuiAvatar-root"))
      ) {
        this.row = template.cloneNode(true) as HTMLElement;
        this.rendered = null;
        this.rowCache = new WeakMap();
      }
    }
    let live = doc.querySelector<HTMLElement>("[data-replay-chat]");
    if (!live) {
      live = original.cloneNode(false) as HTMLElement;
      live.dataset.replayChat = "";
      live.removeAttribute("id");
      original.after(live);
      this.rendered = null;
    }
    original.style.setProperty("display", "none", "important");
    drawer.style.setProperty(
      "display",
      this.collapsed ? "none" : "flex",
      "important",
    );
    const map = cameraLayers(doc)[0]?.move;
    for (
      let parent = map?.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (parent.style.right) {
        parent.style.setProperty(
          "right",
          this.collapsed ? "0px" : "375px",
          "important",
        );
        break;
      }
    }
    const open = doc.querySelector<HTMLElement>(
      '[aria-label="チャットウィンドウを開く"]',
    );
    if (open) {
      open.setAttribute("aria-expanded", String(!this.collapsed));
      open.style.setProperty(
        "display",
        this.collapsed ? "inline-flex" : "",
        "important",
      );
    }

    for (const button of drawer.querySelectorAll<HTMLButtonElement>(
      '[role="tablist"] button',
    )) {
      if (button.disabled) continue;
      const label = (button.textContent || "").replace(/\s*\d+\s*$/, "").trim();
      const channel = this.names.get(label) || label;
      if (!channel) continue;
      button.dataset.replayChannel = channel;
      button.role = "tab";
      button.setAttribute("aria-selected", String(channel === this.selected));
      button.classList.toggle("Mui-selected", channel === this.selected);
      button.style.color = channel === this.selected ? "#fff" : "";
      if (channel === this.selected) {
        const indicator =
          drawer.querySelector<HTMLElement>(".MuiTabs-indicator");
        if (indicator) {
          indicator.style.left = button.offsetLeft + "px";
          indicator.style.width = button.offsetWidth + "px";
        }
      }
    }
    const rows = this.timeline.at(time, this.selected);
    live.dataset.replayTime = String(time);
    live.dataset.replayChannel = this.selected;
    if (
      rows !== this.rendered ||
      live !== this.live ||
      live.dataset.replayRevision !== String(this.revision) ||
      live.childElementCount !== Math.max(1, rows.length)
    ) {
      const atBottom =
        live.scrollHeight - live.scrollTop - live.clientHeight < 40;
      if (this.rowDocument !== doc) {
        this.rowDocument = doc;
        this.rowCache = new WeakMap();
      }
      if (rows.length) {
        // Keep existing rows mounted. Appending a message or editing one should
        // not clone thousands of portraits and trigger their layout again.
        let next = live.firstElementChild;
        for (const message of rows) {
          let row = this.rowCache.get(message);
          if (!row) {
            row = this.messageRow(doc, message);
            this.rowCache.set(message, row);
          }
          if (row === next) next = next.nextElementSibling;
          else live.insertBefore(row, next);
        }
        while (next) {
          const remove = next;
          next = next.nextElementSibling;
          remove.remove();
        }
      } else {
        const empty = doc.createElement("li");
        empty.textContent = "이 시점까지 기록된 메시지가 없습니다.";
        empty.style.cssText =
          "padding:16px;list-style:none;font-size:14px;color:#bdbdbd";
        live.replaceChildren(empty);
      }
      this.rendered = rows;
      this.live = live;
      live.dataset.replayRevision = String(++this.revision);
      live.scrollTop =
        this.scroll.get(this.selected) ?? (atBottom ? live.scrollHeight : 0);
    }
    if (this.bound.has(doc.documentElement)) return;
    this.bound.add(doc.documentElement);
    doc.addEventListener(
      "scroll",
      (event) => {
        const element = event.target as HTMLElement;
        if (element?.hasAttribute?.("data-replay-chat"))
          this.scroll.set(this.selected, element.scrollTop);
      },
      true,
    );
    doc.addEventListener("click", (event) => {
      const button = (event.target as Element)?.closest?.("button");
      if (!button) return;
      const channel = button.dataset.replayChannel;
      if (channel) {
        event.preventDefault();
        this.selected = channel;
        this.rendered = null;
        this.refresh();
        return;
      }
      const label = button.getAttribute("aria-label");
      if (
        label === "チャットウィンドウを開く" ||
        label === "チャットウィンドウをとじる"
      ) {
        event.preventDefault();
        this.collapsed = label === "チャットウィンドウをとじる";
        this.refresh();
      }
    });
  }

  private messageRow(doc: Document, message: ChatMessage): HTMLElement {
    const row = this.row?.cloneNode(true) as HTMLElement | null;
    if (!row) {
      const fallback = doc.createElement("li");
      fallback.textContent = message.name + ": " + message.text;
      return fallback;
    }
    const heading = row.querySelector<HTMLElement>("h6"),
      text = row.querySelector<HTMLElement>(".MuiListItemText-secondary"),
      avatarRoot = row.querySelector<HTMLElement>(".MuiAvatar-root");
    if (heading) {
      const date = heading
        .querySelector("span")
        ?.cloneNode(false) as HTMLElement | null;
      heading.textContent = message.name;
      heading.style.color = message.color || "#fff";
      if (date) {
        date.textContent =
          " - " +
          (message.createdAt
            ? new Date(message.createdAt).toLocaleDateString("ko-KR")
            : "");
        heading.append(date);
      }
    }
    if (text) text.textContent = message.text;
    if (avatarRoot) {
      const src = message.iconUrl ? this.asset(message.iconUrl) : "";
      if (src) {
        const avatar =
          avatarRoot.querySelector<HTMLImageElement>(".MuiAvatar-img") ||
          doc.createElement("img");
        avatar.classList.add("MuiAvatar-img");
        avatar.alt = "avatar";
        avatar.draggable = false;
        avatar.src = src;
        avatar.style.cssText =
          "width:100%;height:100%;object-fit:cover;object-position:top";
        avatarRoot.classList.remove("MuiAvatar-colorDefault");
        avatarRoot.replaceChildren(avatar);
      } else avatarRoot.parentElement?.replaceChildren();
    }
    for (const action of row.querySelectorAll("button")) action.remove();
    const wrapper = doc.createElement("li");
    // Keep the complete history scrollable without laying out every offscreen
    // portrait and text block after a seek. Browsers remember measured heights.
    wrapper.style.cssText =
      "list-style:none;content-visibility:auto;contain-intrinsic-size:auto 100px";
    wrapper.append(row);
    const divider = doc.createElement("hr");
    divider.className = "MuiDivider-root MuiDivider-middle MuiDivider-light";
    divider.style.cssText =
      "border:0;border-bottom:1px solid rgba(255,255,255,.12);margin:0 16px";
    wrapper.append(divider);
    return wrapper;
  }
}
