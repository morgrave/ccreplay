import { parseOptions } from "../recorder/options.ts";
import { recordRoom } from "../recorder/run.ts";
import { exportSession } from "../recorder/storage.ts";
import { createInterface, type Interface } from "node:readline";

const help = `자동 코코포리아 기록기

npm run record -- https://ccfolia.com/rooms/방ID [--duration 초] [--out 파일.ccreplay] [--title 제목]
npm run record -- --recover 기록.session --out 복구.ccreplay

기본적으로 변화 없는 앞뒤를 자르고 5초씩 여유를 남깁니다.
--padding 10: 여유 10초 / --no-trim: 전체 시간 보존

--duration을 생략하면 Enter 또는 Ctrl+C로 종료할 때까지 기록합니다.
처음 한 번 npm run record:install로 전용 브라우저를 설치하세요.
기록 중에는 이 PC/서버가 켜져 있어야 합니다. 확장 프로그램·계정 로그인은 필요하지 않습니다.
파일과 복구용 .session 폴더는 기본적으로 recordings/에 저장됩니다.`;

const controller = new AbortController();
let terminal: Interface | undefined;
const stop = () => {
  if (controller.signal.aborted) return;
  console.log("종료 요청을 받았습니다. 저장이 끝날 때까지 기다려 주세요.");
  controller.abort();
};
try {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) console.log(help);
  else if (options.recover) {
    const data = await exportSession(
      options.recover,
      options.out,
      true,
      options,
    );
    console.log(
      `복구 완료: ${options.out} · 주의 ${data.warnings?.length || 0}건`,
    );
  } else {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    // Readline handles Ctrl+C as input on Windows, avoiding an npm/cmd process-tree
    // interrupt that could otherwise terminate the process before ZIP export finishes.
    if (process.stdin.isTTY) {
      terminal = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });
      terminal.on("line", stop);
      terminal.on("SIGINT", stop);
    }
    await recordRoom({
      ...options,
      url: options.url!,
      signal: controller.signal,
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  terminal?.close();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
