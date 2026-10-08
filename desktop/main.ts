import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { readConfig, configuredOptions } from "../recorder/config.ts";
import { recordRoom } from "../recorder/run.ts";
import { exportSession } from "../recorder/storage.ts";
import type { DesktopState, StartRequest } from "./types.ts";

let window: BrowserWindow;
let controller: AbortController | undefined;
let task: Promise<void> | undefined;
let closing = false;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
const state: DesktopState = {
  configPath: "",
  outputDir: "",
  active: false,
  stopping: false,
  logs: [],
};
const root = app.getAppPath();
const appDir = app.isPackaged ? dirname(process.execPath) : root;
const settingsDir = app.isPackaged ? process.resourcesPath : root;
// Keep portable app state beside the executable instead of in AppData.
const runtimeDir = join(
  appDir,
  app.isPackaged ? ".runtime" : "work/desktop-runtime",
);
mkdirSync(runtimeDir, { recursive: true });
app.setPath("userData", runtimeDir);
app.setPath("sessionData", runtimeDir);
const entryURL = pathToFileURL(join(root, "desktop-dist/index.html")).href;
function publish() {
  // Coalesce batches and asset completions; the renderer receives at most four updates/sec.
  if (updateTimer) return;
  updateTimer = setTimeout(() => {
    updateTimer = undefined;
    if (!window.isDestroyed())
      window.webContents.send("recorder:update", state);
  }, 250);
}
function log(text: string) {
  state.logs.push({ time: Date.now(), text });
  if (state.logs.length > 300) state.logs.splice(0, state.logs.length - 300);
  publish();
}
async function reload() {
  if (state.active) throw Error("기록이 끝난 뒤 설정을 다시 불러오세요.");
  try {
    state.config = await readConfig(state.configPath);
    state.error = undefined;
    log(`방 ${state.config.rooms.length}개를 불러왔습니다.`);
  } catch (error) {
    state.config = undefined;
    state.error = error instanceof Error ? error.message : String(error);
    log(state.error);
  }
  publish();
}
function validateRequest(input: unknown): StartRequest {
  if (!input || typeof input !== "object")
    throw Error("기록 설정을 확인하세요.");
  const r = input as StartRequest;
  if (
    typeof r.roomId !== "string" ||
    typeof r.title !== "string" ||
    !r.title.trim() ||
    r.title.length > 200 ||
    typeof r.trim !== "boolean" ||
    typeof r.duration !== "number" ||
    !Number.isFinite(r.duration) ||
    r.duration <= 0 ||
    r.duration > 86400 ||
    typeof r.padding !== "number" ||
    !Number.isFinite(r.padding) ||
    r.padding < 0 ||
    r.padding > 3600
  )
    throw Error(
      "제목, 최대 기록 시간(1~86400초), 여유 시간(0~3600초)을 확인하세요.",
    );
  return r;
}
async function start(input: unknown) {
  if (state.active) throw Error("이미 기록 또는 저장 중입니다.");
  const r = validateRequest(input);
  const config = await readConfig(state.configPath);
  const room = config.rooms.find((room) => room.id === r.roomId);
  if (!room) throw Error("설정에 등록된 방을 선택하세요.");
  const options = configuredOptions(config, room, state.outputDir);
  const out = options.out;
  state.active = true;
  state.stopping = false;
  state.error = undefined;
  state.output = undefined;
  state.progress = undefined;
  state.logs = [];
  controller = new AbortController();
  log(`${room.name} · ${r.title.trim()} 기록을 준비합니다.`);
  task = (async () => {
    try {
      await recordRoom({
        ...options,
        out,
        title: r.title.trim(),
        duration: r.duration,
        trim: r.trim,
        padding: r.padding * 1000,
        signal: controller!.signal,
        captureScript: join(root, "desktop-dist/capture.js"),
        executablePath: app.isPackaged
          ? join(process.resourcesPath, "chromium/chrome.exe")
          : undefined,
        log,
        onProgress: (progress) => {
          state.progress = progress;
          publish();
        },
      });
      state.output = out;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      // A recoverable partial replay can exist even after a browser failure.
      if (
        await access(out).then(
          () => true,
          () => false,
        )
      )
        state.output = out;
      log("오류 · " + state.error);
    } finally {
      state.active = false;
      state.stopping = false;
      controller = undefined;
      publish();
    }
  })();
}
function stop() {
  if (controller && !state.stopping) {
    state.stopping = true;
    log(
      "종료 요청 · 마지막 기록과 자산을 저장합니다. 창을 닫아도 저장이 끝날 때까지 기다립니다.",
    );
    controller.abort();
    publish();
  }
}
async function recover() {
  if (state.active) throw Error("기록이 끝난 뒤 복구하세요.");
  const selected = await dialog.showOpenDialog(window, {
    title: "복구할 .session 폴더 선택",
    properties: ["openDirectory"],
  });
  if (selected.canceled) return;
  const output = await dialog.showSaveDialog(window, {
    title: "복구 리플레이 저장",
    defaultPath: join(state.outputDir, "복구.ccreplay"),
    filters: [{ name: "CC Replay", extensions: ["ccreplay"] }],
  });
  if (!output.filePath) return;
  state.active = true;
  state.stopping = true;
  state.error = undefined;
  state.output = undefined;
  state.progress = undefined;
  log("복구용 기록에서 리플레이를 만드는 중…");
  task = (async () => {
    try {
      await exportSession(selected.filePaths[0], output.filePath!, true, {
        trim: true,
        padding: 5000,
      });
      state.output = output.filePath;
      log("복구 완료: " + state.output);
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log("복구 실패 · " + state.error);
    } finally {
      state.active = false;
      state.stopping = false;
      publish();
    }
  })();
}

