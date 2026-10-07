import { registerReplayTools } from "./replay/tools.ts";
import type { RoomEvent } from "./replay/types.ts";
import type { eventWithTime } from "@rrweb/types";
import { errorMessage } from "./core/errors.ts";
import type { Recording, Frame, Token, ExternalRecord } from "./core/types.ts";
import type { Camera } from "./replay/types.ts";
import { TokenTooltip } from "./replay/tooltip.ts";
import { bindTimeline } from "./replay/timeline.ts";
import { RoomChat } from "./replay/chat.ts";
import { bindRoomControls } from "./core/room-controls.ts";
import { roomEventFilter } from "./core/room-events.ts";
import { cameraLayers, applyCamera } from "./core/free-view.ts";

import { Replayer } from "@rrweb/replay";
import "@rrweb/replay/dist/style.css";
import "./style.css";
import { $, $$, ic, paintIcons, shell } from "./shell.ts";
import {
  frameAt,
  messagesAt,
  audioAt,
  timeLabel,
  escapeHTML as esc,
  clamp,
} from "./core/model.ts";
import {
  readArchive,
  makeArchive,
  downloadBlob,
  sanitizeEvents,
} from "./core/archive.ts";
import { demoRecording, demoSound } from "./core/demo.ts";
import { AudioEngine } from "./core/audio.ts";
import { mountLibrary } from "./library-ui.ts";
const tokenTooltip = new TokenTooltip();
let roomChat: RoomChat | null = null;
let freeCamera: Camera | null = null;
let current: Recording | undefined,
  engine: AudioEngine | undefined,
  replayer: Replayer | undefined,
  time = 0,
  playing = false,
  speed = 1,
  volume = 0.7,
  tab = "chat",
  mode = "scene",
  query = "",
  selected: string | null = null,
  last = 0,
  renderStamp = 0,
  chatStamp = 0,
  frameKey: Frame | null | undefined,
  zoom = 1,
  pan = { x: 0, y: 0 };
shell();
const notify = (message: string) => {
  $("#notice").textContent = message;
  $("#notice").hidden = !message;
};
const url = (value: string | undefined) =>
  current?.assets.get(value || "") || "";
const color = (value: string | undefined) =>
  /^#[a-f\d]{3,8}$/i.test(value || "") ? value! : "#c4bcab";
function page(name: string) {
  if ($("#library-page")) $("#library-page").hidden = true;
  $("#replay-page").hidden = name !== "replay";
  $("#record-page").hidden = name !== "record";
  $("#replay-nav").classList.toggle("active", name === "replay");
  $("#record-nav").classList.toggle("active", name === "record");
  if (name === "record") pause();
}
function dialog(title: string, html: string) {
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = html;
  $("#dialog").showModal();
  paintIcons();
}
const stats = (t: Token) =>
  `<span class="token-stats">${(t.status || []).map((s) => `<span>${esc(s.label)}<b>${esc(s.value)}<small> / ${esc(s.max)}</small></b></span>`).join("")}</span>`;
