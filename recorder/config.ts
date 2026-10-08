import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { roomURL, type parseOptions } from "./options.ts";

interface Settings {
  title?: string;
  duration?: number;
  trim?: boolean;
  /** Seconds in JSON, milliseconds in the recorder. */
  padding?: number;
  outputDir?: string;
}
export interface ConfigRoom extends Settings {
  id: string;
  name: string;
  url: string;
}
export interface RecorderConfig {
  version: 1;
  defaults: Settings;
  rooms: ConfigRoom[];
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(label + "는 객체여야 합니다.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw Error(label + "는 비어 있지 않은 문자열이어야 합니다.");
  return value.trim();
}
function settings(value: Record<string, unknown>, label: string): Settings {
  const result: Settings = {};
  for (const key of ["title", "outputDir"] as const)
    if (value[key] !== undefined)
      result[key] = text(value[key], label + "." + key);
  if (value.duration !== undefined) {
    if (
      typeof value.duration !== "number" ||
      !Number.isFinite(value.duration) ||
      value.duration <= 0 ||
      value.duration > 86400
    )
      throw Error(
        label + ".duration은 0보다 크고 86400 이하인 초 단위 숫자입니다.",
      );
    result.duration = value.duration;
  }
  if (value.padding !== undefined) {
    if (
      typeof value.padding !== "number" ||
      !Number.isFinite(value.padding) ||
      value.padding < 0 ||
      value.padding > 3600
    )
      throw Error(label + ".padding은 0~3600초 사이의 숫자입니다.");
    result.padding = value.padding;
  }
  if (value.trim !== undefined) {
    if (typeof value.trim !== "boolean")
      throw Error(label + ".trim은 true 또는 false여야 합니다.");
    result.trim = value.trim;
  }
  return result;
}
export function validateConfig(input: unknown): RecorderConfig {
  const root = object(input, "설정");
  if (root.version !== 1) throw Error("설정 version은 1이어야 합니다.");
  if (!Array.isArray(root.rooms) || !root.rooms.length)
    throw Error("rooms에 기록할 방을 하나 이상 등록하세요.");
  const ids = new Set<string>();
  const rooms = root.rooms.map((input: unknown, index: number) => {
    const label = `rooms[${index}]`,
      value = object(input, label);
    const id = text(value.id, label + ".id");
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      throw Error("방 id는 중복 없이 영문·숫자·하이픈·밑줄로 지정하세요.");
    ids.add(id);
    return {
      ...settings(value, label),
      id,
      name: text(value.name, label + ".name"),
      url: roomURL(text(value.url, label + ".url")),
    };
  });
  return {
    version: 1,
    defaults: settings(object(root.defaults || {}, "defaults"), "defaults"),
    rooms,
  };
}
export async function readConfig(path: string): Promise<RecorderConfig> {
  try {
    return validateConfig(
      JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")),
    );
  } catch (error) {
    throw Error(
      `기록 설정을 읽지 못했습니다: ${path}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export function configuredOptions(
  options: ReturnType<typeof parseOptions>,
  config: RecorderConfig,
  room: ConfigRoom,
  now = new Date(),
) {
  const settings = { ...config.defaults, ...room };
  const override = options.overrides;
  const name =
    room.name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/, "")
      .slice(0, 80) || room.id;
  return {
    ...options,
    url: room.url,
    title: override.title ?? settings.title ?? room.name,
    duration: override.duration ?? settings.duration,
    trim: override.trim ?? settings.trim ?? true,
    padding: override.padding ?? (settings.padding ?? 5) * 1000,
    out: override.out
      ? resolve(override.out)
      : resolve(
          dirname(options.config),
          settings.outputDir || "recordings",
          `${name}-${now.toISOString().replace(/[:.]/g, "-")}.ccreplay`,
        ),
  };
}
export function chooseRoom(
  config: RecorderConfig,
  selection: string,
): ConfigRoom | undefined {
  return (
    config.rooms.find((room) => room.id === selection.trim()) ||
    (/^[1-9]\d*$/.test(selection.trim())
      ? config.rooms[Number(selection.trim()) - 1]
      : undefined)
  );
}