app
  .whenReady()
  .then(async () => {
    state.configPath = join(settingsDir, "record.config.json");
    state.outputDir = join(appDir, "recordings");
    try {
      const preferences = JSON.parse(
        await readFile(join(settingsDir, "preferences.json"), "utf8"),
      );
      if (typeof preferences.outputDir === "string" && preferences.outputDir)
        state.outputDir = preferences.outputDir;
    } catch {}
    window = new BrowserWindow({
      width: 1100,
      height: 940,
      minWidth: 850,
      minHeight: 650,
      title: "CC Replay 기록기",
      backgroundColor: "#10141d",
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(root, "desktop-dist/preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    const handlers: Record<string, (input?: unknown) => unknown> = {
      state: () => state,
      start,
      stop,
      reload,
      recover,
      config: async () => {
        const error = await shell.openPath(state.configPath);
        if (error) throw Error(error);
      },
      output: async () => {
        await mkdir(state.outputDir, { recursive: true });
        const error = await shell.openPath(state.outputDir);
        if (error) throw Error(error);
      },
      folder: async () => {
        if (state.active) throw Error("기록이 끝난 뒤 저장 폴더를 변경하세요.");
        const result = await dialog.showOpenDialog(window, {
          title: "리플레이 저장 폴더",
          defaultPath: state.outputDir,
          properties: ["openDirectory", "createDirectory"],
        });
        if (!result.canceled) {
          state.outputDir = result.filePaths[0];
          await writeFile(
            join(settingsDir, "preferences.json"),
            JSON.stringify({ outputDir: state.outputDir }),
          );
          publish();
        }
      },
    };
    for (const [name, handler] of Object.entries(handlers))
      ipcMain.handle("recorder:" + name, (event, input) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== entryURL
        )
          throw Error("허용되지 않은 요청입니다.");
        return handler(input);
      });
    window.on("close", (event) => {
      if (!state.active || closing) return;
      event.preventDefault();
      stop();
      void task?.finally(() => {
        closing = true;
        window.close();
      });
    });
    await window.loadURL(entryURL);
    await reload();
  })
  .catch((error) => {
    dialog.showErrorBox("기록기를 시작하지 못했습니다", String(error));
    app.quit();
  });
app.on("window-all-closed", () => app.quit());
