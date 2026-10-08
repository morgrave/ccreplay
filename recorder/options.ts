import { parseArgs } from "node:util";
import { resolve } from "node:path";

export function roomURL(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== "https://ccfolia.com" ||
    url.username ||
    url.password ||
    !/^\/rooms\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
  )
    throw Error("https://ccfolia.com/rooms/방ID 형식의 주소를 입력하세요.");
  url.hash = "";
  url.search = "";
  return url.href;
}
export function parseOptions(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      duration: { type: "string" },
      out: { type: "string" },
      title: { type: "string" },
      recover: { type: "string" },
      help: { type: "boolean", short: "h" },
      "no-trim": { type: "boolean" },
      padding: { type: "string" },
      config: { type: "string" },
      room: { type: "string" },
      list: { type: "boolean" },
    },
  });
  const duration =
    values.duration === undefined ? undefined : Number(values.duration);
  const padding = values.padding === undefined ? 5 : Number(values.padding);
  if (!Number.isFinite(padding) || padding < 0 || padding > 3600)
    throw Error("--padding은 0~3600초 사이의 숫자입니다.");
  if (
    duration !== undefined &&
    (!Number.isFinite(duration) || duration <= 0 || duration > 86400)
  )
    throw Error("--duration은 0보다 크고 86400 이하인 초 단위 숫자입니다.");
  if (
    positionals.length > 1 ||
    [!!values.recover, !!positionals[0], !!values.room, !!values.list].filter(
      Boolean,
    ).length > 1
  )
    throw Error("방 주소, --room, --list, --recover 중 하나만 지정하세요.");
  return {
    help: !!values.help,
    trim: !values["no-trim"],
    padding: padding * 1000,
    duration,
    title: values.title,
    config: resolve(values.config || "record.config.json"),
    room: values.room,
    list: !!values.list,
    overrides: {
      duration,
      title: values.title,
      out: values.out,
      trim: values["no-trim"] === undefined ? undefined : false,
      padding: values.padding === undefined ? undefined : padding * 1000,
    },
    recover: values.recover && resolve(values.recover),
    url: positionals[0] ? roomURL(positionals[0]) : undefined,
    out: resolve(
      values.out ||
        `recordings/CCReplay-${new Date().toISOString().replace(/[:.]/g, "-")}.ccreplay`,
    ),
  };
}
