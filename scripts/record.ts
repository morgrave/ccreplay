import { parseOptions } from "../recorder/options.ts";
import { recordRoom } from "../recorder/run.ts";
import { exportSession } from "../recorder/storage.ts";
import { createInterface, type Interface } from "node:readline";
import {
  readConfig,
  configuredOptions,
  chooseRoom,
} from "../recorder/config.ts";

const help = `자동 코코포리아 기록기

npm run record                                  설정의 방 목록에서 선택
npm run record -- --room feria                   이름 대신 설정 id로 바로 시작
npm run record -- --list                         등록된 방 목록 표시
npm run record -- --config 다른설정.json          다른 설정 파일 사용
npm run record -- https://ccfolia.com/rooms/방ID [--duration 초] [--out 파일.ccreplay] [--title 제목]
npm run record -- --recover 기록.session --out 복구.ccreplay

기본적으로 변화 없는 앞뒤를 자르고 5초씩 여유를 남깁니다.
--padding 10: 여유 10초 / --no-trim: 전체 시간 보존

설정에서 선택한 방은 설정의 duration을 따릅니다 (기본 설정: 최대 24시간).
주소를 직접 입력하고 --duration을 생략하면 Enter 또는 Ctrl+C로 종료할 때까지 기록합니다.
처음 한 번 npm run record:install로 전용 브라우저를 설치하세요.
기록 중에는 이 PC/서버가 켜져 있어야 합니다. 확장 프로그램·계정 로그인은 필요하지 않습니다.
파일과 복구용 .session 폴더는 기본적으로 recordings/에 저장됩니다.`;

function question(terminal: Interface): Promise<string | undefined> {
  return new Promise((resolve) => {
    const cancel = () => {
      cleanup();
      resolve(undefined);
    };
    const cleanup = () => {
      terminal.removeListener("SIGINT", cancel);
      terminal.removeListener("close", cancel);
    };
    terminal.once("SIGINT", cancel);
    terminal.once("close", cancel);
    terminal.question("기록할 방 번호 또는 id (q: 취소): ", (answer) => {
      cleanup();
      resolve(answer);
    });
  });
}

const controller = new AbortController();
let terminal: Interface | undefined;
const stop = () => {
  if (controller.signal.aborted) return;
  console.log("종료 요청을 받았습니다. 저장이 끝날 때까지 기다려 주세요.");
  controller.abort();
};
try {
  let options = parseOptions(process.argv.slice(2));
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
    if (!options.url) {
      const config = await readConfig(options.config);
      if (options.list || !options.room) {
        console.log("등록된 코코포리아 방");
        config.rooms.forEach((room, index) =>
          console.log(`  ${index + 1}. ${room.name} (${room.id})`),
        );
      }
      if (options.list) process.exitCode = 0;
      else {
        let selected = options.room
          ? chooseRoom(config, options.room)
          : undefined;
        if (options.room && !selected)
          throw Error("설정에 없는 방 id입니다: " + options.room);
        if (!selected) {
          if (!process.stdin.isTTY)
            throw Error(
              "선택 입력을 받을 수 없습니다. --room id로 방을 지정하세요.",
            );
          terminal = createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
          });
          while (!selected) {
            const answer = await question(terminal);
            if (answer === undefined || answer.trim().toLowerCase() === "q")
              break;
            selected = chooseRoom(config, answer);
            if (!selected) console.log("목록의 번호 또는 id를 입력하세요.");
          }
        }
        if (selected) {
          options = configuredOptions(options, config, selected);
          console.log(
            `선택한 방: ${selected.name} · 제목: ${options.title}\n저장 경로: ${options.out}`,
          );
        }
      }
    }
    if (options.url) {
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      // Readline handles Ctrl+C as input on Windows, avoiding an npm/cmd process-tree
      // interrupt that could otherwise terminate the process before ZIP export finishes.
      if (process.stdin.isTTY) {
        terminal ||= createInterface({
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
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  terminal?.close();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
