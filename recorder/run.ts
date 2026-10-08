import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { RecordingStore, exportSession } from "./storage.ts";
import { prepareChatTabs } from "./chat.ts";
import { CaptureProgress, type RecorderProgress } from "./progress.ts";
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
  /** Prebuilt capture hook and bundled Chromium for the desktop distribution. */
  captureScript: string;
  executablePath?: string;
  onProgress?: (progress: RecorderProgress) => void;
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
      "출력 파일이 이미 있습니다. 다른 파일 이름을 지정하세요: " + options.out,
    );
  const log = options.log || console.log;
  const store = new RecordingStore(options.out + ".session", {
    roomUrl: options.url,
    title: options.title,
    startedAt: Date.now(),
  });
  await store.init();
  log("복구용 기록 폴더: " + store.directory);
  const captureScript = await readFile(options.captureScript, "utf8");
  const progress = new CaptureProgress();
  const report = (phase: RecorderProgress["phase"]) =>
    options.onProgress?.({
      ...progress.snapshot(),
      ...store.stats(),
      phase,
    });
  report("connecting");
  const browser = await chromium.launch({
    headless: true,
    executablePath: options.executablePath,
    // The host owns shutdown so the final journal batch is acknowledged first.
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
  let chatTimer: ReturnType<typeof setInterval> | undefined;
  let chatTask: Promise<void> | undefined;
  const chatController = new AbortController();
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
          for (const message of progress.observe(records)) log(message);
          report("recording");
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
    await page.evaluate(captureScript);
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
    const preparedChannels = new Set<string>();
    const warnedChannels = new Set<string>();
    const prepareChats = async (signal: AbortSignal) => {
      try {
        await prepareChatTabs(page, preparedChannels, log, signal);
      } catch (error) {
        if (signal.aborted) return;
        const text =
          "채팅 탭 초기 대화 준비 실패 (새 메시지 수집은 계속됩니다): " +
          (error instanceof Error ? error.message : String(error));
        if (!warnedChannels.has(text)) {
          warnedChannels.add(text);
          log(text);
          await store.append([{ kind: "warning", text }]);
        }
      }
    };
    await prepareChats(options.signal);
    log("초기 방 데이터와 공개 채팅 구독이 안정될 때까지 기다리는 중…");
    let preparationKey = "",
      stableSince = Date.now();
    const preparationDeadline = Date.now() + 30000;
    while (
      Date.now() - stableSince < 2000 &&
      Date.now() < preparationDeadline
    ) {
      options.signal.throwIfAborted();
      const next = await page.evaluate(() =>
        window.__ccReplayAuto.preparationKey(),
      );
      if (next !== preparationKey) {
        preparationKey = next;
        stableSince = Date.now();
      }
      await page.waitForTimeout(250);
    }
    if (Date.now() - stableSince < 2000) {
      const text =
        "초기 구독 안정화가 30초 안에 끝나지 않았습니다. 수신된 상태부터 기록합니다.";
      log(text);
      await store.append([{ kind: "warning", text }]);
    }
    if (options.signal.aborted) throw Error("기록 시작 전에 종료되었습니다.");
    await page.evaluate(() => window.__ccReplayAuto.start());
    started = true;
    progress.start();
    report("recording");
    chatTimer = setInterval(() => {
      if (!chatTask && !chatController.signal.aborted) {
        chatTask = prepareChats(chatController.signal)
          .catch(fail)
          .finally(() => {
            chatTask = undefined;
          });
      }
    }, 30000);
    log(
      "기록 중 · ‘종료하고 저장’ 버튼으로 마칩니다." +
        (options.duration
          ? ` · ${options.duration}초 후 자동 종료`
          : " · 시간 제한 없음"),
    );
    // A navigation destroys the capture hook. Preserve the partial session instead of silently losing time.
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame())
        fail(Error("방 페이지가 이동되어 기록을 종료합니다."));
    });
    page.on("close", () => {
      if (started) fail(Error("방 페이지가 닫혔습니다."));
    });
    if (options.duration !== undefined && options.duration > 0)
      timer = setTimeout(finish, options.duration * 1000);
    status = setInterval(() => report("recording"), 1000);
    await finished;
    progress.stop();
    chatController.abort();
    await chatTask;
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
    if (chatTimer) clearInterval(chatTimer);
    chatController.abort();
    options.signal.removeEventListener("abort", abort);
    await browser.close();
  }
  report("saving");
  log("남은 자산을 저장하고 리플레이를 만드는 중…");
  const savingTimer = setInterval(() => report("saving"), 1000);
  try {
    await store.finish();
  } finally {
    clearInterval(savingTimer);
  }
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
  report("complete");
  if (fatal)
    throw Error(
      "기록이 중단되어 부분 리플레이를 저장했습니다: " +
        (fatal instanceof Error ? fatal.message : String(fatal)),
    );
  return data;
}
