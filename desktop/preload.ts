import { contextBridge, ipcRenderer } from "electron";
import type { RecorderAPI, DesktopState, StartRequest } from "./types.ts";

const api: RecorderAPI = {
  state: () => ipcRenderer.invoke("recorder:state"),
  start: (request: StartRequest) =>
    ipcRenderer.invoke("recorder:start", request),
  stop: () => ipcRenderer.invoke("recorder:stop"),
  reload: () => ipcRenderer.invoke("recorder:reload"),
  openConfig: () => ipcRenderer.invoke("recorder:config"),
  chooseOutput: () => ipcRenderer.invoke("recorder:folder"),
  openOutput: () => ipcRenderer.invoke("recorder:output"),
  recover: () => ipcRenderer.invoke("recorder:recover"),
  subscribe: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopState) =>
      callback(state);
    ipcRenderer.on("recorder:update", listener);
    return () => ipcRenderer.removeListener("recorder:update", listener);
  },
};
contextBridge.exposeInMainWorld("recorder", api);