function renderScene(force = false) {
  if (replayer) return;
  const f = frameAt(current?.data.frames || [], time);
  if (!f) {
    $("#world").innerHTML =
      '<span class="no-state">장면 상태가 없습니다. 기록 파일을 확인하세요.</span>';
    return;
  }
  if (frameKey === f && !force) return;
  frameKey = f;
  const cell = clamp(f.cellSize, 8, 200) || 24;
  const width = clamp(f.room.fieldWidth, 1, 500) * cell,
    height = clamp(f.room.fieldHeight, 1, 500) * cell;
  $("#board-backdrop").style.backgroundImage = url(f.room.backgroundUrl)
    ? `url("${url(f.room.backgroundUrl)}")`
    : "";
  $("#world").innerHTML =
    `<div class="map-field ${f.room.displayGrid ? "grid" : ""} ${!url(f.room.backgroundUrl) && !url(f.room.foregroundUrl) ? "no-image" : ""}" style="left:${-Math.floor(f.room.fieldWidth / 2) * cell}px;top:${-Math.floor(f.room.fieldHeight / 2) * cell}px;width:${width}px;height:${height}px;--cell:${cell * clamp(f.room.gridSize || 1, 0.25, 20)}px;background-color:${color(f.room.backgroundColor)};background-image:${url(f.room.backgroundUrl) ? `url(&quot;${url(f.room.backgroundUrl)}&quot;)` : "none"}">${url(f.room.foregroundUrl) ? `<img class="field-image" src="${url(f.room.foregroundUrl)}" style="object-fit:${f.room.fieldObjectFit === "cover" ? "cover" : "fill"}" alt="기록된 전경">` : ""}</div>${f.items.map((i) => `<button class="board-item" style="left:${clamp(i.x, -1e5, 1e5)}px;top:${clamp(i.y, -1e5, 1e5)}px;width:${clamp(i.width, 0.1, 500) * cell}px;height:${clamp(i.height, 0.1, 500) * cell}px;z-index:${clamp(i.z, 0, 500)};transform:rotate(${clamp(i.angle, -3600, 3600)}deg)" title="${esc(i.text)}">${url(i.imageUrl) ? `<img src="${url(i.imageUrl)}" alt="${esc(i.text || "패널")}">` : `<span>${esc(i.text || "이미지 없음")}</span>`}</button>`).join("")}${f.tokens.map((c) => `<button class="token ${selected === c.id ? "selected-token" : ""}" data-token="${esc(c.id)}" aria-label="${esc(c.name)} 토큰 정보" style="left:${clamp(c.x, -1e5, 1e5)}px;top:${clamp(c.y, -1e5, 1e5)}px;width:${clamp(c.width, 0.1, 100) * cell}px;height:${clamp(c.height, 0.1, 100) * cell}px;--token-color:${color(c.color)};z-index:${600 + clamp(c.z, 0, 100)}"><span class="token-art" style="transform:rotate(${clamp(c.angle, -3600, 3600)}deg)">${url(c.iconUrl) ? `<img src="${url(c.iconUrl)}" alt="">` : `<span>${esc((c.name || "?").slice(0, 1))}</span>`}</span><span class="token-label">${esc(c.name)}</span></button>`).join("")}`;
  $("#token-count").textContent = String(f.tokens.length);
  $("#scene-name").textContent = current!.data.demo
    ? time < 45000
      ? "새벽의 플랫폼"
      : "불이 켜진 역무실"
    : "기록된 장면";
  $("#scene-hint").textContent = current!.data.demo
    ? "체험용 예시 · 토큰을 가리켜 보세요"
    : "드래그로 시점 이동 · 토큰을 가리켜 정보 확인";
  fitWorld();
}
function fitWorld() {
  const f = frameAt(current?.data.frames || [], time);
  if (!f) return;
  const view = f.view || { scale: 1, x: 0, y: 0 };
  const scale = clamp(view.scale || 1, 0.05, 10) * zoom;
  $("#world").style.transform =
    `translate(${pan.x + (view.x || 0)}px,${pan.y + (view.y || 0)}px) scale(${scale})`;
}
function renderInspector() {
  if (!current) return;
  $("#search-wrap").hidden = tab !== "chat";
  $$("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === tab);
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  });
  const content = $("#inspector-content"),
    bottom =
      content.scrollHeight - content.scrollTop - content.clientHeight < 60;
  const all = messagesAt(current!.data.messages, current!.data.duration);
  $("#chat-count").textContent = String(all.length);
  if (tab === "chat") {
    const list = query
      ? all.filter((m) =>
          (m.text + " " + m.name + " " + m.channelName)
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
        )
      : messagesAt(current!.data.messages, time);
    $("#inspector-subtitle").textContent = query
      ? `전체 기록에서 ${list.length}개 검색됨`
      : "현재 시점까지의 채팅";
    content.innerHTML = list.length
      ? list
          .map(
            (m) =>
              `<button class="chat-message" data-message-time="${m.t}"><span class="chat-avatar" style="--avatar:${color(m.color)}">${url(m.iconUrl) ? `<img src="${url(m.iconUrl)}" alt="">` : esc((m.name || "?").slice(0, 1))}</span><span class="chat-body"><span class="chat-heading"><b style="color:${color(m.color)}">${esc(m.name || "이름 없음")}</b><time>${timeLabel(m.t)}</time></span><span class="chat-channel">${esc(m.channelName || m.channel)}${m.private ? " · 비공개" : ""}${m.edited ? " · 수정됨" : ""}</span><span class="chat-text">${esc(m.text)}</span></span></button>`,
          )
          .join("")
      : `<div class="inspector-empty">${ic("file-text")}<p>${query ? "검색 결과가 없습니다." : "이 시점에 표시할 채팅이 없습니다."}</p></div>`;
    if (!query && bottom) content.scrollTop = content.scrollHeight;
  } else {
    const tokens = frameAt(current!.data.frames, time)?.tokens || [];
    $("#inspector-subtitle").textContent =
      `${timeLabel(time)}의 토큰 · ${tokens.length}개`;
    content.innerHTML =
      tokens
        .map(
          (t) =>
            `<button class="token-card ${selected === t.id ? "selected-card" : ""}" data-token-select="${esc(t.id)}"><span class="token-card-heading"><span class="token-dot" style="background:${color(t.color)}"></span>${esc(t.name)}</span><span class="token-memo">${esc(t.memo || "기록된 메모가 없습니다.")}</span>${stats(t)}</button>`,
        )
        .join("") ||
      '<div class="inspector-empty"><p>이 시점에는 토큰이 없습니다.</p></div>';
  }
  paintIcons();
}
function renderTransport() {
  if (!current) return;
  $("#seek").value = String(time);
  $("#seek").style.setProperty(
    "--progress",
    (100 * time) / Math.max(1, current!.data.duration) + "%",
  );
  $("#seek").setAttribute("aria-valuetext", timeLabel(time));
  $("#time-label").innerHTML =
    `${timeLabel(time)} <span>/ ${timeLabel(current!.data.duration)}</span>`;
  $(".audio-bars").classList.toggle("playing", playing);
  const active = audioAt(current!.data.audio, time).filter((a) => !a.paused);
  const names = frameAt(current!.data.frames, time)
    ?.bgm.filter((b) => b.url)
    .map((b) => b.name || "이름 없는 음원");
  $("#bgm-name").textContent = active.length
    ? names?.join(" + ") || `기록된 음원 ${active.length}개`
    : "재생 중인 BGM 없음";
  $("#bgm-detail").textContent = active.length
    ? `${active.length} TRACK${active.length > 1 ? "S" : ""} · ${playing ? "PLAYING" : "PAUSED"}`
    : "BGM FILE SYNC";
}
function buttonState() {
  $("#play").innerHTML = ic(playing ? "pause" : "play");
  $("#play").setAttribute("aria-label", playing ? "일시정지" : "재생");
  paintIcons();
}
function replayOffset() {
  const events = current?.data.events || [];
  const first = events[0]?.timestamp || 0;
  const snapshot = events.find((e) => e.type === 2)?.timestamp || first;
  return (
    Math.max(
      snapshot - first,
      time + (current?.data.startedAt || first) - first,
    ) + 1
  );
}
function syncOriginal(force = false) {
  if (replayer && force) {
    replayer.setConfig({ speed });
    if (playing) replayer.play(replayOffset());
    else replayer.pause(replayOffset());
  }
  if (replayer) roomChat?.sync(replayer.iframe.contentDocument!, time);
}
function pause() {
  playing = false;
  engine?.sync(time, false, speed, volume);
  replayer?.pause(replayOffset());
  renderTransport();
  buttonState();
}
function seek(next: number) {
  time = clamp(next, 0, current?.data.duration || 0);
  renderScene();
  renderInspector();
  renderTransport();
  engine?.sync(time, playing, speed, volume);
  syncOriginal(true);
  queueHits();
}
function toggle() {
  if (!current) return;
  if (playing) return pause();
  if (time >= current!.data.duration) seek(0);
  playing = true;
  last = performance.now();
  engine?.sync(time, true, speed, volume);
  syncOriginal(true);
  renderTransport();
  buttonState();
}
function setupRoomView() {
  const next = replayer ? "free" : "scene";
  if (next === "free" && !replayer) return;
  pause();
  if (!freeCamera) freeCamera = { x: 0, y: 0, scale: 1 };
  mode = next;
  zoom = 1;
  pan = { x: 0, y: 0 };
  if (replayer) applyCamera(replayer.iframe.contentDocument!, freeCamera);
  $("#replay-page").classList.toggle("room-render", !!replayer);
  $("#replay-page").classList.toggle("free-mode", mode === "free");
  $("#replay-page").classList.toggle("reference", !!current?.data.reference);
  $("#replay-page").classList.remove("inspect-open");
  $("#board").hidden = !!replayer;
  $("#original").hidden = !replayer;
  $(".scene-label").hidden = true;
  $("#scene-hint").hidden = true;
  $("#token-tooltip").hidden = true;
  $("#dom-replay").hidden = false;
  $("#replay-interaction").hidden = false;
  syncOriginal(true);
  fitReplay();
  queueHits();
}
function fitReplay() {
  if (!replayer) return;
  const meta = current!.data.events.find((e) => e.type === 4)?.data ||
    current!.data.viewport || { width: 1280, height: 720 };
  let width = Number(replayer.iframe?.width) || meta.width,
    height = Number(replayer.iframe?.height) || meta.height;
  if (replayer) {
    width = $("#stage").clientWidth || innerWidth;
    height =
      $("#stage").clientHeight ||
      Math.max(
        100,
        innerHeight -
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--dock",
            ),
          ),
      );
    replayer.iframe.width = width;
    replayer.iframe.height = height;
  }
  const scale = Math.min(
    $("#stage").clientWidth / width,
    $("#stage").clientHeight / height,
  );
  Object.assign($("#dom-replay").style, {
    width: width + "px",
    height: height + "px",
    transform: `translate(-50%,-50%) scale(${scale})`,
  });
  if (freeCamera) applyCamera(replayer.iframe.contentDocument!, freeCamera);
  bindRoomControls(replayer.iframe.contentDocument!, {
    camera: () => freeCamera,
    changed: fitReplay,
    leave: hideTokenTip,
    hover: (e) => {
      const r = replayer!.iframe.getBoundingClientRect(),
        ratio = r.width / replayer!.iframe.clientWidth;
      hover({
        target: e.target as HTMLInputElement,
        clientX: r.left + e.clientX * ratio,
        clientY: r.top + e.clientY * ratio,
      });
    },
  });
  roomChat?.sync(replayer.iframe.contentDocument!, time);
  const activePlayer = replayer;
  requestAnimationFrame(() => {
    if (activePlayer === replayer)
      roomChat?.sync(activePlayer.iframe.contentDocument!, time);
  });
  queueHits();
}
let hitsPending = false;
function queueHits() {
  if (hitsPending) return;
  hitsPending = true;
  requestAnimationFrame(() => {
    hitsPending = false;
    renderHits();
  });
}
function renderHits() {
  const layer = $("#replay-interaction");
  if (!replayer) {
    layer.replaceChildren();
    return;
  }
  const iframe = replayer.iframe,
    doc = iframe?.contentDocument;
  if (!doc) {
    layer.replaceChildren();
    return;
  }
  const r = iframe.getBoundingClientRect(),
    stage = $("#stage").getBoundingClientRect(),
    sx = r.width / (iframe.clientWidth || 1),
    sy = r.height / (iframe.clientHeight || 1);
  const f = frameAt(current!.data.frames, time);
  if (!f) {
    layer.replaceChildren();
    return;
  }
  const entries = new Map([...f.tokens, ...f.items].map((x) => [x.id, x]));
  const fragments = document.createDocumentFragment();
  for (const el of doc.querySelectorAll("[data-field-object]")) {
    const id = el.getAttribute("data-field-object"),
      item = entries.get(id);
    if (!item) continue;
    const bounds = el.getBoundingClientRect(),
      clip =
        el.parentElement?.parentElement?.parentElement?.getBoundingClientRect() || {
          left: 0,
          top: 0,
          right: iframe.clientWidth,
          bottom: iframe.clientHeight,
        };
    const b = {
      width: 0,
      height: 0,
      left: Math.max(bounds.left, clip.left, 0),
      top: Math.max(bounds.top, clip.top, 0),
      right: Math.min(bounds.right, clip.right, iframe.clientWidth),
      bottom: Math.min(bounds.bottom, clip.bottom, iframe.clientHeight),
    };
    b.width = b.right - b.left;
    b.height = b.bottom - b.top;
    if (
      b.width < 1 ||
      b.height < 1 ||
      getComputedStyle(el).visibility === "hidden" ||
      getComputedStyle(el).display === "none"
    )
      continue;
    const hit = document.createElement("button");
    hit.className = "recorded-token-hit";
    hit.dataset.recorded = id || "";
    hit.style.zIndex = getComputedStyle(el).zIndex;
    hit.setAttribute(
      "aria-label",
      (item.name || item.text || "패널") + " 정보",
    );
    Object.assign(hit.style, {
      left: r.left - stage.left + b.left * sx + "px",
      top: r.top - stage.top + b.top * sy + "px",
      width: b.width * sx + "px",
      height: b.height * sy + "px",
    });
    fragments.append(hit);
  }
  layer.replaceChildren(fragments);
}
function showInspector(nextTab?: string) {
  if (nextTab) tab = nextTab;
  $("#replay-page").classList.add("inspect-open");
  $("#replay-page").classList.remove("chat-closed");
  renderInspector();
}
async function load(recording: Recording, show = true) {
  pause();
  engine?.stop();
  replayer?.destroy();
  replayer = undefined;
  current?.release();
  current = recording;
  time = 0;
  selected = null;
  freeCamera = null;
  mode = "scene";
  frameKey = null;
  zoom = 1;
  pan = { x: 0, y: 0 };
  query = "";
  $("#search").value = "";
  $("#dom-replay").innerHTML = "";
  $("#dom-replay").hidden = false;
  const d = current!.data;
  roomChat = new RoomChat(d.messages, url);
  tokenTooltip.hide();
  const errors = new Set();
  engine = new AudioEngine(d, current!.assets, (m) => {
    if (!errors.has(m)) {
      errors.add(m);
      notify(m);
    }
  });
  $("#session-title").textContent = d.title || "코코포리아 세션";
  $("#eyebrow").textContent = d.demo
    ? "DEMO SESSION · 예시 기록"
    : "SESSION ARCHIVE";
  $("#session-meta").textContent =
    `${new Date(d.startedAt || Date.now()).toLocaleDateString("ko-KR")} · ${timeLabel(d.duration)} · ${d.frames.length.toLocaleString()}개 장면 기록`;
  $("#sample-badge").textContent = d.demo ? "체험용 예시" : "불러오기 완료";
  $("#seek").max = String(d.duration);
  $("#duration-label").textContent = timeLabel(d.duration);
  $("#ruler").innerHTML = Array.from(
    { length: 5 },
    (_, i) => `<span>${timeLabel((d.duration * i) / 4)}</span>`,
  ).join("");
  $("#event-marks").innerHTML = d.messages
    .filter((m) => m.t > 0)
    .slice(0, 3000)
    .map(
      (m) =>
        `<span style="left:${(100 * m.t) / Math.max(1, d.duration)}%"></span>`,
    )
    .join("");
  ($("#play") as HTMLButtonElement).disabled = d.duration === 0;
  if (d.events.length >= 2) {
    try {
      replayer = new Replayer(
        sanitizeEvents(
          (structuredClone(d.events) as RoomEvent[])
            .map(roomEventFilter())
            .filter((e): e is RoomEvent => e !== null),
          current!.assets,
        ) as eventWithTime[],
        {
          root: $("#dom-replay"),
          showWarning: false,
          showDebug: false,
          mouseTail: false,
          UNSAFE_replayCanvas: false,
          skipInactive: false,
        },
      );
      for (const event of [
        "event-cast",
        "fullsnapshot-rebuilded",
        "resize",
        "flush",
      ])
        replayer.on(event, () => {
          fitReplay();
        });
      replayer.pause(0);
      fitReplay();
    } catch {
      notify("방 복원에 실패했습니다. 기록 파일을 확인해 주세요.");
    }
  }
  setupRoomView();
  if (show) page("replay");
  seek(d.demo ? 15000 : 0);
  notify(
    d.warnings?.length
      ? `저장 주의 ${d.warnings.length}건 · “보관된 파일 확인”에서 자세히 볼 수 있어요.`
      : "",
  );
}
async function demo() {
  const d = demoRecording(),
    blob = demoSound(),
    link = URL.createObjectURL(blob);
  d.assets = [
    {
      url: "demo:audio",
      path: "assets/demo",
      mime: "audio/wav",
      size: blob.size,
    },
  ];
  await load({
    data: d,
    assets: new Map([["demo:audio", link]]),
    release: () => URL.revokeObjectURL(link),
  });
}
async function openFile(file?: File) {
  if (!file) return;
  notify("기록 파일을 여는 중…");
  try {
    await load(await readArchive(file));
  } catch (e) {
    notify(errorMessage(e) || "파일을 열지 못했습니다.");
  } finally {
    $("#file").value = "";
  }
}
async function exportCurrent() {
  if (!current) return;
  pause();
  notify("리플레이 파일을 묶는 중…");
  try {
    const d = structuredClone(current!.data),
      blobs = [];
    d.assets = [];
    delete d.assetStorage;
    let i = 0;
    for (const [original, local] of current!.assets) {
      const blob =
          current!.rawAssets?.get(original) ||
          (await (await fetch(local)).blob()),
        path = "assets/" + i++;
      d.assets.push({ url: original, path, mime: blob.type, size: blob.size });
      blobs.push({ path, blob });
    }
    downloadBlob(
      await makeArchive(d, blobs),
      (d.title || "CCReplay").replace(/[<>:"/\\|?*]/g, "_") + ".ccreplay",
    );
    notify("리플레이 파일을 저장했습니다.");
  } catch (e) {
    notify("저장 실패: " + errorMessage(e));
  }
}
function showAssets() {
  const d = current?.data;
  if (!d) return;
  const missing = new Set<string>();
  for (const f of d.frames)
    for (const u of [
      f.room.backgroundUrl,
      f.room.foregroundUrl,
      ...f.tokens.map((t) => t.iconUrl),
      ...f.items.map((t) => t.imageUrl),
    ])
      if (u && !url(u)) missing.add(u);
  for (const a of d.audio) if (a.url && !url(a.url)) missing.add(a.url);
  dialog(
    "보관된 파일",
    `<p>음원과 이미지 ${current!.assets.size}개가 포함되어 있습니다. 외부 주소를 자동으로 다시 요청하지 않습니다.</p>${missing.size ? `<h3>빠진 파일 ${missing.size}개</h3>${[...missing].map((u) => `<div class="missing-file"><span>${esc(u.split("?")[0].slice(-100))}</span><button class="button" data-repair="${esc(u)}">파일 연결</button></div>`).join("")}` : '<div class="success-note">장면과 소리에 필요한 파일이 준비되어 있습니다.</div>'}${d.warnings?.length ? `<h3>기록 주의사항</h3><ul class="warning-list">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}<p>파일 연결 후 상단 저장 버튼을 누르면 새 기록 파일에 함께 포함됩니다.</p>`,
  );
}
$("#file").onchange = (e) =>
  openFile((e.target as HTMLInputElement).files?.[0]);
for (const id of ["open", "setup-open"])
  $("#" + id).onclick = () => $("#file").click();
$("#replay-nav").onclick = () => page("replay");
$("#record-nav").onclick = () => page("record");
$("#load-demo").onclick = demo;
$("#play").onclick = toggle;
$("#back").onclick = () => seek(time - 10000);
$("#forward").onclick = () => seek(time + 10000);
let resumeAfterScrub = false;
bindTimeline($("#seek"), {
  begin() {
    resumeAfterScrub = playing;
    playing = false;
    replayer?.pause();
    engine?.sync(time, false, speed, volume);
    buttonState();
  },
  preview(value) {
    $("#seek").style.setProperty(
      "--progress",
      `${(100 * value) / Math.max(1, current?.data.duration || 0)}%`,
    );
    $("#seek").setAttribute("aria-valuetext", timeLabel(value));
    $("#time-label").textContent =
      `${timeLabel(value)} / ${timeLabel(current?.data.duration || 0)}`;
  },
  commit(value) {
    playing = resumeAfterScrub;
    last = performance.now();
    seek(value);
    buttonState();
  },
});
$("#speed").onchange = (e) => {
  speed = +(e.target as HTMLInputElement).value;
  engine?.sync(time, playing, speed, volume);
  syncOriginal(true);
};
$("#volume").oninput = (e) => {
  $("#master-volume").value = (e.target as HTMLInputElement).value;
  volume = +(e.target as HTMLInputElement).value;
  engine?.sync(time, playing, speed, volume);
};
$("#mute").onclick = () => {
  volume = volume ? 0 : 0.7;
  $("#volume").value = String(volume);
  $("#master-volume").value = String(volume);
  $("#mute").innerHTML = ic(volume ? "volume-2" : "volume-x");
  $("#mute").setAttribute("aria-label", volume ? "음소거" : "음소거 해제");
  engine?.sync(time, playing, speed, volume);
  paintIcons();
};
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("#replay-page").requestFullscreen();
  } catch {
    notify("전체 화면을 열 수 없습니다.");
  }
};
$("#export").onclick = exportCurrent;
$("#asset-info").onclick = showAssets;
$("#search").oninput = (e) => {
  query = (e.target as HTMLInputElement).value.trim();
  renderInspector();
};
$$("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      showInspector(b.dataset.tab);
    }),
);
$("#dialog-close").onclick = () => $("#dialog").close();
$("#dialog").addEventListener("click", (e) => {
  if (e.target === $("#dialog")) $("#dialog").close();
});
$("#help").onclick = () =>
  dialog(
    "기록 범위와 사용 안내",
    `<p>기록된 시점의 방을 코코포리아 스타일로 표시합니다. 맵을 자유롭게 이동·확대하고 채팅을 스크롤할 수 있습니다. 토큰 정보와 채팅 검색도 지원합니다.</p><h3>BGM</h3><p>실제로 재생된 음원 파일과 재생 위치·반복·음량을 저장합니다. 다운로드가 실패하면 누락을 표시하며 직접 파일을 연결할 수 있습니다.</p><h3>범위</h3><p>기록 이후의 변화와 시작 당시 브라우저에 로드된 정보가 대상입니다. 과거의 전체 채팅, 타인의 비공개 내용, 숨겨진 카드 앞면은 수집하지 않습니다. 기록자에게 보이는 비공개 채팅은 포함될 수 있습니다.</p><h3>화면 기록</h3><p>화면 영상은 녹화하지 않습니다. 3D 캔버스와 외부 iframe 내부는 DOM 기록으로 복원되지 않습니다. 접근 제한이 있는 자산은 원본 파일 저장에 실패할 수 있습니다. 파일은 1 GB 이하이며, 긴 세션은 나누어 기록하세요.</p><h3>호환성</h3><p>기록기는 Chrome/Edge 116 이상, 코코포리아 1.37.4 내부 구조 기준의 비공식 도구입니다. 서비스 업데이트 시 확인이 필요합니다. 연결 실패와 자산 누락은 파일에 남습니다.</p><p>키보드: Space 재생 · ←/→ 10초 이동 · / 채팅 검색</p>`,
  );
let repairURL: string | undefined;
$("#dialog-body").onclick = (e) => {
  const b = (e.target as HTMLInputElement).closest<HTMLElement>(
    "[data-repair]",
  );
  if (b) {
    repairURL = b.dataset.repair;
    $("#repair-file").click();
  }
};
$("#repair-file").onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file && repairURL) {
    const link = URL.createObjectURL(file);
    current!.assets.set(repairURL, link);
    current!.rawAssets?.set(repairURL, file);
    const prev = current!.release;
    current!.release = () => {
      prev();
      URL.revokeObjectURL(link);
    };
    engine?.stop();
    engine = new AudioEngine(current!.data, current!.assets, notify);
    renderScene(true);
    $("#dialog").close();
    notify("파일을 연결했습니다. 저장 버튼으로 새 기록에 포함할 수 있어요.");
  }
  (e.target as HTMLInputElement).value = "";
};
$("#inspector-content").onclick = (e) => {
  const m = (e.target as HTMLInputElement).closest<HTMLElement>(
    "[data-message-time]",
  );
  if (m) return seek(Number(m.dataset.messageTime));
  const t = (e.target as HTMLInputElement).closest<HTMLElement>(
    "[data-token-select]",
  );
  if (t) {
    selected = t.dataset.tokenSelect || null;
    renderScene(true);
    renderInspector();
    const token = frameAt(current!.data.frames, time)?.tokens.find(
      (x) => x.id === selected,
    );
    if (token) dialog(token.name, `<p>${esc(token.memo)}</p>${stats(token)}`);
  }
};
$("#world").onclick = (e) => {
  const b = (e.target as HTMLInputElement).closest<HTMLElement>("[data-token]");
  if (b) {
    selected = b.dataset.token || null;
    tab = "tokens";
    renderInspector();
    renderScene(true);
  }
};
function recordedIdAt(e: {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}) {
  const f = replayer?.iframe;
  if (!f?.contentDocument) return null;
  const r = f.getBoundingClientRect();
  return f.contentDocument
    .elementFromPoint(
      ((e.clientX - r.left) * f.clientWidth) / r.width,
      ((e.clientY - r.top) * f.clientHeight) / r.height,
    )
    ?.closest<HTMLElement>("[data-field-object]")
    ?.getAttribute("data-field-object");
}
function hideTokenTip() {
  tokenTooltip.hide();
  $("#token-tooltip").hidden = true;
  replayer?.iframe?.contentDocument
    ?.getElementById("ccreplay-live-tooltip")
    ?.remove();
}
function hover(e: {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}) {
  const b = (e.target as HTMLInputElement).closest<HTMLElement>(
    "[data-token],[data-recorded],[data-field-object]",
  );
  if (!b) {
    hideTokenTip();
    return;
  }
  const f = frameAt(current!.data.frames, time);
  if (!f) return;
  const id =
    b.dataset.token ||
    recordedIdAt(e) ||
    b.dataset.recorded ||
    b.getAttribute("data-field-object");
  const token = [...f.tokens, ...f.items].find((t) => t.id === id),
    text = token?.memo || token?.text;
  if (!text) {
    hideTokenTip();
    return;
  }
  const iframe = replayer?.iframe,
    doc = iframe?.contentDocument;
  if (!doc) return;
  const anchor =
    (e.target as HTMLInputElement)
      .closest<HTMLElement>("[data-field-object]")
      ?.querySelector("img") || b;
  tokenTooltip.show(doc, anchor, text);
}
$("#replay-interaction").onpointermove = hover;
$("#replay-interaction").onpointerleave = hideTokenTip;
$("#replay-interaction").onclick = (e) => {
  const hit = (e.target as HTMLInputElement).closest<HTMLElement>(
    "[data-recorded]",
  );
  if (hit) {
    selected = recordedIdAt(e) || null;
    if (selected) showInspector("tokens");
  }
};
$("#world").onpointermove = hover;
$("#world").onpointerleave = () => ($("#token-tooltip").hidden = true);
$("#world").addEventListener("focusin", (e) => {
  const b = (e.target as HTMLInputElement).closest<HTMLElement>("[data-token]");
  if (b) {
    const r = b.getBoundingClientRect();
    hover({ target: b, clientX: r.right, clientY: r.top });
  }
});
$("#world").addEventListener(
  "focusout",
  () => ($("#token-tooltip").hidden = true),
);
let drag: { x: number; y: number; px: number; py: number } | null;
$("#board").onpointerdown = (e) => {
  if ((e.target as HTMLInputElement).closest<HTMLElement>("button")) return;
  drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  $("#board").setPointerCapture(e.pointerId);
};
$("#board").onpointermove = (e) => {
  if (drag) {
    pan = { x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y };
    fitWorld();
  }
};
$("#board").onpointerup = () => (drag = null);
$("#board").onpointercancel = () => (drag = null);
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName || "",
    ) ||
    $("#dialog").open
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    toggle();
  }
  if (e.key === "ArrowLeft") seek(time - 10000);
  if (e.key === "ArrowRight") seek(time + 10000);
  if (e.key === "/") {
    e.preventDefault();
    showInspector("chat");
    $("#search").focus();
  }
});
let depth = 0;
document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  e.preventDefault();
  depth++;
  $("#drop-overlay").hidden = false;
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("dragleave", () => {
  if (--depth <= 0) $("#drop-overlay").hidden = true;
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  depth = 0;
  $("#drop-overlay").hidden = true;
  openFile(e.dataTransfer?.files[0]);
});
new ResizeObserver(() => {
  fitWorld();
  fitReplay();
}).observe($("#stage"));
function tick(now: number) {
  if (playing && current) {
    time = Math.min(current!.data.duration, time + (now - last) * speed);
    if (now - renderStamp > 80) {
      renderScene();
      renderTransport();
      engine!.sync(time, true, speed, volume);
      syncOriginal();
      renderStamp = now;
    }
    if (now - chatStamp > 500) {
      renderInspector();
      chatStamp = now;
    }
    if (time >= current!.data.duration) pause();
  }
  last = now;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.addEventListener("pagehide", () => {
  engine?.stop();
  current?.release();
});
const disposeReplayTools = registerReplayTools(document.modelContext, {
  duration: () => current?.data.duration,
  seek(milliseconds) {
    seek(milliseconds);
    return time;
  },
  search(text) {
    query = text;
    $("#search").value = text;
    showInspector("chat");
    return messagesAt(current!.data.messages, current!.data.duration).filter(
      (message) =>
        (message.name + " " + message.text + " " + message.channelName)
          .toLowerCase()
          .includes(text.toLowerCase()),
    ).length;
  },
});
window.addEventListener("pagehide", disposeReplayTools, { once: true });
$("#close-chat").onclick = () => {
  $("#replay-page").classList.remove("inspect-open");
  $("#replay-page").classList.add("chat-closed");
  fitWorld();
};
$("#chat-toggle").onclick = () => showInspector("chat");
$("#inspect-toggle").onclick = () => {
  $("#replay-page").classList.contains("inspect-open")
    ? $("#replay-page").classList.remove("inspect-open")
    : showInspector("chat");
};
$("#chat-settings").onclick = () => {
  showInspector("chat");
  $("#search").focus();
};
for (const id of ["more", "room-menu"])
  $("#" + id).onclick = () =>
    ($("#replay-menu").hidden = !$("#replay-menu").hidden);
$("#menu-assets").onclick = () => {
  $("#replay-menu").hidden = true;
  showAssets();
};
$("#load-demo").addEventListener(
  "click",
  () => ($("#replay-menu").hidden = true),
);
$("#help").addEventListener("click", () => ($("#replay-menu").hidden = true));
document.addEventListener("click", (e) => {
  if (
    !(e.target as HTMLInputElement).closest<HTMLElement>(
      "#replay-menu,#more,#room-menu",
    )
  )
    $("#replay-menu").hidden = true;
});
if (matchMedia("(max-width:600px)").matches)
  $("#replay-page").classList.add("chat-closed");
paintIcons();
const initial = demoRecording();
initial.title = "리플레이 파일을 열어주세요";
initial.duration = 0;
initial.demo = false;
initial.frames = [
  {
    ...initial.frames[0],
    t: 0,
    room: {
      ...initial.frames[0].room,
      name: initial.title,
      backgroundColor: "#202020",
      backgroundUrl: "",
      foregroundUrl: "",
      fieldWidth: 40,
      fieldHeight: 30,
    },
    tokens: [],
    items: [],
    bgm: [],
  },
];
initial.messages = [];
initial.audio = [];
initial.events = [];
initial.assets = [];
load({ data: initial, assets: new Map(), release() {} }, false);

fetch("./welcome.ccreplay")
  .then((r) => r.blob())
  .then((blob) => readArchive(new File([blob], "welcome.ccreplay")))
  .then((recording) => {
    if (current!.data !== initial) return recording.release();
    const meta = recording.data.events.find((e) => e.type === 4);
    if (!meta) return recording.release();
    meta.data.width = innerWidth;
    meta.data.height = Math.max(
      100,
      innerHeight -
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--dock"),
        ),
    );
    return load(recording, false);
  })
  .catch(() => {});

$("#volume-control").onclick = () =>
  ($("#volume-panel").hidden = !$("#volume-panel").hidden);
$("#master-volume").oninput = (e) => {
  volume = +(e.target as HTMLInputElement).value;
  $("#volume").value = String(volume);
  engine?.sync(time, playing, speed, volume);
};

const library = mountLibrary({
  load,
  pause,
  showReplay: () => page("replay"),
  showRecord: () => page("record"),
  openFile: () => $("#file").click(),
});
$("#library-back").onclick = () => library.back();
