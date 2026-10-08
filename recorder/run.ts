import { chromium } from "playwright";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { RecordingStore, exportSession } from "./storage.ts";
import type { ExternalRecord } from "../src/core/types.ts";

export interface RecordOptions {
  url: string;
  out: string;
  title?: string;
  duration?: number;
  trim?: boolean;
  padding?: number;
  signal: AbortSignal;
  log?: (message: string) => void;
}

export async function recordRoom(options: RecordOptions) {
  options.signal.throwIfAborted();
  const exists = await access(options.out).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  if (exists)
    throw Error(
      "출력 파일이 이미 있습니다. 다른 --out 경로를 지정하세요: " + options.out,
    );
  const log = options.log || console.log;
  const store = new RecordingStore(options.out + ".session", {
    roomUrl: options.url,
    title: options.title,
    startedAt: Date.now(),
  });
  await store.init();
  log("복구용 기록 폴더: " + store.directory);
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./browser.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    write: false,
    minify: true,
  });
  const browser = await chromium.launch({
    headless: true,
    // Finish the recorder's final batch before closing Chromium on Ctrl+C.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--mute-audio",
    ],
  });
  let started = false;
  let fatal: unknown;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const fail = (error: unknown) => {
    fatal ||= error;
    finish();
  };
  const abort = () => {
    finish();
    if (!started) void browser.close().catch(() => {});
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: ReturnType<typeof setInterval> | undefined;
  let batchCount = 0;
  let recordCount = 0;
  const binding = "__ccReplayWrite_" + randomUUID().replaceAll("-", "");
  try {
    options.signal.addEventListener("abort", abort, { once: true });
    options.signal.throwIfAborted();
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      locale: "ko-KR",
    });
    const page = await context.newPage();
    await page.exposeBinding(
      binding,
      async ({ frame }, records: ExternalRecord[]) => {
        if (
          frame !== page.mainFrame() ||
          new URL(frame.url()).origin !== "https://ccfolia.com"
        )
          return;
        try {
          await store.append(records);
          batchCount++;
          recordCount += records.length;
        } catch (error) {
          fail(error);
          throw error;
        }
      },
    );
    page.on("crash", () => fail(Error("자동 기록 브라우저가 중단되었습니다.")));
    browser.on("disconnected", () => {
      if (started) fail(Error("자동 기록 브라우저의 연결이 끊겼습니다."));
    });
    log("코코포리아 방에 접속하고 초기 상태를 기다리는 중…");
    await page.goto(options.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.evaluate(
      `window.__ccReplayWrite = window[${JSON.stringify(binding)}];`,
    );
    await page.evaluate(bundle.outputFiles[0].text);
    await page.waitForFunction(() => window.__ccReplayAuto.ready(), undefined, {
      timeout: 60000,
      polling: 500,
    });
    // Let the first independent room/chat subscriptions settle before the t=0 snapshot.
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready.then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]),
    );
    await page.waitForTimeout(2000);
    if (options.signal.aborted) throw Error("기록 시작 전에 종료되었습니다.");
    await page.evaluate(() => window.__ccReplayAuto.start());
    started = true;
    log(
      "기록 중 · Enter 또는 Ctrl+C로 종료하고 저장합니다." +
        (options.duration ? ` · ${options.duration}초 후 자동 종료` : ""),
    );
    // A navigation destroys the capture hook. Preserve the partial session instead of silently losing time.
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame())
        fail(Error("방 페이지가 이동되어 기록을 종료합니다."));
    });
    page.on("close", () => {
      if (started) fail(Error("방 페이지가 닫혔습니다."));
    });
    if (options.duration) timer = setTimeout(finish, options.duration * 1000);
    status = setInterval(
      () => log(`기록 중 · 수신 ${recordCount}개 · 저장 ${batchCount}회`),
      30000,
    );
    await finished;
    try {
      await page.evaluate(() => window.__ccReplayAuto.stop());
    } catch (error) {
      fatal ||= error;
    }
  } catch (error) {
    fatal ||= error;
  } finally {
    started = false;
    if (timer) clearTimeout(timer);
    if (status) clearInterval(status);
    options.signal.removeEventListener("abort", abort);
    await browser.close();
  }
  log("남은 자산을 저장하고 리플레이를 만드는 중…");
  await store.finish();
  if (fatal)
    await store.append([
      {
        kind: "warning",
        text: fatal instanceof Error ? fatal.message : String(fatal),
      },
    ]);
  let data;
  try {
    data = await exportSession(store.directory, options.out, !!fatal, options);
  } catch (error) {
    if (fatal)
      throw Error(
        `${fatal instanceof Error ? fatal.message : String(fatal)}\n리플레이 저장 실패: ${error instanceof Error ? error.message : String(error)}\n복구용 기록: ${store.directory}`,
      );
    throw error;
  }
  log(
    `저장 완료: ${options.out}\n방 상태 ${data.frames.length}개 · 채팅 ${data.messages.length}개 · BGM 이벤트 ${data.audio.length}개 · 자산 ${data.assets.length}개 · 주의 ${data.warnings?.length || 0}건`,
  );
  if (data.trim)
    log(
      `앞뒤 정리: ${(data.trim.sourceDuration / 1000).toFixed(1)}초 → ${(data.duration / 1000).toFixed(1)}초 · 앞 ${(data.trim.start / 1000).toFixed(1)}초 / 뒤 ${((data.trim.sourceDuration - data.trim.end) / 1000).toFixed(1)}초 제거`,
    );
  if (fatal)
    throw Error(
      "기록이 중단되어 부분 리플레이를 저장했습니다: " +
        (fatal instanceof Error ? fatal.message : String(fatal)),
    );
  return data;
}
