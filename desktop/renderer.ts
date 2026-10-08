import type { DesktopState } from "./types.ts";

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const room = element<HTMLSelectElement>("room");
let current: DesktopState | undefined;
let configSignature = "";
let lastLogs: DesktopState["logs"] = [];
function roomSettings() {
  const selected = current?.config?.rooms.find((r) => r.id === room.value);
  if (!selected) return;
  const settings = { ...current?.config?.defaults, ...selected };
  element<HTMLInputElement>("title").value = settings.title || selected.name;
  element<HTMLInputElement>("duration").value = String(
    settings.duration ?? 86400,
  );
  element<HTMLInputElement>("padding").value = String(settings.padding ?? 5);
  element<HTMLInputElement>("trim").checked = settings.trim ?? true;
  element("room-url").textContent = selected.url;
}
function render(state: DesktopState) {
  current = state;
  const signature = JSON.stringify(state.config);
  if (signature !== configSignature) {
    configSignature = signature;
    const selection = room.value;
    room.replaceChildren(
      ...(state.config?.rooms || []).map((r) => {
        const option = document.createElement("option");
        option.value = r.id;
        option.textContent = r.name;
        return option;
      }),
    );
    if (state.config?.rooms.some((r) => r.id === selection))
      room.value = selection;
    roomSettings();
  }
  const p = state.progress;
  const status = state.active
    ? state.stopping || p?.phase === "saving"
      ? "저장 중"
      : p?.phase === "recording"
        ? "● 기록 중"
        : "방 준비 중"
    : state.error
      ? "확인 필요"
      : state.output
        ? "저장 완료"
        : "시작 준비 완료";
  element("status").textContent = status;
  element("status").classList.toggle(
    "recording",
    state.active && p?.phase === "recording" && !state.stopping,
  );
  for (const id of [
    "room",
    "title",
    "duration",
    "padding",
    "trim",
    "reload",
    "folder",
    "recover",
    "config",
  ])
    (element(id) as HTMLInputElement).disabled = state.active;
  element<HTMLButtonElement>("start").disabled = state.active || !state.config;
  element<HTMLButtonElement>("stop").disabled = !state.active || state.stopping;
  const seconds = Math.floor((p?.elapsed || 0) / 1000);
  element("elapsed").textContent = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
  for (const id of ["frames", "messages", "audio", "assets"] as const)
    element(id).textContent = (p?.[id] || 0).toLocaleString("ko-KR");
  element("asset-status").textContent =
    `자산 다운로드 대기 ${p?.pendingAssets || 0}개 · ${((p?.bytes || 0) / 1024 / 1024).toFixed(1)} MiB · 실패 ${p?.assetErrors || 0}개`;
  element("error").hidden = !state.error;
  element("error").textContent = state.error || "";
  element("result").hidden = !state.output;
  element("result").textContent = state.output
    ? `리플레이 파일: ${state.output}`
    : "";
  element("config-path").textContent = state.configPath;
  element("output-path").textContent = state.outputDir;
  // Append only new log lines so scrolling and accessibility announcements stay stable.
  const logs = element("logs");
  const overlap = lastLogs.length
    ? state.logs.findIndex(
        (l) => l.time === lastLogs[0].time && l.text === lastLogs[0].text,
      )
    : -1;
  if (overlap < 0 || state.logs.length < lastLogs.length) {
    logs.replaceChildren();
    lastLogs = [];
  }
  const additions = state.logs.slice(lastLogs.length);
  for (const entry of additions) {
    const row = document.createElement("div");
    row.className = "entry";
    const time = document.createElement("time");
    time.textContent = new Date(entry.time).toLocaleTimeString("en-GB", {
      hour12: false,
    });
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = entry.text;
    row.append(time, text);
    logs.append(row);
  }
  lastLogs = state.logs;
  if (additions.length && element<HTMLInputElement>("follow").checked)
    logs.scrollTop = logs.scrollHeight;
}
async function act(action: () => Promise<unknown>) {
  try {
    await action();
    render(await window.recorder.state());
  } catch (error) {
    element("error").hidden = false;
    element("error").textContent = String(error).replace(/^Error: /, "");
  }
}
room.addEventListener("change", roomSettings);
element("start").addEventListener(
  "click",
  () =>
    void act(() =>
      window.recorder.start({
        roomId: room.value,
        title: element<HTMLInputElement>("title").value,
        duration: Number(element<HTMLInputElement>("duration").value),
        padding: Number(element<HTMLInputElement>("padding").value),
        trim: element<HTMLInputElement>("trim").checked,
      }),
    ),
);
for (const [id, action] of Object.entries({
  stop: window.recorder.stop,
  reload: window.recorder.reload,
  config: window.recorder.openConfig,
  folder: window.recorder.chooseOutput,
  output: window.recorder.openOutput,
  recover: window.recorder.recover,
}))
  element(id).addEventListener("click", () => void act(action));
window.recorder.subscribe(render);
void act(async () => render(await window.recorder.state()));
