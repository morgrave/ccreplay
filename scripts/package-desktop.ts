import { build, Platform } from "electron-builder";
import { chromium } from "playwright";
import { dirname } from "node:path";
import { access } from "node:fs/promises";
if (process.platform !== "win32")
  throw Error("Windows 실행 파일은 Windows에서 빌드하세요.");
await access(chromium.executablePath()).catch(() => {
  throw Error("먼저 npm run desktop:install로 Chromium을 설치하세요.");
});
await build({
  targets: Platform.WINDOWS.createTarget("zip"),
  config: {
    appId: "io.ccreplay.recorder",
    productName: "CCReplay Recorder",
    directories: { output: "release" },
    files: ["desktop-dist/**", "package.json"],
    extraResources: [
      {
        from: dirname(chromium.executablePath()),
        to: "chromium",
        filter: ["**/*"],
      },
      { from: "record.config.json", to: "record.config.json" },
    ],
    asar: true,
    win: {
      signAndEditExecutable: false,
      artifactName: "CCReplay-Recorder-${version}-Windows.${ext}",
    },
    npmRebuild: false,
    publish: null,
  },
});
