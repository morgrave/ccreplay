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

/** Connect the existing CCfolia drawer and tabs to the recorded message state. */
export class RoomChat {
  private selected = "main";
  private collapsed = false;
  private scroll = new Map<string, number>();
  private row: HTMLElement | null = null;
  private rendered = "";
  private revision = 0;
  private bound = new WeakSet<HTMLElement>();
  private refresh: () => void = () => {};
  constructor(
    private messages: ChatMessage[],
    private asset: (url: string) => string,
  ) {}

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
      if (template) {
        this.row = template.cloneNode(true) as HTMLElement;
        this.rendered = "";
      }
    }
    let live = doc.querySelector<HTMLElement>("[data-replay-chat]");
    if (!live) {
      live = original.cloneNode(false) as HTMLElement;
      live.dataset.replayChat = "";
      live.removeAttribute("id");
      original.after(live);
      this.rendered = "";
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

    const names = new Map(
      Object.entries(channelLabels).map(([id, label]) => [label, id]),
    );
    for (const message of this.messages)
      if (!channelLabels[message.channel])
        names.set(message.channelName || message.channel, message.channel);
    for (const button of drawer.querySelectorAll<HTMLButtonElement>(
      '[role="tablist"] button',
    )) {
      if (button.disabled) continue;
      const label = (button.textContent || "").replace(/\s*\d+\s*$/, "").trim();
      const channel = names.get(label) || label;
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
    const rows = channelMessages(this.messages, time, this.selected);
    live.dataset.replayTime = String(time);
    live.dataset.replayChannel = this.selected;
    const signature = JSON.stringify([this.selected, rows]);
    if (
      signature !== this.rendered ||
      live.dataset.replayRevision !== String(this.revision) ||
      live.childElementCount !== Math.max(1, rows.length)
    ) {
      const atBottom =
        live.scrollHeight - live.scrollTop - live.clientHeight < 40;
      const fragment = doc.createDocumentFragment();
      for (const message of rows)
        fragment.append(this.messageRow(doc, message));
      if (!rows.length) {
        const empty = doc.createElement("li");
        empty.textContent = "이 시점까지 기록된 메시지가 없습니다.";
        empty.style.cssText =
          "padding:16px;list-style:none;font-size:14px;color:#bdbdbd";
        fragment.append(empty);
      }
      live.replaceChildren(fragment);
      this.rendered = signature;
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
        this.rendered = "";
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
    wrapper.style.listStyle = "none";
    wrapper.append(row);
    const divider = doc.createElement("hr");
    divider.className = "MuiDivider-root MuiDivider-middle MuiDivider-light";
    divider.style.cssText =
      "border:0;border-bottom:1px solid rgba(255,255,255,.12);margin:0 16px";
    wrapper.append(divider);
    return wrapper;
  }
}
